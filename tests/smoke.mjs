/* tuition-fee-tracker-bd smoke tests -- headless Chromium via puppeteer-core.
   Run: NODE_PATH=../job-application-tracker-bd/node_modules node tests/smoke.mjs */
import puppeteer from 'puppeteer-core';

const APP = 'file:///home/hatch/workspace/muse-project-factory/builds/tuition-fee-tracker-bd/index.html?asof=2026-10-13';

let pass = 0, fail = 0;
function eq(name, actual, expected) {
  if (actual === expected) { pass++; }
  else { fail++; console.log('FAIL', name, '| actual:', JSON.stringify(actual), '| expected:', JSON.stringify(expected)); }
}
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL', name); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/opt/meta-chromium/chrome',
  headless: 'new',
  args: ['--no-sandbox', '--no-proxy-server', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
page.on('dialog', d => d.accept());
const consoleErrors = [], pageErrors = [];
let netRequests = 0;
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('request', r => { if (!r.url().startsWith('data:') && !r.url().startsWith('file:')) netRequests++; });

await page.goto(APP, { waitUntil: 'load' });
await page.waitForFunction(() => window.__TFT_READY === true, { timeout: 8000 });

// 1. render + asof honored + empty states
eq('asof honored', await page.evaluate(() => window.__TFT_state().asof), '2026-10-13');
eq('h1 title', await page.$eval('#h-title', el => el.textContent.trim()), 'Tuition Fee Tracker');
eq('lang button shows Bangla label', await page.$eval('#langBtn', el => el.textContent.trim()), '\u09ac\u09be\u0982\u09b2\u09be');
eq('dash month label', await page.$eval('#dashMonth', el => el.textContent.trim()), 'October 2026');
ok('empty students', (await page.$eval('#studentList', el => el.textContent)).includes('No students yet'));
ok('empty dues', (await page.$eval('#duesList', el => el.textContent)).includes('No dues'));
ok('empty history', (await page.$eval('#histList', el => el.textContent)).includes('No payments recorded yet'));
eq('dash expected=0', await page.$eval('#vExpected', el => el.textContent.trim()), '0');
eq('dash collected=0', await page.$eval('#vCollected', el => el.textContent.trim()), '0');
eq('dash outstanding=0', await page.$eval('#vOutstanding', el => el.textContent.trim()), '0');
eq('dash rate=0.00%', await page.$eval('#vRate', el => el.textContent.trim()), '0.00%');

// helper: add a student through the modal
async function addStudent(name, cls, fee, startMonth, phone) {
  await page.click('#tabStudents');
  await sleep(200);
  await page.click('#btnAddStudent');
  await sleep(200);
  await page.$eval('#f-s-name', (el, v) => el.value = v, name);
  await page.$eval('#f-s-class', (el, v) => el.value = v, cls);
  await page.$eval('#f-s-fee', (el, v) => el.value = v, fee);
  await page.$eval('#f-s-start', (el, v) => el.value = v, startMonth);
  await page.$eval('#f-s-phone', (el, v) => el.value = v, phone);
  const before = await page.$$eval('.stucard', els => els.length);
  await page.click('#mStudentSave');
  await page.waitForFunction(n => document.querySelectorAll('.stucard').length === n, { timeout: 5000 }, before + 1);
  await sleep(150);
}
await addStudent('Rahim', 'Class 8', '3000', '2026-10', '01711111111');
await addStudent('Karim', 'Class 10', '4000', '2026-10', '');
await addStudent('Shila', 'Class 5', '5000', '2026-10', '');
eq('3 student cards', await page.$$eval('.stucard', els => els.length), 3);
ok('card shows fee/mo', (await page.$eval('.stucard', el => el.textContent)).includes('3,000'));

// 2. inline validation
await page.click('#btnAddStudent');
await sleep(200);
await page.click('#mStudentSave');
await sleep(200);
eq('error box visible', await page.$eval('#mStudentErrs', el => getComputedStyle(el).display), 'block');
ok('name required error', (await page.$eval('#mStudentErrs', el => el.textContent)).includes('Name is required.'));
await page.$eval('#f-s-name', el => el.value = 'Future Kid');
await page.$eval('#f-s-fee', el => el.value = '1000');
await page.$eval('#f-s-start', el => el.value = '2026-11');
await page.click('#mStudentSave');
await sleep(200);
ok('future start month error', (await page.$eval('#mStudentErrs', el => el.textContent)).includes('Start month cannot be in the future.'));
await page.click('#mStudentCancel');
await sleep(200);
eq('no phantom student added', await page.$$eval('.stucard', els => els.length), 3);

// 3. dashboard with no payments
await page.click('#tabDash');
await sleep(300);
eq('expected 12,000', await page.$eval('#vExpected', el => el.textContent.trim()), '12,000');
eq('outstanding 12,000', await page.$eval('#vOutstanding', el => el.textContent.trim()), '12,000');

// helper: record payment via a card's pay button
async function payViaCard(cardIdx, amount, date, method, month) {
  await page.click('#tabStudents');
  await sleep(200);
  const btns = await page.$$('.stucard [data-act="pay"]');
  await btns[cardIdx].click();
  await sleep(250);
  if (month) await page.$eval('#p-month', (el, v) => el.value = v, month);
  await page.$eval('#p-amount', (el, v) => el.value = v, amount);
  await page.$eval('#p-date', (el, v) => el.value = v, date);
  await page.select('#p-method', method);
  await page.click('#mPaySave');
  await page.waitForFunction(() => document.getElementById('ovPay').hidden, { timeout: 5000 });
  await sleep(150);
}
async function dashVals() {
  await page.click('#tabDash');
  await sleep(300);
  return await page.$$eval('#view-dash .stat .v', els => els.map(e => e.textContent.trim()));
}

// 4. two payments -> hand-verified math
await payViaCard(0, '3000', '2026-10-13', 'bkash');
await payViaCard(1, '4000', '2026-10-13', 'cash');
let v = await dashVals();
eq('expected 12,000 (3 students)', v[0], '12,000');
eq('collected 7,000', v[1], '7,000');
eq('outstanding 5,000', v[2], '5,000');
eq('rate 58.33%', v[3], '58.33%');

// 5. partial payment
await payViaCard(2, '2000', '2026-10-13', 'nagad');
v = await dashVals();
eq('collected 9,000 after partial', v[1], '9,000');
eq('outstanding 3,000 after partial', v[2], '3,000');
eq('rate 75.00%', v[3], '75.00%');

// 6. add 4th student starting September -> arrears across months
await addStudent('Nabila', 'Class 9', '2000', '2026-09', '');
v = await dashVals();
eq('expected 14,000', v[0], '14,000');
eq('collected still 9,000', v[1], '9,000');
eq('outstanding 5,000', v[2], '5,000');
eq('rate 64.29%', v[3], '64.29%');
eq('all-time collected 9,000', await page.$eval('#stAllTime', el => el.textContent.trim()), '9,000');
eq('total arrears 7,000', await page.$eval('#stArrears', el => el.textContent.trim()), '7,000');

// 7. dues view: sorted desc, overdue + in-days badges
await page.click('#tabDues');
await sleep(300);
const dueRows = await page.$$('.duerow');
eq('dues rows = 2', dueRows.length, 2);
const firstDue = await page.$eval('.duerow', el => el.textContent);
ok('Nabila first (owes most)', firstDue.includes('Nabila'));
ok('Nabila total 4,000', firstDue.includes('4,000'));
ok('overdue badge', firstDue.includes('Overdue'));
ok('13 day(s) overdue', firstDue.includes('13 day(s) overdue'));
ok('in 18 day(s) for current month', firstDue.includes('in 18 day(s)'));
ok('September 2026 row', firstDue.includes('September 2026'));
const secondDue = await page.$$eval('.duerow', els => els[1].textContent);
ok('Shila second', secondDue.includes('Shila'));

// 8. payment validation: zero amount rejected
await page.click('#tabStudents');
await sleep(200);
const payBtns = await page.$$('.stucard [data-act="pay"]');
await payBtns[2].click();
await sleep(250);
await page.$eval('#p-amount', el => el.value = '0');
await page.click('#mPaySave');
await sleep(200);
ok('zero amount rejected', (await page.$eval('#mPayErrs', el => el.textContent)).includes('Amount must be positive.'));
await page.click('#mPayCancel');
await sleep(150);

// 9. record Nabila's September payment via dues row (prefills oldest unpaid month)
await page.click('#tabDues');
await sleep(300);
await page.click('.duerow [data-act="pay"]');
await sleep(250);
eq('pay modal prefilled Sep', await page.$eval('#p-month', el => el.value), '2026-09');
await page.$eval('#p-amount', el => el.value = '2000');
await page.$eval('#p-date', el => el.value = '2026-09-15');
await page.select('#p-method', 'nagad');
await page.click('#mPaySave');
await page.waitForFunction(() => document.getElementById('ovPay').hidden, { timeout: 5000 });
await sleep(200);
await page.click('#tabDash');
await sleep(300);
eq('arrears now 5,000', await page.$eval('#stArrears', el => el.textContent.trim()), '5,000');
eq('all-time 11,000', await page.$eval('#stAllTime', el => el.textContent.trim()), '11,000');

// 10. history: filter, delete
await page.click('#tabHistory');
await sleep(300);
const nabilaId = await page.evaluate(() => window.__TFT_state().students.find(s => s.name === 'Nabila').id);
await page.select('#histStudent', nabilaId);
await sleep(300);
eq('history filtered to 1', await page.$$eval('.histrow', els => els.length), 1);
const htxt = await page.$eval('.histrow', el => el.textContent);
ok('history shows 2,000', htxt.includes('2,000'));
ok('history shows Nagad', htxt.includes('Nagad'));
ok('history shows 2026-09-15', htxt.includes('2026-09-15'));
await page.click('.histrow [data-act="del"]');
await sleep(400);
eq('history row deleted', await page.$$eval('.histrow', els => els.length), 0);
ok('noHistory empty text', (await page.$eval('#histList', el => el.textContent)).includes('No payments recorded yet'));
await page.click('#tabDash');
await sleep(300);
eq('arrears back to 7,000', await page.$eval('#stArrears', el => el.textContent.trim()), '7,000');

// 11. BN toggle + persistence
await page.click('#langBtn');
await sleep(300);
eq('h1 in Bengali', await page.$eval('#h-title', el => el.textContent.trim()), '\u099f\u09bf\u0989\u09b6\u09a8 \u09ab\u09bf \u099f\u09cd\u09b0\u09cd\u09af\u09be\u0995\u09be\u09b0');
eq('stat expected Bengali digits', await page.$eval('#vExpected', el => el.textContent.trim()), '\u09e7\u09ea,\u09e6\u09e6\u09e6');
eq('dash month Bengali', await page.$eval('#dashMonth', el => el.textContent.trim()), '\u0985\u0995\u09cd\u099f\u09cb\u09ac\u09b0 \u09e8\u09e6\u09e8\u09ec');
eq('lang persisted', await page.evaluate(() => localStorage.getItem(window.__TFT.LANG_KEY)), 'bn');
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__TFT_READY === true, { timeout: 8000 });
await sleep(300);
eq('lang persists after reload', await page.$eval('#h-title', el => el.textContent.trim()), '\u099f\u09bf\u0989\u09b6\u09a8 \u09ab\u09bf \u099f\u09cd\u09b0\u09cd\u09af\u09be\u0995\u09be\u09b0');
eq('students persist after reload', await page.evaluate(() => window.__TFT_state().students.length), 4);
await page.click('#langBtn'); // back to EN
await sleep(250);

// 12. export -> wipe -> import round-trip through the app
const payloadJson = await page.evaluate(() =>
  JSON.stringify(window.__TFT.exportPayload(
    window.__TFT_state().students, window.__TFT_state().payments, window.__TFT_state().asof)));
ok('export payload has 4 students', JSON.parse(payloadJson).students.length === 4);
await page.click('#tabTools');
await sleep(200);
await page.click('#btnClear');
await sleep(400);
eq('clear-all wipes students', await page.evaluate(() => window.__TFT_state().students.length), 0);
ok('cleared toast', (await page.$eval('#toast', el => el.textContent)).includes('All data cleared.'));
const impRes = await page.evaluate(j => window.__TFT_import(j), payloadJson);
eq('import ok', impRes.ok, true);
await sleep(300);
eq('students restored', await page.evaluate(() => window.__TFT_state().students.length), 4);
eq('payments restored', await page.evaluate(() => window.__TFT_state().payments.length), 3);
ok('imported toast', (await page.$eval('#toast', el => el.textContent)).includes('Imported 4 student(s), 3 payment(s).'));

// 13. malformed import rejected, data intact
const badRes = await page.evaluate(() => window.__TFT_import('{"app":"nope"}'));
eq('malformed import rejected', badRes.ok, false);
await sleep(200);
ok('importBad toast', (await page.$eval('#toast', el => el.textContent)).includes('Invalid file'));
eq('data intact after bad import', await page.evaluate(() => window.__TFT_state().students.length), 4);

// 14. Excel (.xlsx) export -- button present, bytes valid, click works
await page.setViewport({ width: 1280, height: 900 });
await page.click('#tabTools');
await sleep(300);
eq('xlsx button label', await page.$eval('#btnExportXlsx', el => el.textContent.trim()), 'Export Excel (.xlsx)');
const xlsxLen = await page.evaluate(() => window.__TFT_xlsxLen());
ok('xlsx bytes generated (' + xlsxLen + ')', xlsxLen > 2000);
// verify the builder's TextEncoder path works in the real browser (node tests use the Buffer path)
const sig = await page.evaluate(() => {
  const b = TFT_XLSX.build([
    { name: 'S1', rows: [[{ v: 'H', bold: true }], ['hello']] },
    { name: 'S2', rows: [] }, { name: 'S3', rows: [] }, { name: 'S4', rows: [] },
  ]);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return { pk: b[0] === 0x50 && b[1] === 0x4B, hello: s.indexOf('<t>hello</t>') >= 0, sheet: s.indexOf('name="S1"') >= 0 };
});
ok('in-page xlsx PK signature', sig.pk);
ok('in-page xlsx content intact', sig.hello && sig.sheet);
await page.click('#btnExportXlsx'); // triggers real download; must not throw
await sleep(600);
// switch to Bangla and confirm the button label localizes
await page.click('#langBtn');
await sleep(300);
eq('xlsx button label (bn)', await page.$eval('#btnExportXlsx', el => el.textContent.trim()), 'এক্সেল ডাউনলোড (.xlsx)');
const xlsxLenBn = await page.evaluate(() => window.__TFT_xlsxLen());
ok('xlsx bytes generated in bn (' + xlsxLenBn + ')', xlsxLenBn > 2000);
await page.click('#langBtn'); // back to English
await sleep(300);

// 15. mobile 390px -- no horizontal overflow
await page.setViewport({ width: 390, height: 844 });
await sleep(300);
await page.click('#tabDash');
await sleep(300);
eq('no overflow on dashboard at 390px', await page.evaluate(() => document.documentElement.scrollWidth <= 390), true);
await page.click('#tabDues');
await sleep(300);
eq('no overflow on dues at 390px', await page.evaluate(() => document.documentElement.scrollWidth <= 390), true);
await page.click('#tabStudents');
await sleep(300);
eq('no overflow on students at 390px', await page.evaluate(() => document.documentElement.scrollWidth <= 390), true);

// 15. errors & network
eq('console errors', consoleErrors.length, 0);
eq('page errors', pageErrors.length, 0);
eq('network requests (file/data only)', netRequests, 0);

await browser.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
