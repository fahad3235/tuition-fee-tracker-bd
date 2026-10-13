/* tuition-fee-tracker-bd -- offline XLSX builder (no DOM, no libraries).
   Produces a genuine .xlsx file as a Uint8Array using STORED (uncompressed)
   ZIP entries, so no deflate implementation is needed. Excel, Google Sheets
   and LibreOffice all open stored-entry workbooks.
   Pure-ASCII source: all text arrives as JS strings (already decoded). */
'use strict';

const TFT_XLSX = (function () {

  // ---------- UTF-8 ----------
  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    return Buffer.from(str, 'utf8'); // node fallback
  }
  function concat(arrays) {
    let total = 0;
    arrays.forEach(function (a) { total += a.length; });
    const out = new Uint8Array(total);
    let off = 0;
    arrays.forEach(function (a) { out.set(a, off); off += a.length; });
    return out;
  }

  // ---------- CRC32 ----------
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ---------- little-endian writers ----------
  function u16(n) { return new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF]); }
  function u32(n) {
    return new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]);
  }

  // ---------- ZIP (stored entries only) ----------
  function zip(files) {
    // files: [{ name: 'path/in/zip', data: Uint8Array }]
    const chunks = [];
    const central = [];
    let offset = 0;
    const DOS_TIME = u16((12 << 11) | (0 << 5) | 0);   // 12:00:00
    const DOS_DATE = u16(((2026 - 1980) << 9) | (1 << 5) | 1); // 2026-01-01
    files.forEach(function (f) {
      const nameBytes = utf8(f.name);
      const crc = crc32(f.data);
      const local = concat([
        u32(0x04034b50), u16(20), u16(0), u16(0), DOS_TIME, DOS_DATE,
        u32(crc), u32(f.data.length), u32(f.data.length),
        u16(nameBytes.length), u16(0), nameBytes
      ]);
      chunks.push(local, f.data);
      central.push(concat([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), DOS_TIME, DOS_DATE,
        u32(crc), u32(f.data.length), u32(f.data.length),
        u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
        u32(offset), nameBytes
      ]));
      offset += local.length + f.data.length;
    });
    const cdStart = offset;
    const cd = concat(central);
    chunks.push(cd);
    offset += cd.length;
    chunks.push(concat([
      u32(0x06054b50), u16(0), u16(0),
      u16(files.length), u16(files.length),
      u32(cd.length), u32(cdStart), u16(0)
    ]));
    return concat(chunks);
  }

  // ---------- XML ----------
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function colName(i) {
    let s = '';
    i++;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  // cell: string | number | { v, bold?, num? }
  function cellXml(cell, ref) {
    const bold = cell && typeof cell === 'object' && cell.bold;
    const style = bold ? ' s="1"' : '';
    let v = (cell && typeof cell === 'object' && 'v' in cell) ? cell.v : cell;
    if (typeof v === 'number' && isFinite(v)) {
      return '<c r="' + ref + '"' + style + '><v>' + v + '</v></c>';
    }
    return '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t>' + esc(v == null ? '' : v) + '</t></is></c>';
  }
  function sheetXml(rows) {
    let s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetData>';
    for (let r = 0; r < rows.length; r++) {
      s += '<row r="' + (r + 1) + '">';
      const row = rows[r] || [];
      for (let c = 0; c < row.length; c++) {
        s += cellXml(row[c], colName(c) + (r + 1));
      }
      s += '</row>';
    }
    return s + '</sheetData></worksheet>';
  }

  const CONTENT_TYPES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>';

  const RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const WORKBOOK_RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>' +
    '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>' +
    '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  const STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs>' +
    '</styleSheet>';

  function workbookXml(names) {
    let s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>';
    names.forEach(function (n, i) {
      s += '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
    });
    return s + '</sheets></workbook>';
  }

  // sheets: [{ name: string, rows: array of arrays }], exactly 4 for this app.
  // Header cells: pass { v: '...', bold: true }.
  function build(sheets) {
    if (!Array.isArray(sheets) || sheets.length !== 4) throw new Error('xlsx: need 4 sheets');
    const files = [
      { name: '[Content_Types].xml', data: utf8(CONTENT_TYPES) },
      { name: '_rels/.rels', data: utf8(RELS) },
      { name: 'xl/workbook.xml', data: utf8(workbookXml(sheets.map(function (s) { return s.name; }))) },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8(WORKBOOK_RELS) },
      { name: 'xl/styles.xml', data: utf8(STYLES) }
    ];
    sheets.forEach(function (sh, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: utf8(sheetXml(sh.rows || [])) });
    });
    return zip(files);
  }

  return { build: build, esc: esc };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TFT_XLSX;
}
