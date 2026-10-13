/* Node unit tests for logic.js -- run: node tests/run-node-tests.js */
'use strict';
const FT = require('../logic.js');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name); }
}
function eq(a, b, name) { ok(a === b, name + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

const T = '2026-10-13';
const YM = '2026-10';

// ---------- date helpers ----------
eq(FT.todayISO(new Date(2026, 9, 13)), '2026-10-13', 'todayISO local date');
eq(FT.monthKey('2026-10-13'), '2026-10', 'monthKey');
ok(FT.isMonth('2026-10'), 'isMonth valid');
ok(!FT.isMonth('2026-13'), 'isMonth month 13 invalid');
ok(!FT.isMonth('2026-1'), 'isMonth short month invalid');
ok(!FT.isMonth('abcd'), 'isMonth garbage invalid');
ok(FT.isDate('2026-10-13'), 'isDate valid');
ok(!FT.isDate('2026-02-30'), 'isDate Feb 30 invalid');
ok(!FT.isDate('2026-13-01'), 'isDate month 13 invalid');
eq(FT.monthsBetween('2026-08', '2026-10').join(','), '2026-08,2026-09,2026-10', 'monthsBetween range');
eq(FT.monthsBetween('2026-10', '2026-10').join(','), '2026-10', 'monthsBetween single');
eq(FT.monthsBetween('2026-11', '2026-10').length, 0, 'monthsBetween reversed empty');
eq(FT.monthsBetween('2025-12', '2026-01').join(','), '2025-12,2026-01', 'monthsBetween year boundary');
eq(FT.daysInMonth('2026-10'), 31, 'daysInMonth Oct=31');
eq(FT.daysInMonth('2026-02'), 28, 'daysInMonth Feb26=28');
eq(FT.monthEnd('2026-10'), '2026-10-31', 'monthEnd Oct');
eq(FT.daysBetween('2026-10-13', '2026-10-31'), 18, 'daysBetween to month end');
eq(FT.daysUntilMonthEnd('2026-10-13'), 18, 'daysUntilMonthEnd Oct 13 = 18');
eq(FT.daysUntilMonthEnd('2026-10-31'), 0, 'daysUntilMonthEnd last day = 0');

// ---------- money (integer paisa) ----------
eq(FT.toPaisa('3000'), 300000, 'toPaisa 3000 -> 300000');
eq(FT.toPaisa('10.50'), 1050, 'toPaisa 10.50 -> 1050');
ok(Number.isNaN(FT.toPaisa('abc')), 'toPaisa garbage -> NaN');
eq(FT.fmtMoney(1200000, 'en'), '12,000', 'fmtMoney 1200000 en');
eq(FT.fmtMoney(700000, 'en'), '7,000', 'fmtMoney 700000 en');
eq(FT.fmtMoney(105050, 'en'), '1,050.50', 'fmtMoney fractional');
eq(FT.fmtMoney(1400000, 'bn'), '\u09e7\u09ea,\u09e6\u09e6\u09e6', 'fmtMoney bn digits');
eq(FT.bnDigits('12000'), '\u09e7\u09e8\u09e6\u09e6\u09e6', 'bnDigits');
eq(FT.fmtInt(1234567, 'en'), '1,234,567', 'fmtInt grouping');
eq(FT.fmtRate(7000, 12000), '58.33', 'fmtRate 7000/12000 = 58.33');
eq(FT.fmtRate(9000, 14000), '64.29', 'fmtRate 9000/14000 = 64.29');
eq(FT.fmtRate(0, 0), '0.00', 'fmtRate zero expected');
eq(FT.fmtRateLang(7000, 12000, 'bn'), '\u09eb\u09ee.\u09e9\u09e9', 'fmtRateLang bn');
eq(FT.fmtMonth('2026-10', 'en'), 'October 2026', 'fmtMonth en');
eq(FT.fmtMonth('2026-10', 'bn'), '\u0985\u0995\u09cd\u099f\u09cb\u09ac\u09b0 \u09e8\u09e6\u09e8\u09ec', 'fmtMonth bn');

// ---------- student validation ----------
function mkStudent(over) {
  return Object.assign({ name: 'Rahim', classGrade: '8', monthlyFee: '3000',
    startMonth: '2026-10', phone: '01711111111' }, over || {});
}
eq(FT.validateStudent(mkStudent(), T).length, 0, 'valid student');
ok(FT.validateStudent(mkStudent({ name: '  ' }), T).indexOf('errName') >= 0, 'empty name rejected');
ok(FT.validateStudent(mkStudent({ monthlyFee: '0' }), T).indexOf('errFee') >= 0, 'zero fee rejected');
ok(FT.validateStudent(mkStudent({ monthlyFee: '-50' }), T).indexOf('errFee') >= 0, 'negative fee rejected');
ok(FT.validateStudent(mkStudent({ monthlyFee: 'abc' }), T).indexOf('errFee') >= 0, 'non-numeric fee rejected');
ok(FT.validateStudent(mkStudent({ monthlyFee: '2000000' }), T).indexOf('errFee') >= 0, 'fee over cap rejected');
ok(FT.validateStudent(mkStudent({ startMonth: '2026-11' }), T).indexOf('errStartMonth') >= 0, 'future start month rejected');
eq(FT.validateStudent(mkStudent({ startMonth: '2026-10' }), T).length, 0, 'current start month ok');
ok(FT.validateStudent(mkStudent({ startMonth: 'oops' }), T).indexOf('errStartMonth') >= 0, 'bad start month rejected');
eq(FT.validateStudent(mkStudent({ phone: '' }), T).length, 0, 'empty phone ok (optional)');
ok(FT.validateStudent(mkStudent({ phone: 'abc!' }), T).indexOf('errPhone') >= 0, 'bad phone rejected');
eq(FT.validateStudent(mkStudent({ phone: '+8801711111111' }), T).length, 0, 'intl phone ok');

// ---------- student normalize ----------
const ns = FT.normalizeStudent(mkStudent({ name: '  Karim ' }), T);
eq(ns.name, 'Karim', 'normalize trims name');
eq(ns.monthlyFee, 300000, 'normalize fee to paisa');
eq(ns.active, true, 'normalize active defaults true');
eq(ns.startMonth, '2026-10', 'normalize keeps startMonth');
eq(typeof ns.id, 'string', 'normalize assigns id');
const ns2 = FT.normalizeStudent(mkStudent({ active: false }), T);
eq(ns2.active, false, 'normalize keeps active=false');

// ---------- payment validation ----------
function mkPay(over) {
  return Object.assign({ month: '2026-10', amount: '3000', date: '2026-10-13', method: 'bkash' }, over || {});
}
eq(FT.validatePayment(mkPay(), T).length, 0, 'valid payment');
ok(FT.validatePayment(mkPay({ amount: '0' }), T).indexOf('errAmount') >= 0, 'zero amount rejected');
ok(FT.validatePayment(mkPay({ amount: '-100' }), T).indexOf('errAmount') >= 0, 'negative amount rejected');
ok(FT.validatePayment(mkPay({ amount: 'xyz' }), T).indexOf('errAmount') >= 0, 'non-numeric amount rejected');
ok(FT.validatePayment(mkPay({ date: '2026-10-14' }), T).indexOf('errDate') >= 0, 'future date rejected');
ok(FT.validatePayment(mkPay({ date: 'not-a-date' }), T).indexOf('errDate') >= 0, 'bad date rejected');
ok(FT.validatePayment(mkPay({ month: '2026-13' }), T).indexOf('errMonth') >= 0, 'bad month rejected');
ok(FT.validatePayment(mkPay({ method: 'cheque' }), T).indexOf('errMethod') >= 0, 'bad method rejected');
const np = FT.normalizePayment(mkPay({ amount: '2500.50' }), 'sid1', T);
eq(np.amount, 250050, 'normalize payment amount to paisa');
eq(np.studentId, 'sid1', 'normalize keeps studentId');
eq(np.method, 'bkash', 'normalize keeps method');

// ---------- ledger: the hand-verified scenario ----------
// 3 students, fees 3000/4000/5000, start 2026-10, asof 2026-10-13
function scenarioStudents() {
  return [
    FT.normalizeStudent(mkStudent({ name: 'Rahim', monthlyFee: '3000' }), T),
    FT.normalizeStudent(mkStudent({ name: 'Karim', monthlyFee: '4000' }), T),
    FT.normalizeStudent(mkStudent({ name: 'Shila', monthlyFee: '5000' }), T)
  ];
}
const S3 = scenarioStudents();
let ms = FT.monthStats(S3, [], YM);
eq(ms.expected, 1200000, 'monthStats expected 12000 BDT (paisa)');
eq(ms.collected, 0, 'monthStats collected 0');
eq(ms.outstanding, 1200000, 'monthStats outstanding 12000');
eq(ms.rate, '0.00', 'monthStats rate 0.00');
const P2 = [
  FT.normalizePayment(mkPay({ amount: '3000' }), S3[0].id, T),
  FT.normalizePayment(mkPay({ amount: '4000' }), S3[1].id, T)
];
ms = FT.monthStats(S3, P2, YM);
eq(ms.collected, 700000, 'collected 7000 after two payments');
eq(ms.outstanding, 500000, 'outstanding 5000');
eq(ms.rate, '58.33', 'rate 58.33%');
const P3 = P2.concat([FT.normalizePayment(mkPay({ amount: '2000' }), S3[2].id, T)]);
ms = FT.monthStats(S3, P3, YM);
eq(ms.collected, 900000, 'collected 9000 after partial');
eq(ms.outstanding, 300000, 'outstanding 3000 (partial)');
eq(ms.rate, '75.00', 'rate 75.00%');
// overpayment beyond fee allowed and counted as collected
const Pover = [FT.normalizePayment(mkPay({ amount: '6000' }), S3[0].id, T)];
ms = FT.monthStats([S3[0]], Pover, YM);
eq(ms.collected, 600000, 'overpayment counted as collected');
eq(ms.outstanding, 0, 'overpayment leaves no outstanding');
// inactive student excluded from current-month expected
const Sin = scenarioStudents();
Sin[0].active = false;
ms = FT.monthStats(Sin, [], YM);
eq(ms.expected, 900000, 'inactive excluded from expected');
// student starting after the month excluded
const Sfut = [FT.normalizeStudent(mkStudent({ startMonth: '2026-11' }), '2026-11-05')];
ms = FT.monthStats(Sfut, [], YM);
eq(ms.expected, 0, 'future-start student excluded');

// dashboard with arrears across months: add D (fee 2000, start 2026-09)
const S4 = scenarioStudents();
S4.push(FT.normalizeStudent(mkStudent({ name: 'Nabila', monthlyFee: '2000', startMonth: '2026-09' }), T));
const P4 = [
  FT.normalizePayment(mkPay({ amount: '3000' }), S4[0].id, T),
  FT.normalizePayment(mkPay({ amount: '4000' }), S4[1].id, T),
  FT.normalizePayment(mkPay({ amount: '2000' }), S4[2].id, T) // partial for Shila
];
const d4 = FT.dashboard(S4, P4, T);
eq(d4.ym, '2026-10', 'dashboard ym');
eq(d4.month.expected, 1400000, 'dashboard expected 14000');
eq(d4.month.collected, 900000, 'dashboard collected 9000');
eq(d4.month.outstanding, 500000, 'dashboard outstanding 5000');
eq(d4.month.rate, '64.29', 'dashboard rate 64.29%');
eq(d4.allTimeCollected, 900000, 'dashboard all-time collected 9000');
eq(d4.totalArrears, 700000, 'dashboard total arrears 7000 (Sep 2000 + Oct 3000+2000)');

// dues: sorted desc, day info
const dues = FT.dues(S4, P4, T);
eq(dues.length, 2, 'dues has 2 students');
eq(dues[0].student.name, 'Nabila', 'dues sorted: Nabila first (4000 owed)');
eq(dues[0].totalOwed, 400000, 'Nabila total owed 4000');
eq(dues[1].student.name, 'Shila', 'dues second: Shila (3000 owed)');
eq(dues[1].totalOwed, 300000, 'Shila total owed 3000');
eq(dues[0].rows.length, 2, 'Nabila has Sep+Oct rows');
eq(dues[0].curMonthDue, 200000, 'Nabila current-month due 2000');
const diCur = FT.dueDayInfo('2026-10', T);
eq(diCur.kind, 'current', 'dueDayInfo current month');
eq(diCur.daysLeft, 18, 'current month due in 18 days');
const diOld = FT.dueDayInfo('2026-09', T);
eq(diOld.kind, 'overdue', 'dueDayInfo past month overdue');
eq(diOld.daysOver, 13, 'Sep overdue by 13 days');
// no dues when all paid
const Pall = [
  FT.normalizePayment(mkPay({ amount: '3000' }), S3[0].id, T),
  FT.normalizePayment(mkPay({ amount: '4000' }), S3[1].id, T),
  FT.normalizePayment(mkPay({ amount: '5000' }), S3[2].id, T)
];
eq(FT.dues(S3, Pall, T).length, 0, 'no dues when fully paid');

// history: newest first, filters
const PH = [
  FT.normalizePayment(mkPay({ amount: '1000', date: '2026-09-15', month: '2026-09' }), S3[0].id, T),
  FT.normalizePayment(mkPay({ amount: '3000', date: '2026-10-13' }), S3[0].id, T),
  FT.normalizePayment(mkPay({ amount: '4000', date: '2026-10-10' }), S3[1].id, T)
];
const hAll = FT.historyFor(PH, null, null);
eq(hAll.length, 3, 'history all 3');
eq(hAll[0].date, '2026-10-13', 'history newest first');
eq(hAll[2].date, '2026-09-15', 'history oldest last');
eq(FT.historyFor(PH, S3[0].id, null).length, 2, 'history filter by student');
eq(FT.historyFor(PH, null, '2026-09').length, 1, 'history filter by month');

// paymentSums groups by student+month
const sums = FT.paymentSums(PH);
eq(sums[S3[0].id]['2026-09'], 100000, 'paymentSums groups Sep');
eq(sums[S3[0].id]['2026-10'], 300000, 'paymentSums groups Oct');

// ---------- import / export ----------
// export carries integer paisa; import validates that stored format strictly
const exp = FT.exportPayload(S3, P3, T);
eq(exp.app, 'tuition-fee-tracker-bd', 'export app id');
eq(exp.students.length, 3, 'export student count');
eq(exp.payments.length, 3, 'export payment count');
eq(exp.students[0].monthlyFee, 300000, 'export stores integer paisa');
const round = FT.validateImport(JSON.parse(JSON.stringify(exp)), T);
ok(!round.error && round.students.length === 3 && round.payments.length === 3, 'export/import round-trip');
eq(round.students[0].monthlyFee, 300000, 'round-trip fee intact (paisa, no double conversion)');
eq(round.payments[0].amount, 300000, 'round-trip payment amount intact');
const impStored = FT.validateImport({ app: 'tuition-fee-tracker-bd',
  students: [{ id: 'a1', name: 'X', monthlyFee: 100000, startMonth: '2026-10' }],
  payments: [{ id: 'p1', studentId: 'a1', month: '2026-10', amount: 100000, date: '2026-10-01', method: 'cash' }] }, T);
ok(!impStored.error && impStored.students.length === 1 && impStored.payments.length === 1, 'stored paisa import accepted');
const withExtra = JSON.parse(JSON.stringify(exp));
withExtra.students[0].mystery = 'field';
withExtra.payments[0].zzz = 42;
ok(!FT.validateImport(withExtra, T).error, 'unknown extra keys tolerated');
const badCases = [
  ['null', null],
  ['array', []],
  ['wrong app', { app: 'nope', students: [], payments: [] }],
  ['missing students', { app: 'tuition-fee-tracker-bd', payments: [] }],
  ['students not array', { app: 'tuition-fee-tracker-bd', students: {}, payments: [] }],
  ['empty name', { app: 'tuition-fee-tracker-bd', students: [{ id: 'a1', name: '', monthlyFee: 100000, startMonth: '2026-10' }], payments: [] }],
  ['future startMonth', { app: 'tuition-fee-tracker-bd', students: [{ id: 'a1', name: 'X', monthlyFee: 100000, startMonth: '2026-11' }], payments: [] }],
  ['non-integer paisa fee', { app: 'tuition-fee-tracker-bd', students: [{ id: 'a1', name: 'X', monthlyFee: 1000.5, startMonth: '2026-10' }], payments: [] }],
  ['dangling studentId', { app: 'tuition-fee-tracker-bd', students: [{ id: 'real1', name: 'X', monthlyFee: 100000, startMonth: '2026-10' }],
    payments: [{ studentId: 'ghost', month: '2026-10', amount: 10000, date: '2026-10-01', method: 'cash' }] }],
  ['future payment date', { app: 'tuition-fee-tracker-bd', students: [{ id: 'a1', name: 'X', monthlyFee: 100000, startMonth: '2026-10' }],
    payments: [{ studentId: 'a1', month: '2026-10', amount: 10000, date: '2026-10-14', method: 'cash' }] }],
  ['non-integer paisa amount', { app: 'tuition-fee-tracker-bd', students: [{ id: 'a1', name: 'X', monthlyFee: 100000, startMonth: '2026-10' }],
    payments: [{ studentId: 'a1', month: '2026-10', amount: 99.99, date: '2026-10-01', method: 'cash' }] }]
];
badCases.forEach(function (c) {
  const r = FT.validateImport(c[1], T);
  eq(r.error, 'importBad', 'import rejected: ' + c[0]);
});

// ---------- i18n ----------
eq(typeof FT.I18N.en.appTitle, 'string', 'en strings exist');
eq(typeof FT.I18N.bn.appTitle, 'string', 'bn strings exist');
const enKeys = Object.keys(FT.I18N.en).sort().join(',');
const bnKeys = Object.keys(FT.I18N.bn).sort().join(',');
eq(enKeys, bnKeys, 'en/bn key parity');
eq(FT.tr('en', 'imported', { n: 2, m: 3 }), 'Imported 2 student(s), 3 payment(s).', 'tr placeholder en');
eq(FT.tr('bn', 'dueInDays', { n: '\u09e7\u09ee' }), '\u09e7\u09ee \u09a6\u09bf\u09a8 \u09aa\u09b0', 'tr placeholder bn');
eq(FT.tr('en', 'nope-missing-key'), 'nope-missing-key', 'tr falls back to key');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
