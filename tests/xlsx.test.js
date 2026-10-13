/* Node unit tests for xlsx.js -- run: node tests/xlsx.test.js
   Parses the generated .xlsx manually (local headers, CRC32, central
   directory, EOCD) and checks the sheet XML content. No unzip library. */
'use strict';
const X = require('../xlsx.js');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name); }
}

function H(cells) { return cells.map(function (c) { return { v: c, bold: true }; }); }

const sheets = [
  { name: 'Summary', rows: [
    H(['Item', 'Value']),
    ['Expected', 12000],
    ['Rate', '58.33%'],
  ] },
  { name: 'Students', rows: [
    H(['Name', 'Fee']),
    ['Rahim', 3000],
    ['\u0995\u09b0\u09bf\u09ae & Sons <test>', 2500.5], // Bengali + XML specials
  ] },
  { name: 'Payments', rows: [ H(['Date', 'Amount']), ['2026-10-05', 3000] ] },
  { name: 'Dues', rows: [ H(['Student', 'Due']), ['Rahim', 0] ] },
];

const bytes = X.build(sheets);
ok(bytes instanceof Uint8Array, 'build returns Uint8Array');
ok(bytes.length > 2000, 'non-trivial size (' + bytes.length + ')');
ok(bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04,
  'starts with PK\\x03\\x04 local header signature');

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
function crc32(b) {
  const T = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// walk local file headers
const entries = [];
let off = 0;
while (off < bytes.length - 4) {
  if (u32(bytes, off) === 0x04034b50) {
    const method = u16(bytes, off + 8);
    const crc = u32(bytes, off + 14);
    const compSize = u32(bytes, off + 18);
    const nameLen = u16(bytes, off + 26);
    const extraLen = u16(bytes, off + 28);
    const name = Buffer.from(bytes.slice(off + 30, off + 30 + nameLen)).toString('utf8');
    const dataStart = off + 30 + nameLen + extraLen;
    const data = bytes.slice(dataStart, dataStart + compSize);
    entries.push({ name: name, method: method, crc: crc, data: data });
    off = dataStart + compSize;
  } else break;
}
ok(entries.length === 9, '9 local entries (5 fixed + 4 sheets), got ' + entries.length);
ok(entries.every(function (e) { return e.method === 0; }), 'all entries STORED (method 0)');
ok(entries.every(function (e) { return crc32(e.data) === e.crc; }), 'all CRC32 match');
const names = entries.map(function (e) { return e.name; });
['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml',
 'xl/worksheets/sheet3.xml', 'xl/worksheets/sheet4.xml']
  .forEach(function (n) { ok(names.indexOf(n) >= 0, 'entry present: ' + n); });

// central directory + EOCD
ok(u32(bytes, off) === 0x02014b50, 'central directory signature follows');
let coff = off, cdCount = 0;
while (u32(bytes, coff) === 0x02014b50) {
  cdCount++;
  coff += 46 + u16(bytes, coff + 28) + u16(bytes, coff + 30) + u16(bytes, coff + 32);
}
ok(cdCount === 9, '9 central directory entries');
ok(u32(bytes, coff) === 0x06054b50, 'EOCD signature');
ok(u16(bytes, coff + 10) === 9, 'EOCD total entries = 9');

function entryText(name) {
  const e = entries.filter(function (x) { return x.name === name; })[0];
  return Buffer.from(e.data).toString('utf8');
}

// sheet content checks
const s1 = entryText('xl/worksheets/sheet1.xml');
ok(s1.indexOf('<t>Item</t>') >= 0, 'sheet1 header text present');
ok(s1.indexOf('s="1"') >= 0, 'sheet1 header cells carry bold style');
ok(s1.indexOf('<v>12000</v>') >= 0, 'sheet1 number cell');
ok(s1.indexOf('<t>58.33%</t>') >= 0, 'sheet1 string cell');
const s2 = entryText('xl/worksheets/sheet2.xml');
ok(s2.indexOf('\u0995\u09b0\u09bf\u09ae') >= 0, 'sheet2 Bengali text intact (UTF-8)');
ok(s2.indexOf('&amp;') >= 0 && s2.indexOf('&lt;test&gt;') >= 0, 'sheet2 XML specials escaped');
ok(s2.indexOf('<v>2500.5</v>') >= 0, 'sheet2 fractional number');
const wb = entryText('xl/workbook.xml');
['Summary', 'Students', 'Payments', 'Dues'].forEach(function (n) {
  ok(wb.indexOf('name="' + n + '"') >= 0, 'workbook lists sheet: ' + n);
});
const st = entryText('xl/styles.xml');
ok(st.indexOf('<b/>') >= 0, 'styles define bold font');

// error paths
let threw = false;
try { X.build([{ name: 'Only', rows: [] }]); } catch (e) { threw = true; }
ok(threw, 'build rejects != 4 sheets');

// empty workbook still valid
const empty = X.build([
  { name: 'A', rows: [] }, { name: 'B', rows: [] },
  { name: 'C', rows: [] }, { name: 'D', rows: [] },
]);
ok(empty[0] === 0x50 && empty[1] === 0x4B, 'empty sheets produce valid zip');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
