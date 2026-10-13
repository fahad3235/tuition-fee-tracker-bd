/* tuition-fee-tracker-bd -- pure logic (no DOM). Testable in node.
   Money is stored as integer paisa to avoid float error.
   All Bengali text is written as \uXXXX escapes (pure-ASCII sources). */
'use strict';

const FeeTracker = (function () {
  const APP_ID = 'tuition-fee-tracker-bd';
  const STORAGE_KEY = 'tuition-fee-tracker-bd-v1';
  const LANG_KEY = 'tuition-fee-tracker-bd-lang';
  const METHODS = ['cash', 'bkash', 'nagad', 'rocket', 'bank', 'other'];
  const MAX_FEE_BDT = 1000000;   // sanity cap: 10 lakh BDT / month
  const MAX_PAY_BDT = 10000000;  // sanity cap per payment

  // ---------- utils ----------
  function uid() {
    return 's' + Date.now().toString(36) + Math.floor(Math.random() * 1679616).toString(36);
  }
  function trimStr(s) { return (s == null ? '' : String(s)).trim(); }

  // local date -> 'YYYY-MM-DD' (no timezone bugs)
  function todayISO(d) {
    d = d || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function monthKey(iso) { return String(iso).slice(0, 7); }
  function isMonth(s) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(trimStr(s)); }
  function isDate(s) {
    const t = trimStr(s);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
    const p = t.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  }
  // inclusive list of 'YYYY-MM' from a to b (a <= b); [] if a > b
  function monthsBetween(a, b) {
    const out = [];
    if (!isMonth(a) || !isMonth(b) || a > b) return out;
    let y = Number(a.slice(0, 4)), m = Number(a.slice(5, 7));
    const ey = Number(b.slice(0, 4)), em = Number(b.slice(5, 7));
    while (y < ey || (y === ey && m <= em)) {
      out.push(y + '-' + String(m).padStart(2, '0'));
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  }
  function daysInMonth(ym) {
    const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
    return new Date(y, m, 0).getDate();
  }
  function monthEnd(ym) { return ym + '-' + String(daysInMonth(ym)).padStart(2, '0'); }
  // whole days from `from` to `to` (both YYYY-MM-DD). Positive = future.
  function daysBetween(from, to) {
    const pf = from.split('-').map(Number), pt = to.split('-').map(Number);
    const df = new Date(pf[0], pf[1] - 1, pf[2]);
    const dt = new Date(pt[0], pt[1] - 1, pt[2]);
    return Math.round((dt - df) / 86400000);
  }
  function daysUntilMonthEnd(asofISO) {
    return daysBetween(asofISO, monthEnd(monthKey(asofISO)));
  }

  // ---------- money (integer paisa) ----------
  function toPaisa(bdt) {
    const n = Number(bdt);
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
  }
  const BN_DIGITS = ['\u09E6', '\u09E7', '\u09E8', '\u09E9', '\u09EA',
                     '\u09EB', '\u09EC', '\u09ED', '\u09EE', '\u09EF'];
  function bnDigits(s) {
    return String(s).replace(/[0-9]/g, function (d) { return BN_DIGITS[Number(d)]; });
  }
  function groupThousands(intStr) {
    return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  // paisa -> "12,000" (or "1,050.50" when not a whole taka); Bengali digits when lang='bn'
  function fmtMoney(paisa, lang) {
    const neg = paisa < 0;
    const abs = Math.abs(Math.round(paisa));
    const taka = Math.floor(abs / 100), rem = abs % 100;
    let s = groupThousands(String(taka)) + (rem ? '.' + String(rem).padStart(2, '0') : '');
    if (lang === 'bn') s = bnDigits(s);
    return (neg ? '-' : '') + s;
  }
  function fmtInt(n, lang) {
    const s = groupThousands(String(n));
    return lang === 'bn' ? bnDigits(s) : s;
  }
  // "58.33" (string, 2 decimals); "0.00" when nothing expected
  function fmtRate(collected, expected) {
    if (expected <= 0) return '0.00';
    return (collected / expected * 100).toFixed(2);
  }
  function fmtRateLang(collected, expected, lang) {
    const s = fmtRate(collected, expected);
    return lang === 'bn' ? bnDigits(s) : s;
  }

  // ---------- validation ----------
  function isPaisaInt(n) { return Number.isInteger(n) && n > 0; }
  // shared field checks; feePaisa already in integer paisa, feeOk precomputed
  function checkStudentFields(raw, asofISO, feePaisa, feeOk) {
    const errs = [];
    if (!trimStr(raw.name)) errs.push('errName');
    if (!feeOk) errs.push('errFee');
    const sm = trimStr(raw.startMonth);
    if (!isMonth(sm)) errs.push('errStartMonth');
    else if (sm > monthKey(asofISO)) errs.push('errStartMonth'); // future start month
    const ph = trimStr(raw.phone);
    if (ph && !/^[0-9+\-\s()]{6,18}$/.test(ph)) errs.push('errPhone');
    return errs;
  }
  // Form-level: monthlyFee given in BDT (string/number). Returns error codes.
  function validateStudent(raw, asofISO) {
    const feeP = toPaisa(raw.monthlyFee);
    return checkStudentFields(raw, asofISO, feeP,
      Number.isFinite(feeP) && feeP > 0 && feeP <= MAX_FEE_BDT * 100);
  }
  // Stored-level (import): monthlyFee already integer paisa. Returns error codes.
  function validateStoredStudent(raw, asofISO) {
    const feeP = raw.monthlyFee;
    return checkStudentFields(raw, asofISO, feeP,
      isPaisaInt(feeP) && feeP <= MAX_FEE_BDT * 100);
  }
  function normalizeStudent(raw, asofISO) {
    const sm = trimStr(raw.startMonth);
    return {
      id: trimStr(raw.id) || uid(),
      name: trimStr(raw.name),
      classGrade: trimStr(raw.classGrade),
      monthlyFee: toPaisa(raw.monthlyFee), // integer paisa
      startMonth: isMonth(sm) ? sm : monthKey(asofISO),
      phone: trimStr(raw.phone),
      active: raw.active === false ? false : true,
      createdAt: trimStr(raw.createdAt) || asofISO
    };
  }
  // Returns array of error codes (empty = valid)
  function validatePayment(raw, asofISO) {
    const amtP = toPaisa(raw.amount);
    return checkPaymentFields(raw, asofISO, amtP,
      Number.isFinite(amtP) && amtP > 0 && amtP <= MAX_PAY_BDT * 100);
  }
  // Stored-level (import): amount already integer paisa. Returns error codes.
  function validateStoredPayment(raw, asofISO) {
    const amtP = raw.amount;
    return checkPaymentFields(raw, asofISO, amtP,
      isPaisaInt(amtP) && amtP <= MAX_PAY_BDT * 100);
  }
  // shared field checks; amtPaisa already in integer paisa, amtOk precomputed
  function checkPaymentFields(raw, asofISO, amtPaisa, amtOk) {
    const errs = [];
    if (!amtOk) errs.push('errAmount');
    const dt = trimStr(raw.date);
    if (!isDate(dt)) errs.push('errDate');
    else if (dt > asofISO) errs.push('errDate'); // future date rejected
    if (!isMonth(trimStr(raw.month))) errs.push('errMonth');
    if (METHODS.indexOf(raw.method) < 0) errs.push('errMethod');
    return errs;
  }
  function normalizePayment(raw, studentId, asofISO) {
    const dt = isDate(trimStr(raw.date)) ? trimStr(raw.date) : asofISO;
    const mo = trimStr(raw.month);
    return {
      id: trimStr(raw.id) || uid(),
      studentId: studentId,
      month: isMonth(mo) ? mo : monthKey(dt),
      amount: toPaisa(raw.amount), // integer paisa
      date: dt,
      method: METHODS.indexOf(raw.method) >= 0 ? raw.method : 'cash',
      createdAt: trimStr(raw.createdAt) || asofISO
    };
  }
  // Stored-level normalize (import): amounts already integer paisa, kept as-is.
  function normalizeStoredStudent(raw, asofISO) {
    const s = normalizeStudent(raw, asofISO);
    s.monthlyFee = raw.monthlyFee;
    return s;
  }
  function normalizeStoredPayment(raw, studentId, asofISO) {
    const p = normalizePayment(raw, studentId, asofISO);
    p.amount = raw.amount;
    return p;
  }

  // ---------- ledger math ----------
  // { studentId: { 'YYYY-MM': totalPaisa } }
  function paymentSums(payments) {
    const m = {};
    payments.forEach(function (p) {
      m[p.studentId] = m[p.studentId] || {};
      m[p.studentId][p.month] = (m[p.studentId][p.month] || 0) + p.amount;
    });
    return m;
  }
  // per-month rows for one student, from startMonth through asofYM (inclusive)
  function monthRows(student, sums, asofYM) {
    const rows = [];
    const pm = (sums && sums[student.id]) || {};
    monthsBetween(student.startMonth, asofYM).forEach(function (ym) {
      const paid = pm[ym] || 0;
      const fee = student.monthlyFee;
      rows.push({ month: ym, fee: fee, paid: paid, due: Math.max(0, fee - paid) });
    });
    return rows;
  }
  // stats for a single month: active students only
  function monthStats(students, payments, ym) {
    const sums = paymentSums(payments);
    let expected = 0, collected = 0, outstanding = 0;
    students.forEach(function (s) {
      if (!s.active) return;
      if (s.startMonth > ym) return;
      expected += s.monthlyFee;
      const paid = (sums[s.id] && sums[s.id][ym]) || 0;
      collected += paid;                        // overpayment counts as collected
      outstanding += Math.max(0, s.monthlyFee - paid);
    });
    return { expected: expected, collected: collected, outstanding: outstanding,
             rate: fmtRate(collected, expected) };
  }
  function dashboard(students, payments, asofISO) {
    const ym = monthKey(asofISO);
    const cur = monthStats(students, payments, ym);
    const sums = paymentSums(payments);
    let allTimeCollected = 0, totalArrears = 0;
    payments.forEach(function (p) { allTimeCollected += p.amount; });
    students.forEach(function (s) {
      monthRows(s, sums, ym).forEach(function (r) { totalArrears += r.due; });
    });
    return { ym: ym, month: cur, allTimeCollected: allTimeCollected, totalArrears: totalArrears };
  }
  // students with any outstanding, sorted by total owed desc (name tiebreak)
  function dues(students, payments, asofISO) {
    const ym = monthKey(asofISO);
    const sums = paymentSums(payments);
    const out = [];
    students.forEach(function (s) {
      const rows = monthRows(s, sums, ym).filter(function (r) { return r.due > 0; });
      if (!rows.length) return;
      const totalOwed = rows.reduce(function (a, r) { return a + r.due; }, 0);
      const curRow = rows.filter(function (r) { return r.month === ym; })[0];
      out.push({
        student: s,
        rows: rows, // oldest month first
        totalOwed: totalOwed,
        curMonthDue: curRow ? curRow.due : 0
      });
    });
    out.sort(function (a, b) {
      return (b.totalOwed - a.totalOwed) ||
        (a.student.name < b.student.name ? -1 : a.student.name > b.student.name ? 1 : 0);
    });
    return out;
  }
  // day info for one due row: current month -> days left; past month -> days overdue
  function dueDayInfo(rowMonth, asofISO) {
    const cur = monthKey(asofISO);
    if (rowMonth === cur) return { kind: 'current', daysLeft: daysUntilMonthEnd(asofISO) };
    if (rowMonth < cur) return { kind: 'overdue', daysOver: daysBetween(monthEnd(rowMonth), asofISO) };
    return { kind: 'future', daysLeft: 0 };
  }
  // chronological payment list, newest first; optional student/month filters
  function historyFor(payments, studentId, month) {
    return payments
      .filter(function (p) {
        return (!studentId || p.studentId === studentId) && (!month || p.month === month);
      })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.createdAt < b.createdAt ? 1 : -1;
      });
  }
  function studentById(students, id) {
    for (let i = 0; i < students.length; i++) if (students[i].id === id) return students[i];
    return null;
  }

  // ---------- import / export ----------
  function exportPayload(students, payments, asofISO) {
    return {
      app: APP_ID,
      version: 1,
      exportedAt: asofISO || todayISO(),
      students: students,
      payments: payments
    };
  }
  // STRICT: malformed -> { error:'importBad' }, existing data untouched by caller.
  // Unknown extra keys are tolerated (ignored by normalize*).
  // Exported amounts are integer paisa; stored-level validators enforce that exactly.
  function validateImport(payload, asofISO) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { error: 'importBad' };
    if (payload.app !== APP_ID) return { error: 'importBad' };
    if (!Array.isArray(payload.students) || !Array.isArray(payload.payments)) return { error: 'importBad' };
    const students = [];
    for (let i = 0; i < payload.students.length; i++) {
      const raw = payload.students[i];
      if (!raw || typeof raw !== 'object') return { error: 'importBad' };
      if (validateStoredStudent(raw, asofISO).length) return { error: 'importBad' };
      students.push(normalizeStoredStudent(raw, asofISO));
    }
    const ids = {};
    students.forEach(function (s) { ids[s.id] = true; });
    const payments = [];
    for (let i = 0; i < payload.payments.length; i++) {
      const raw = payload.payments[i];
      if (!raw || typeof raw !== 'object') return { error: 'importBad' };
      if (!ids[raw.studentId]) return { error: 'importBad' }; // dangling reference
      if (validateStoredPayment(raw, asofISO).length) return { error: 'importBad' };
      payments.push(normalizeStoredPayment(raw, raw.studentId, asofISO));
    }
    return { students: students, payments: payments };
  }

  // ---------- i18n ----------
  const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
  const BN_MONTHS = ["\u099c\u09be\u09a8\u09c1\u09af\u09bc\u09be\u09b0\u09bf", "\u09ab\u09c7\u09ac\u09cd\u09b0\u09c1\u09af\u09bc\u09be\u09b0\u09bf", "\u09ae\u09be\u09b0\u09cd\u099a", "\u098f\u09aa\u09cd\u09b0\u09bf\u09b2", "\u09ae\u09c7", "\u099c\u09c1\u09a8", "\u099c\u09c1\u09b2\u09be\u0987", "\u0986\u0997\u09b8\u09cd\u099f", "\u09b8\u09c7\u09aa\u09cd\u099f\u09c7\u09ae\u09cd\u09ac\u09b0", "\u0985\u0995\u09cd\u099f\u09cb\u09ac\u09b0", "\u09a8\u09ad\u09c7\u09ae\u09cd\u09ac\u09b0", "\u09a1\u09bf\u09b8\u09c7\u09ae\u09cd\u09ac\u09b0"];
  function fmtMonth(ym, lang) {
    const y = ym.slice(0, 4), m = Number(ym.slice(5, 7));
    if (lang === 'bn') return BN_MONTHS[m - 1] + ' ' + bnDigits(y);
    return EN_MONTHS[m - 1] + ' ' + y;
  }

  const I18N = {
    en: {
      appTitle: "Tuition Fee Tracker",
      appSub: "Monthly fee tracker for private tutors -- 100% offline",
      tabDash: "Dashboard",
      tabStudents: "Students",
      tabDues: "Dues",
      tabHistory: "History",
      tabTools: "Tools",
      statExpected: "Expected this month",
      statCollected: "Collected this month",
      statOutstanding: "Outstanding this month",
      statRate: "Collection rate",
      totCollected: "All-time collected",
      totArrears: "Total arrears",
      studentsTitle: "Students",
      addStudent: "Add student",
      editStudent: "Edit student",
      fName: "Name",
      fClass: "Class / grade",
      fFee: "Monthly fee (BDT)",
      fStartMonth: "Start month",
      fPhone: "Phone (optional)",
      fActive: "Active student",
      save: "Save",
      cancel: "Cancel",
      edit: "Edit",
      del: "Delete",
      recordPay: "Record payment",
      noStudents: "No students yet. Add your first student!",
      confirmDelStudent: "Delete this student and all their payments?",
      errName: "Name is required.",
      errFee: "Fee must be a positive number.",
      errStartMonth: "Start month cannot be in the future.",
      errPhone: "Phone number looks invalid.",
      errAmount: "Amount must be positive.",
      errDate: "Date cannot be in the future.",
      errMonth: "Invalid month.",
      errMethod: "Invalid payment method.",
      payTitle: "Record payment",
      fAmount: "Amount (BDT)",
      fDate: "Date",
      fMonth: "For month",
      fMethod: "Method",
      cash: "Cash",
      bkash: "bKash",
      nagad: "Nagad",
      rocket: "Rocket",
      bank: "Bank",
      other: "Other",
      duesTitle: "Dues",
      noDues: "No dues. All fees collected!",
      overdue: "Overdue",
      dueInDays: "in {n} day(s)",
      overdueBy: "{n} day(s) overdue",
      totalOwed: "Total owed",
      paid: "paid",
      histTitle: "Payment history",
      noHistory: "No payments recorded yet.",
      allStudents: "All students",
      allMonths: "All months",
      confirmDelPayment: "Delete this payment?",
      toolsTitle: "Data tools",
      toolsSub: "Your data stays in this browser (localStorage).",
      export: "Export JSON",
      exportXlsx: "Export Excel (.xlsx)",
      xlsItem: "Item",
      xlsValue: "Value",
      xlsStatus: "Status",
      xlsActive: "Active",
      xlsDue: "Due",
      import: "Import JSON",
      clearAll: "Clear all data",
      confirmClear: "Delete ALL students and payments? This cannot be undone.",
      imported: "Imported {n} student(s), {m} payment(s).",
      importBad: "Invalid file -- data left unchanged.",
      cleared: "All data cleared.",
      saved: "Saved.",
      deleted: "Deleted.",
      perMonth: "/month",
      inactive: "Inactive",
      footer: "Personal tracker, not accounting software."
    },
    bn: {
      "appTitle": "\u099f\u09bf\u0989\u09b6\u09a8 \u09ab\u09bf \u099f\u09cd\u09b0\u09cd\u09af\u09be\u0995\u09be\u09b0",
      "appSub": "\u09aa\u09cd\u09b0\u09be\u0987\u09ad\u09c7\u099f \u099f\u09bf\u0989\u099f\u09b0\u09a6\u09c7\u09b0 \u09ae\u09be\u09b8\u09bf\u0995 \u09ab\u09bf \u099f\u09cd\u09b0\u09cd\u09af\u09be\u0995\u09be\u09b0 \u2014 \u09b8\u09ae\u09cd\u09aa\u09c2\u09b0\u09cd\u09a3 \u0985\u09ab\u09b2\u09be\u0987\u09a8",
      "tabDash": "\u09a1\u09cd\u09af\u09be\u09b6\u09ac\u09cb\u09b0\u09cd\u09a1",
      "tabStudents": "\u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0",
      "tabDues": "\u09ac\u0995\u09c7\u09af\u09bc\u09be",
      "tabHistory": "\u0987\u09a4\u09bf\u09b9\u09be\u09b8",
      "tabTools": "\u099f\u09c1\u09b2\u09b8",
      "statExpected": "\u098f\u0987 \u09ae\u09be\u09b8\u09c7 \u09aa\u09cd\u09b0\u09a4\u09cd\u09af\u09be\u09b6\u09bf\u09a4",
      "statCollected": "\u098f\u0987 \u09ae\u09be\u09b8\u09c7 \u0986\u09a6\u09be\u09af\u09bc",
      "statOutstanding": "\u098f\u0987 \u09ae\u09be\u09b8\u09c7 \u09ac\u0995\u09c7\u09af\u09bc\u09be",
      "statRate": "\u0986\u09a6\u09be\u09af\u09bc\u09c7\u09b0 \u09b9\u09be\u09b0",
      "totCollected": "\u09b8\u09b0\u09cd\u09ac\u09ae\u09cb\u099f \u0986\u09a6\u09be\u09af\u09bc",
      "totArrears": "\u09ae\u09cb\u099f \u09ac\u0995\u09c7\u09af\u09bc\u09be",
      "studentsTitle": "\u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0\u09ac\u09c3\u09a8\u09cd\u09a6",
      "addStudent": "\u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0 \u09af\u09cb\u0997 \u0995\u09b0\u09c1\u09a8",
      "editStudent": "\u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0 \u09b8\u09ae\u09cd\u09aa\u09be\u09a6\u09a8\u09be",
      "fName": "\u09a8\u09be\u09ae",
      "fClass": "\u09b6\u09cd\u09b0\u09c7\u09a3\u09bf",
      "fFee": "\u09ae\u09be\u09b8\u09bf\u0995 \u09ab\u09bf (\u099f\u09be\u0995\u09be)",
      "fStartMonth": "\u09b6\u09c1\u09b0\u09c1\u09b0 \u09ae\u09be\u09b8",
      "fPhone": "\u09ab\u09cb\u09a8 (\u0990\u099a\u09cd\u099b\u09bf\u0995)",
      "fActive": "\u09b8\u0995\u09cd\u09b0\u09bf\u09af\u09bc \u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0",
      "save": "\u09b8\u0982\u09b0\u0995\u09cd\u09b7\u09a3",
      "cancel": "\u09ac\u09be\u09a4\u09bf\u09b2",
      "edit": "\u09b8\u09ae\u09cd\u09aa\u09be\u09a6\u09a8\u09be",
      "del": "\u09ae\u09c1\u099b\u09c1\u09a8",
      "recordPay": "\u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f \u09b0\u09c7\u0995\u09b0\u09cd\u09a1",
      "noStudents": "\u098f\u0996\u09a8\u09cb \u0995\u09cb\u09a8\u09cb \u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0 \u09a8\u09c7\u0987\u0964 \u09aa\u09cd\u09b0\u09a5\u09ae \u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0 \u09af\u09cb\u0997 \u0995\u09b0\u09c1\u09a8!",
      "confirmDelStudent": "\u098f\u0987 \u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0 \u0993 \u09a4\u09be\u09b0 \u09b8\u09ac \u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f \u09ae\u09c1\u099b\u09c7 \u09ab\u09c7\u09b2\u09ac\u09c7\u09a8?",
      "errName": "\u09a8\u09be\u09ae \u0986\u09ac\u09b6\u09cd\u09af\u0995\u0964",
      "errFee": "\u09ab\u09bf \u098f\u0995\u099f\u09bf \u09a7\u09a8\u09be\u09a4\u09cd\u09ae\u0995 \u09b8\u0982\u0996\u09cd\u09af\u09be \u09b9\u09a4\u09c7 \u09b9\u09ac\u09c7\u0964",
      "errStartMonth": "\u09b6\u09c1\u09b0\u09c1\u09b0 \u09ae\u09be\u09b8 \u09ad\u09ac\u09bf\u09b7\u09cd\u09af\u09a4\u09c7 \u09b9\u09a4\u09c7 \u09aa\u09be\u09b0\u09ac\u09c7 \u09a8\u09be\u0964",
      "errPhone": "\u09ab\u09cb\u09a8 \u09a8\u09ae\u09cd\u09ac\u09b0 \u09b8\u09a0\u09bf\u0995 \u09a8\u09af\u09bc\u0964",
      "errAmount": "\u099f\u09be\u0995\u09be\u09b0 \u09aa\u09b0\u09bf\u09ae\u09be\u09a3 \u09a7\u09a8\u09be\u09a4\u09cd\u09ae\u0995 \u09b9\u09a4\u09c7 \u09b9\u09ac\u09c7\u0964",
      "errDate": "\u09a4\u09be\u09b0\u09bf\u0996 \u09ad\u09ac\u09bf\u09b7\u09cd\u09af\u09a4\u09c7 \u09b9\u09a4\u09c7 \u09aa\u09be\u09b0\u09ac\u09c7 \u09a8\u09be\u0964",
      "errMonth": "\u09ae\u09be\u09b8 \u09b8\u09a0\u09bf\u0995 \u09a8\u09af\u09bc\u0964",
      "errMethod": "\u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f \u09ae\u09be\u09a7\u09cd\u09af\u09ae \u09b8\u09a0\u09bf\u0995 \u09a8\u09af\u09bc\u0964",
      "payTitle": "\u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f \u09b0\u09c7\u0995\u09b0\u09cd\u09a1 \u0995\u09b0\u09c1\u09a8",
      "fAmount": "\u09aa\u09b0\u09bf\u09ae\u09be\u09a3 (\u099f\u09be\u0995\u09be)",
      "fDate": "\u09a4\u09be\u09b0\u09bf\u0996",
      "fMonth": "\u0995\u09cb\u09a8 \u09ae\u09be\u09b8\u09c7\u09b0",
      "fMethod": "\u09ae\u09be\u09a7\u09cd\u09af\u09ae",
      "cash": "\u09a8\u0997\u09a6",
      "bkash": "\u09ac\u09bf\u0995\u09be\u09b6",
      "nagad": "\u09a8\u0997\u09a6 (\u09ae\u09cb\u09ac\u09be\u0987\u09b2)",
      "rocket": "\u09b0\u0995\u09c7\u099f",
      "bank": "\u09ac\u09cd\u09af\u09be\u0982\u0995",
      "other": "\u0985\u09a8\u09cd\u09af\u09be\u09a8\u09cd\u09af",
      "duesTitle": "\u09ac\u0995\u09c7\u09af\u09bc\u09be \u09a4\u09be\u09b2\u09bf\u0995\u09be",
      "noDues": "\u0995\u09cb\u09a8\u09cb \u09ac\u0995\u09c7\u09af\u09bc\u09be \u09a8\u09c7\u0987\u0964 \u09b8\u09ac \u09ab\u09bf \u0986\u09a6\u09be\u09af\u09bc \u09b9\u09af\u09bc\u09c7\u099b\u09c7!",
      "overdue": "\u09ae\u09c7\u09af\u09bc\u09be\u09a6\u09cb\u09a4\u09cd\u09a4\u09c0\u09b0\u09cd\u09a3",
      "dueInDays": "{n} \u09a6\u09bf\u09a8 \u09aa\u09b0",
      "overdueBy": "{n} \u09a6\u09bf\u09a8 \u09ae\u09c7\u09af\u09bc\u09be\u09a6\u09cb\u09a4\u09cd\u09a4\u09c0\u09b0\u09cd\u09a3",
      "totalOwed": "\u09ae\u09cb\u099f \u09ac\u0995\u09c7\u09af\u09bc\u09be",
      "paid": "\u09aa\u09b0\u09bf\u09b6\u09cb\u09a7\u09bf\u09a4",
      "histTitle": "\u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f \u0987\u09a4\u09bf\u09b9\u09be\u09b8",
      "noHistory": "\u098f\u0996\u09a8\u09cb \u0995\u09cb\u09a8\u09cb \u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f \u09b0\u09c7\u0995\u09b0\u09cd\u09a1 \u09b9\u09af\u09bc\u09a8\u09bf\u0964",
      "allStudents": "\u09b8\u09ac \u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0",
      "allMonths": "\u09b8\u09ac \u09ae\u09be\u09b8",
      "confirmDelPayment": "\u098f\u0987 \u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f\u099f\u09bf \u09ae\u09c1\u099b\u09c7 \u09ab\u09c7\u09b2\u09ac\u09c7\u09a8?",
      "toolsTitle": "\u09a1\u09c7\u099f\u09be \u099f\u09c1\u09b2\u09b8",
      "toolsSub": "\u0986\u09aa\u09a8\u09be\u09b0 \u09a1\u09c7\u099f\u09be \u098f\u0987 \u09ac\u09cd\u09b0\u09be\u0989\u099c\u09be\u09b0\u09c7\u0987 \u09a5\u09be\u0995\u09c7 (localStorage)\u0964",
      "export": "\u098f\u0995\u09cd\u09b8\u09aa\u09cb\u09b0\u09cd\u099f (JSON)",
      "exportXlsx": "\u098f\u0995\u09cd\u09b8\u09c7\u09b2 \u09a1\u09be\u0989\u09a8\u09b2\u09cb\u09a1 (.xlsx)",
      "xlsItem": "\u09ac\u09bf\u09b7\u09af\u09bc",
      "xlsValue": "\u09ae\u09be\u09a8",
      "xlsStatus": "\u0985\u09ac\u09b8\u09cd\u09a5\u09be",
      "xlsActive": "\u09b8\u0995\u09cd\u09b0\u09bf\u09af\u09bc",
      "xlsDue": "\u09ac\u0995\u09c7\u09af\u09bc\u09be",
      "import": "\u0987\u09ae\u09aa\u09cb\u09b0\u09cd\u099f (JSON)",
      "clearAll": "\u09b8\u09ac \u09a1\u09c7\u099f\u09be \u09ae\u09c1\u099b\u09c1\u09a8",
      "confirmClear": "\u09b8\u09ac \u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0 \u0993 \u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f \u09ae\u09c1\u099b\u09c7 \u09af\u09be\u09ac\u09c7\u0964 \u098f\u099f\u09bf \u09ab\u09c7\u09b0\u09be\u09a8\u09cb \u09af\u09be\u09ac\u09c7 \u09a8\u09be\u0964",
      "imported": "{n}\u099f\u09bf \u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0 \u0993 {m}\u099f\u09bf \u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f \u0987\u09ae\u09aa\u09cb\u09b0\u09cd\u099f \u09b9\u09af\u09bc\u09c7\u099b\u09c7\u0964",
      "importBad": "\u0985\u09ac\u09c8\u09a7 \u09ab\u09be\u0987\u09b2 \u2014 \u09a1\u09c7\u099f\u09be \u0985\u09aa\u09b0\u09bf\u09ac\u09b0\u09cd\u09a4\u09bf\u09a4 \u0986\u099b\u09c7\u0964",
      "cleared": "\u09b8\u09ac \u09a1\u09c7\u099f\u09be \u09ae\u09c1\u099b\u09c7 \u09ab\u09c7\u09b2\u09be \u09b9\u09af\u09bc\u09c7\u099b\u09c7\u0964",
      "saved": "\u09b8\u0982\u09b0\u0995\u09cd\u09b7\u09a3 \u0995\u09b0\u09be \u09b9\u09af\u09bc\u09c7\u099b\u09c7\u0964",
      "deleted": "\u09ae\u09c1\u099b\u09c7 \u09ab\u09c7\u09b2\u09be \u09b9\u09af\u09bc\u09c7\u099b\u09c7\u0964",
      "perMonth": "/\u09ae\u09be\u09b8",
      "inactive": "\u09a8\u09bf\u09b7\u09cd\u0995\u09cd\u09b0\u09bf\u09af\u09bc",
      "footer": "\u09ac\u09cd\u09af\u0995\u09cd\u09a4\u09bf\u0997\u09a4 \u099f\u09cd\u09b0\u09cd\u09af\u09be\u0995\u09be\u09b0 \u2014 \u0985\u09cd\u09af\u09be\u0995\u09be\u0989\u09a8\u09cd\u099f\u09bf\u0982 \u09b8\u09ab\u099f\u0993\u09af\u09bc\u09cd\u09af\u09be\u09b0 \u09a8\u09af\u09bc\u0964",
    }
  };
  function tr(lang, key, vars) {
    let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) {
      s = s.split('{' + k + '}').join(String(vars[k]));
    });
    return s;
  }

  return {
    APP_ID, STORAGE_KEY, LANG_KEY, METHODS,
    uid, todayISO, monthKey, isMonth, isDate, monthsBetween,
    daysInMonth, monthEnd, daysBetween, daysUntilMonthEnd, trimStr,
    toPaisa, bnDigits, fmtMoney, fmtInt, fmtRate, fmtRateLang, fmtMonth,
    validateStudent, normalizeStudent, validatePayment, normalizePayment,
    paymentSums, monthRows, monthStats, dashboard, dues, dueDayInfo,
    historyFor, studentById,
    exportPayload, validateImport,
    I18N, tr
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FeeTracker;
}
