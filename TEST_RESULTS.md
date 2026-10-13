# TEST_RESULTS.md -- tuition-fee-tracker-bd (run #49, 09:00 slot, 2026-10-13)

## Uniqueness note
No overlap with the 48 prior factory ledger runs or the 59 fahad3235 GitHub repos.
No tuition/student-fee project exists anywhere in either list. Nearest neighbors:
invoice-maker-bd (freelancer one-off invoices, not recurring monthly fees),
bd-shop-manager (POS/inventory), budget-planner-bd (personal monthly budget).
First factory project in the private-tutor lane. Bangladesh relevance: private
tutoring is a huge BD industry; tutors track monthly fees across students in
notebooks and lose track of dues. Ships EMPTY -- no demo students, no fabricated data.

## Node unit tests -- 129/129 passed, 0 failed
`node tests/run-node-tests.js`

- Date helpers: todayISO local (no TZ bug), monthKey, isMonth/isDate strictness
  (rejects 2026-13, Feb 30), monthsBetween ranges incl. year boundary,
  daysInMonth/monthEnd, daysUntilMonthEnd('2026-10-13') = 18.
- Money as integer paisa: toPaisa('10.50') = 1050, garbage -> NaN;
  fmtMoney(1200000) = "12,000", fractional 105050 -> "1,050.50";
  Bengali digits: fmtMoney(1400000,'bn') = "14,000" in Bengali digits;
  fmtRate(7000,12000) = "58.33", fmtRate(9000,14000) = "64.29", zero-expected -> "0.00".
- Validation: valid student/payment; empty name, zero/negative/non-numeric/over-cap
  fee, future start month, bad month format, bad phone rejected; optional phone ok.
  Payment: zero/negative/non-numeric amount, future date, bad date, bad month,
  bad method rejected.
- Normalize: trims, fee BDT->paisa, active defaults true, ids assigned.
- Ledger (hand-verified scenario, asof 2026-10-13): 3 students fees
  3000/4000/5000 start 2026-10 -> expected 1200000 paisa; payments 3000+4000 ->
  collected 700000, outstanding 500000, rate "58.33"; partial 2000 on 5000-fee ->
  outstanding 300000, rate "75.00"; overpayment 6000 on 3000-fee -> collected
  600000, outstanding 0 (surplus counts as collected); inactive excluded;
  future-start excluded.
- Dashboard with 4th student (Nabila, 2000, start 2026-09): expected "14,000",
  collected "9,000", outstanding "5,000", rate "64.29%", all-time "9,000",
  total arrears "7,000" (Sep 2000 + Oct 3000+2000).
- Dues sorted desc (Nabila 4000, Shila 3000); dueDayInfo: current month
  "in 18 day(s)", Sep "13 day(s) overdue"; empty when fully paid.
- History: newest-first sort, student + month filters, paymentSums grouping.
- Import/export: export app id + integer-paisa amounts; JSON round-trip exact
  (fee/amount intact, no double conversion); stored-paisa import accepted;
  unknown extra keys tolerated; 11 malformed cases rejected
  (null/array/wrong app/missing students/non-array/empty name/future startMonth/
  non-integer paisa fee/dangling studentId/future payment date/non-integer paisa amount).
- i18n: EN/BN key parity (74/74), {n}/{m} placeholders, missing-key fallback,
  fmtMonth EN "October 2026" / BN "October 2026" in Bengali.

Repairs: 1 logic fix during development -- the first unit run exposed that
`validateImport` re-ran export data (already integer paisa) through the
BDT->paisa form validators, double-converting 300000 paisa to 30000000.
Fixed by splitting validators: form-level (BDT strings) vs stored-level
(integer paisa, enforced by `isPaisaInt`), with `normalizeStoredStudent` /
`normalizeStoredPayment` keeping paisa as-is. Export format is documented as
integer paisa in the README.

## Headless-Chrome smoke -- 79/79 passed, 0 failed
`node tests/smoke.mjs` (puppeteer-core, /opt/meta-chromium/chrome, file://, ?asof=2026-10-13)

Hand-verified in browser: empty states on all views (no students / no dues /
no history); dashboard zeros; add 3 students via modal; inline validation
("Name is required.", "Start month cannot be in the future."); no phantom
student after failed submits; dashboard with no payments (expected 12,000);
record payments 3000 (bKash) + 4000 (Cash) -> collected "7,000", outstanding
"5,000", rate "58.33%" (exact strings); partial 2000 -> "9,000" / "3,000" /
"75.00%"; 4th student (start 2026-09) -> expected "14,000", rate "64.29%",
all-time "9,000", arrears "7,000"; dues sorted Nabila-first with "Overdue",
"13 day(s) overdue", "in 18 day(s)", "September 2026" rows; zero-amount
payment rejected; dues-row pay button prefills oldest unpaid month (2026-09);
Sep payment recorded -> arrears "5,000", all-time "11,000"; history filter by
student (1 row: "2,000", "Nagad", "2026-09-15"); delete payment -> empty
state, arrears back to "7,000"; BN toggle renders the Bengali app title +
Bengali digits and Bengali month names, persisting across reload;
export->clear-all->import round-trip restores 4 students + 3 payments with
"Imported 4 student(s), 3 payment(s)." toast; malformed import rejected with
"Invalid file" toast and data intact; 390px mobile no horizontal overflow on
dashboard, dues, and students views; 0 console errors; 0 page errors;
0 non-file/data network requests.

Repairs: 0 (smoke passed first run).

## Source hygiene
Pure-ASCII sources: `grep -rP '[^\x00-\x7F]' .` returns zero matches.
Bengali text exists only as \uXXXX escapes in JS strings and the i18n dict.
No secrets, no demo data, no fabricated claims. Footer carries the
"personal tracker, not accounting software" disclaimer in both languages.

## XLSX export tests (added 2026-10-13)
- `node tests/xlsx.test.js` -- 33/33 passed: ZIP walked entry-by-entry
  (local headers, stored method, CRC32 match, central directory, EOCD),
  Bengali UTF-8 intact, XML specials escaped, bold header style, 4 sheet
  names in workbook.xml, rejects != 4 sheets, empty sheets valid.
- Smoke (in-page): xlsx button label EN/BN, `__TFT_xlsxLen()` > 2000 bytes
  with seeded data in both languages, `TFT_XLSX.build` verified in the real
  browser (TextEncoder path: PK signature + content intact), real download
  click throws nothing, 0 console/page errors, 0 network requests.
- `xlsx.js` is dependency-free (stored ZIP entries, no deflate) so the app
  stays 100% offline; sources remain pure ASCII (Bengali as \uXXXX).
