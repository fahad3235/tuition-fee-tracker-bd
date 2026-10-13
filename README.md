# Tuition Fee Tracker BD

A free, fully offline, bilingual (English / Bengali) monthly tuition-fee tracker
for Bangladesh private tutors. Track students, record fee payments across
bKash / Nagad / Rocket / cash, see who owes what each month, and keep a full
payment history -- all in the browser, no account, no server.

## The problem

Private tutoring is a huge industry in Bangladesh, and most
tutors track monthly fees in paper notebooks: who paid, who paid partially,
who owes for last month. Notebooks get lost, partial payments get forgotten,
and dues quietly pile up. This app replaces the notebook with a simple offline
ledger: each student owes their monthly fee from their start month onward,
payments are recorded per month, and the dashboard always shows expected vs
collected vs outstanding.

## Features

1. **Student management** -- add / edit / delete students: name, class/grade,
   monthly fee (BDT), start month, optional phone, active/inactive toggle.
   Inline validation (name required, fee must be positive, start month cannot
   be in the future, phone format checked when given).
2. **Fee collection ledger** -- record payments per student per month (amount,
   date, method: Cash / bKash / Nagad / Rocket / Bank / Other). Multiple
   payments per month allowed; partial payments and overpayments are both
   supported. A student owes their fee every month from their start month;
   a month is overdue when it ends unpaid or partially paid.
3. **Dashboard** -- current-month stat cards: expected, collected, outstanding,
   collection rate %; plus all-time collected and total arrears across all
   students and months.
4. **Dues view** -- students with outstanding balances, sorted by total owed
   (highest first), with per-month rows, "in X day(s)" for the current month
   and "Overdue" badges for past months; one-tap record-payment per row
   (prefills the oldest unpaid month).
5. **Payment history** -- chronological list per student, filterable by student
   and month, with confirm-guarded delete.
6. **Data tools** -- JSON export download, JSON import with strict validation
   (malformed files are rejected and existing data is left untouched),
   confirm-guarded clear-all.
7. **Bilingual + offline** -- EN/Bengali toggle persisted in localStorage,
   Bengali digit rendering, all data in localStorage, zero network requests,
   responsive down to 390px, empty states everywhere, no demo data (ships empty).

Money is stored as **integer paisa** internally to avoid float error; the
exported JSON carries integer paisa amounts.

## Stack

Vanilla HTML / CSS / JS only. No frameworks, no build step, no CDN, zero
network requests by design. `logic.js` holds pure, DOM-free functions
(unit-testable in Node); `index.html` holds the UI layer.

## Prerequisites

Any modern browser (Chrome, Edge, Firefox, Safari). For tests: Node.js 18+
and headless Chromium (tests use `/opt/meta-chromium/chrome` via
`puppeteer-core`).

## Install

No install needed -- open `index.html` in a browser, or serve the folder with
any static server:

```bash
cd tuition-fee-tracker-bd
python3 -m http.server 8000
# open http://localhost:8000
```

## Dev commands

```bash
node tests/run-node-tests.js   # 129 pure-logic unit checks
node tests/smoke.mjs           # 73 headless-Chrome checks (needs puppeteer-core)
```

For the smoke test, `puppeteer-core` must be resolvable (e.g. `npm i
puppeteer-core` or a `node_modules` symlink to a sibling build that has it).

### The `?asof=YYYY-MM-DD` query param

The app honors `?asof=YYYY-MM-DD` to override "today", so dashboards and due
dates are deterministic for testing. Example:

```
index.html?asof=2026-10-13
```

Without it, the real current date is used.

## Testing (real results, 2026-10-13)

Run `node tests/run-node-tests.js` -> **129/129 passed, 0 failed**.
Run `node tests/smoke.mjs` (headless Chromium via puppeteer-core, `file://`,
`?asof=2026-10-13`) -> **73/73 passed, 0 failed**, with 0 console errors,
0 page errors, 0 non-file/data network requests.

Key hand-verified assertions in the smoke test: 3 students with fees
3000/4000/5000 BDT -> dashboard "expected 12,000"; recording 3000 + 4000 ->
"collected 7,000", "outstanding 5,000", rate "58.33%" (exact strings); a
partial 2000 on the 5000-fee student -> "9,000" / "3,000" / "75.00%"; a 4th
student starting 2026-09 adds cross-month arrears -> rate "64.29%",
all-time "9,000", total arrears "7,000"; dues sorted highest-owed first with
"Overdue", "13 day(s) overdue", and "in 18 day(s)" badges; Bengali toggle
renders Bengali digits ("14,000" in Bengali digits) and persists across reload; export ->
clear-all -> import restores 4 students + 3 payments; malformed import is
rejected with data intact; 390px mobile shows no horizontal overflow.

One logic repair during development: the first unit run exposed that import
re-ran exported integer-paisa amounts through the BDT->paisa form validators
(double conversion). Fixed by splitting form-level (BDT) and stored-level
(integer paisa) validators. Full detail in `TEST_RESULTS.md`.

## Deployment

Static files -- deploy anywhere static hosting works. GitHub Pages: push the
folder contents to a repo and enable Pages; `index.html` is the entry point.

## Limitations

- Single-device: data lives in the browser's localStorage; no sync, no
  multi-user, no backup unless you export JSON regularly.
- No authentication: anyone with the browser profile can see the data.
- Months are calendar months; there is no per-student custom billing cycle.
- A student who stops tutoring should be toggled inactive; past dues remain
  listed until paid (by design).
- This is a personal tracker, not accounting software (see footer).

## Status

Built and tested 2026-10-13 (factory run #49). Ships empty -- add your own
students to begin.
