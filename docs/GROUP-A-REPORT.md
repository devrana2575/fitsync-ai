# FitSync AI — GROUP A Implementation Report (detailed)

**Verify date:** 2026-09-21 · Backend tests **33/33** pass · Client lint **clean** (oxlint) · Client build **OK** (vite) · Client tests **13/13** pass (vitest) · Live boot smoke **OK**

**Delivery:** committed + pushed to `main` as `c8f097d`, origin `github.com/devrana2575/fitsync-ai`.

Scope: **admin safety, payment integrity (no fake completion), attendance integrity (one check-in per gym day, membership-gated check-in), centralized gym timezone.**

---

## 1. Constraints honored (regression baseline)

No new frameworks; no model/PASS-1/architectural rewrites; API response shapes preserved; existing behaviours kept: auto-expiry (`expireMemberships`), expiry/low-attendance notifications, trainer dashboard member scoping + member isolation, goal progress math, manual check-in/out + duration, UPI QR UX, role auth middleware, dashboards, workouts, diet checklists.

Backwards-compat kept: old `{user, date}` unique attendance index retained; legacy rows without `dayKey` are backfilled at boot; `/today`, `/stats`, analytics shapes unchanged (only additive fields); `POST /checkout/:id`, `/my`, `/active/:userId` behaviour unchanged.

---

## 2. Design decisions (why)

| Decision | Reason |
|---|---|
| Production boot hard-fails without a real gateway (`sk_live_` or real UPI id) | A server that boots but can only take fake payments is worse than one that refuses. |
| Membership is created **PENDING**; activated only via `activateMembershipFromPayment()` | Single authoritative activation path — "ACTIVE without payment" is structurally impossible except the explicit `complimentary` flow. |
| `complimentary: true` is the only direct-activation switch in memberships API | The gym needs an offline grant channel; explicit + cancels prior ACTIVE keeps it auditable. |
| Renewal requires `acknowledged: true` | Legacy counter-renewal grants ACTIVE without an online payment; explicit ack prevents accidental silent activation. |
| `dayKey` (gym-local `YYYY-MM-DD`) + unique partial index `{user:1, dayKey:1}` | DB-level uniqueness under concurrent requests; partial filter (`dayKey: {$type:'string'}`) means legacy rows are untouched. |
| `requireActiveMembership` checks `endDate >= now()` on the **instant** | "Membership ends later today" must still allow today's check-in; comparing against gym-day start would wrongly lock them out. |
| Member UPI click keeps payment **PENDING**, appends note, notifies every active admin | Scanning a QR is a payee-address convenience, not verification; admin approval is the completion gate. |
| New `POST /api/payments/:id/verify` writes `confirmedBy`/`confirmedAt` + activates | Audit trail of WHO (admin ObjectId) and WHEN a manual completion was approved. |
| COMPLETED requires amount == plan price (when plan/membership linked) | A typed/mistyped amount (incl. 0) can't activate a membership; enforced on POST, PUT, and verify. |
| Frontend member UPI confirm now says "submitted for verification… activates once confirmed" | UI no longer lies that membership is instantly active. |
| Gym timezone centralized in `server/utils/gymTime.js`, `Intl`-based, host-independent | Previous "today"/months used server-local time — a UTC host flips gym days. Settings page updates the cached zone live. |
| `/today` + `/stats` query with `$or: [dayKey, date-bounds]` | Correct for backfilled rows and any residual legacy rows. |
| Tests boot the real app in-process on `fitsync-ai-test` with rate-limit disabled | Real middleware/auth/HTTP round-trips; dev DB untouched. `node:test` + global fetch; no new packages. |

---

## 3. Task-by-task detail

### T1 — Admin bootstrap from env-only credentials

**`server/utils/bootstrapAdmin.js` (new):**
- `bootstrapAdmin()` counts users. Users exist → `{status:'skipped'}`, touches nothing.
- Empty DB + `ADMIN_EMAIL` missing/invalid (`/^\S+@\S+\.\S+$/`) → **throws** with actionable message (mentions dev `npm run seed`).
- Empty DB + `ADMIN_PASSWORD` < 8 chars or missing a letter OR a digit → **throws**.
- Else `User.create({ name:'Gym Admin', email, password, role:'admin' })`; bcrypt hashing happens in the User model pre-save hook — never plaintext, never logged; email lowercased; no default credentials anywhere.

**`server/server.js` (refactored, 169 lines):**
- Exports `{ app, createApp, startServer, loadGymTimezone, backfillAttendanceDayKeys }`; `require.main === module` guard (importing doesn't auto-listen — enables tests).
- `startServer({skipBootstrap})` boot order: `connectDB()` → `loadGymTimezone()` (reads `GymSetting.timezone`) → `backfillAttendanceDayKeys()` → `bootstrapAdmin()` (unless skip) → `ensureProductionPaymentConfig()` → `app.listen` → `startCronJobs()`/`initSocket()`/`expireMemberships()`.
- `createLimiter()` → no-op when `NODE_ENV=test`; production/dev limits unchanged (`/api/auth` 50/15m, `/api` 300/15m).
- `backfillAttendanceDayKeys()`: `distinct('date',{dayKey:{$exists:false}})`, then per-date `updateMany` sets `dayKey=getGymDateKey(instant)`; idempotent, logs count.

### T2 — Payment safety

**`server/utils/paymentConfig.js` (new):**
- `UPI_PLACEHOLDER_PATTERN = /(fitsync@okaxis|yourname@|\.example\b|\@example)/i` rejects the shipped sample + obvious stubs.
- `upiConfigured()` = non-empty, not `#…`-commented, not placeholder.
- `stripeConfigured()` = `STRIPE_SECRET_KEY` starts with **`sk_live_`** (test keys are deliberately not "configured").
- `hasRealPaymentConfig()` = stripe OR upi; `describePaymentConfig()` → `{method:'stripe'}` | `{method:'upi', upiId}` | `{method:'unconfigured'}` (never credentials).
- `ensureProductionPaymentConfig()`: non-production → no block; production without real config → **throws**.

**`server/routes/checkout.js` (rewritten):**
- Stripe client initialized only for `sk_` keys (test/dev allowed); production gate uses the live-key check.
- `POST /create` (member): plan must be active. No gateway + production → **503**. No gateway + non-prod → **demo fallback**: PENDING membership + PENDING `method:'online'` payment with note `DEMO/DEVELOPMENT checkout … Not available in production`.
  Gateway present → membership and payment are **always created PENDING first**. Stripe: Checkout Session (INR, `unit_amount = price*100`, metadata user/membership/plan/payment), persist `session.id` → `{url, mode:'stripe'}`. UPI: reference `FS<last10id>` as `transactionId` → `{mode:'upi', upiId, upiName, amount, note, reference, planName}`.
- `POST /confirm/:paymentId` (member): **production → 503** "Automatic payment confirmation is disabled in production." Non-prod only simulates a gateway, notes marked `(DEMO/DEVELOPMENT simulated gateway)`; ownership check → 403.
- `GET /upi/qr/:paymentId` (member): builds `upi://pay` URI (pa/pn/am/cu INR/tn/tr), renders **SVG QR** (errorCorrectionLevel H); guards: ownership, must be `upi` method, UPI configured — else 400.
- `POST /upi/confirm/:paymentId` (member): **never completes.** Keeps status PENDING, appends `via <upiId> (ref …) - member submitted for verification`, `notifyAdminsPaymentVerification()` notifies **every active admin** ("Payment Verification Needed" + amount + ref). Response: "Payment submitted for verification. The gym will confirm once the payment is received."
- Webhook: `checkout.session.completed` → sets COMPLETED (attributed to gateway; `confirmedBy`/`confirmedAt` left blank by design), activates membership, notifies member. Signature verified when `STRIPE_WEBHOOK_SECRET` present; raw-body route mounted before JSON parser.

**`server/routes/payments.js` (rewritten):**
- `POST /` (admin): target must be **role member** (else 400 "Selected user is not a member"); status normalized `.toUpperCase()`; `validatePlanAmount`; if no `membershipId` but `planId` → **reuse existing PENDING membership** for user+plan (prevents duplicate pending rows from the Assign flow) else create **PENDING** membership; COMPLETED counter payments are signed with `confirmedBy`/`confirmedAt`; COMPLETED → activate + notify.
- **`POST /:id/verify` (admin, NEW):** 404 if missing; already COMPLETED → idempotent ok; REFUNDED → 400 "A refunded payment cannot be approved"; re-validates amount vs plan; sets COMPLETED + `confirmedBy`/`confirmedAt` + notes `(verified by <admin>)`; activates membership; notifies member.
- `PUT /:id` (admin): only whitelisted fields; →COMPLETED re-validates amount + signs; →REFUNDED signs and **cancels the linked ACTIVE membership** (refund must not leave access); PENDING/FAILED accepted; other status → 400 "Invalid payment status".
- `GET /` (admin list w/ status/user/date filters), `GET /my` (member), `GET /stats`: gym month start + timezone in `$dateToString`; trend = COMPLETED grouped by gym `%Y-%m`, sort desc, `$limit:12` → **latest-12**; plus `totalRevenue`/`monthlyRevenue`/`pendingAmount`.
- `makeReceiptNumber()` = `INV-YYYYMMDD-<4hex>`.

**`server/utils/membershipActivation.js` (new):**
`activateMembershipFromPayment(membershipId)`: no-op if missing/ACTIVE/CANCELLED; **cancels any other ACTIVE membership for the same user**; EXPIRED or no valid endDate → fresh window `[now, now + plan.duration days]`; sets ACTIVE.

### T3 — Membership-gated check-in

**`server/routes/attendance.js` (rewritten):**
- `requireActiveMembership(userId)` = `{user, status:'ACTIVE', endDate:{$gte:now}}` (instant-based).
- `POST /checkin` (admin/trainer): not found or not member → **404** "Member not found"; deactivated → **403**; no active membership → **403** "Active membership required for check-in".
- `POST /qr-checkin` (member): self-check-in, same gate. `method:'qr'`, 201.
- Dedup in both: in-flow `findOne` pre-check **and** `E11000` catch → clean **400** "Already checked in today" (survives concurrent requests).
- `GET /today`: `findTodayFilter()` = `$or:[{dayKey:todayKey},{date:[dayStart,dayEnd)}]`; `/today` select now includes `dayKey`.
- `GET /` list: optional gym-local `date=YYYY-MM-DD` via `getGymDayStartOnDateKey`.
- `GET /batch-today`: `userIds` + optional date, gym-day semantics. `/my`, `POST /checkout/:id` unchanged.
- `GET /stats` (admin): `todayCount` via same `$or`; `monthlyRecords` grouped `{$dateToString … timezone}` from `getGymMonthStart()`; `hourlyDistribution` `{$hour … timezone}` over trailing 30 days.

### T4 — Centralized gym timezone

**`server/utils/gymTime.js` (new, 118 lines):** default `Asia/Kolkata` (env `GYM_TIMEZONE`).
- `tzOffsetMs` + `zonedDayStart` — DST-safe via `Intl.DateTimeFormat` parts (noon-guess), **host-independent**.
- `getGymDayStart/End(now)` → instants at 00:00 gym-local today / next day.
- `getGymDayStartOnDateKey('YYYY-MM-DD')` → instant at 00:00 of that gym-local day.
- `getGymDateKey(now)` → `YYYY-MM-DD` (the attendance dayKey) via `en-CA` format.
- `getGymMonthStart/End`, `getGymWeekdayName` ("monday"…), `isDateWithinGymDay`, `gymWallTimeToUtc`.
- `setGymTimezone`/`getGymTimezone` shared cache.

**`server/routes/analytics.js`** now uses gym math everywhere: dashboard `today`/`tomorrow`/`startOfMonth` = `getGymDayStart`/`getGymDayEnd`/`getGymMonthStart`; member dashboard weekday = `getGymWeekdayName()`; trainer dashboard boundaries same; `attendance-trend` 30d window from `getGymDayStart(now-30d)` grouped gym-local `%Y-%m-%d`; `peak-hours` with `{$hour … timezone}`; `monthly-revenue` `{$year/$month … timezone}` sort desc limit 12.
- **Bug fixed:** `GET /admin/revenue-trend` returned the *oldest* 12 months; now groups gym-local year/month, sorts desc, limits 12, then JS-sorts **back to ascending** (oldest-of-last-12 first), keeping the `{_id:{year,month}}` shape `Analytics.jsx`/`Dashboard.jsx` consume.

### T5 — One check-in per gym day

**`server/models/Attendance.js` adds:**
```js
dayKey: { type: String }
attendanceSchema.index({ user: 1, dayKey: 1 },
  { unique: true, partialFilterExpression: { dayKey: { $type: 'string' } } });
```
- Partial ⇒ legacy rows (dayKey null) are ignored by uniqueness; only new records are protected.
- Old `{user:1, date:1}` unique kept; `date:-1`, `user`, `user:1,checkInTime:-1` kept.
- Every check-in route writes `dayKey = getGymDateKey()` and catches `error.code === 11000`.

### T6 — Membership controlled by payment

**`server/models/Payment.js` adds** `confirmedBy` (ObjectId→User) + `confirmedAt` (Date).

**`server/routes/memberships.js`:**
- `POST /` (admin): target role member check (400 otherwise); `complimentary === true` → creates **ACTIVE** and **cancels any existing ACTIVE** for that user; otherwise → creates **PENDING**. `status:'ACTIVE'` is unreachable without the flag.
- `PUT /:id/renew` (admin): **requires `body.acknowledged === true`** else 400; on ack rolls start/end from plan.duration and sets ACTIVE.
- `PUT /:id/cancel`, `GET /`, `/my`, `/active/:userId`, `/stats` unchanged.

### T7 — Gym settings (server + UI)

**`server/routes/settings.js`:** `GET` (any authenticated) → `{ settings, payment: describePaymentConfig() }` (branding public for sidebar/announcements; **no credentials**). `PUT` admin-only; `isValidTimezone` via `Intl` try/catch → 400 `Invalid timezone: <tz>`; empty payload → 400; persists to `GymSetting`; **calls `setGymTimezone(tz)` immediately** so all date math follows the new zone.

**`client/src/pages/admin/Settings.jsx` (new, 174 lines):** form for name/address/phone/email/currency (max 3)/timezone (`datalist` of 16 common IANA zones)/operating hours; two StatCards (timezone + location); read-only **Online Payments** panel colored by method — stripe (green), upi (sky), unconfigured (amber warning: members can't complete online checkout; production refuses to boot). Guards: loading spinner, error+retry state, "Settings saved" feedback.

**`client/src/App.jsx`:** lazy `AdminSettings` + `<Route path="settings">` under the admin layout. **`client/src/components/common/Sidebar.jsx`:** `Cog6ToothIcon` + "Settings" admin nav item.

### Frontend support changes
- **`admin/Payments.jsx`:** Verify button for PENDING rows → `POST /payments/:id/verify` + refresh; `handlePlanChange` autofills amount from plan price; amount-field hint.
- **`admin/Memberships.jsx`:** Assign modal gains `complimentary` checkbox; note explains PENDING vs complimentary; renew opens a confirm dialog and sends `{ acknowledged: true }`.
- **`member/Membership.jsx`:** UPI confirm alert now factual: "Payment submitted for verification by the gym. Your membership will activate once the payment is confirmed."

### AllData escalation lock
**`server/routes/admin.js` `EDITABLE_FIELDS`:** `users` no longer has `role`; `memberships` no longer has `status`; `payments` no longer has `status` (comments explain activation/completion is governed by the verify/lifecycle paths). The PUT loop `if (!allowed.has(key)) continue;` is the enforcement — unknown/forbidden keys are silently dropped.

---

## 4. Duplicate check-in: the race and its real root cause

Initial integration test "concurrent duplicate QR check-ins" failed intermittently. Investigating showed the cause was **not** a missing index:

1. Isolated script (`Promise.allSettled([create, create])` on `{user, dayKey}`) → one `rejected` (E11000), count=1. Index physics fine.
2. Passing a different assertion (`/today` global `count`) blamed the wrong line — `/today` counts **all members**, and a prior test's check-in in the same gym day made it 2.
3. After index rebuild in test setup, an extra read + serialization slowed the flow so the pre-check caught the duplicate (201 + 400 "Already checked in today"), member-scoped count = 1.

Conclusion: the dedup is enforced two ways (pre-check + DB unique partial index). The test now asserts member-scoped single record **and** that the member appears exactly once in `/today`. `server/test/helpers.js` `setup()` re-runs `m.init()` after `dropDatabase()` so the schema indexes are really in place during the suite.

---

## 5. Backend test suite

**Stack:** `node:test`, real app via `createApp()`, real HTTP (global `fetch`), dedicated DB `mongodb://localhost:27017/fitsync-ai-test` (or `MONGODB_URI_TEST`). `server/package.json` `"test": "node --test --test-concurrency=1 \"test/*.test.js\""` (glob form — the `test/` directory form fails on Node 24/Windows).

**`helpers.js`:** env prepared before any server require (`NODE_ENV=test`, `JWT_SECRET`, real UPI id `testbank@okaxis`, live Stripe keys deleted); `setup()` connect → drop → rebuild all indexes → `setGymTimezone('Asia/Kolkata')` → listen(0); `teardown()` drops + closes; `request(method, path, {token, body})`; unique email; `registerMember` (public route), `createAdmin`/`createTrainer` (model), `login`, `adminContext`.

**gymTime.test.js (7/7):** day key computed in gym tz (18:30Z → next IST day); day start/end align to IST midnight; `isDateWithinGymDay` respects boundaries; month start = first gym-local day; weekday in gym tz; `gymWallTimeToUtc` 9:00 IST → 03:30 UTC; tz cache switching (Kolkata → Karachi).

**paymentConfig.test.js (5/5):** placeholders detected; `upiConfigured` only real ids; `stripeConfigured` requires `sk_live_` (this test caught the earlier `sk_` bug); production boot refuses placeholder/missing (throws); non-production never blocks.

**bootstrap.test.js (5/5):** fresh DB → admin created + login via API works; skipped when users exist; missing creds on empty DB fail loudly; weak password rejected.

**core.test.js (16/16):**
1. registration hardcodes member role; member can read settings
2. AllData cannot escalate roles or flip membership/payment status
3. member without active membership cannot check in (manual or QR → 403)
4. wrong amount rejected (400); correct amount activates the PENDING membership
5. active member checks in once per gym day; duplicate is clean 400
6. **concurrent duplicate QR check-ins produce exactly one record**
7. membership ending later today still allows check-in; expired one rejected after `expireMemberships()`
8. UPI flow: member claim keeps PENDING; admin verify completes and activates
9. cash (non-UPI) payment confirm via UPI endpoint → 400
10. refunding a payment cancels the linked ACTIVE membership
11. renew without `acknowledged:true` → 400; with ack → 200
12. `complimentary` flag is the only way to activate via memberships API
13. settings are admin-only for writes; invalid timezone → 400; cache updated
14. revenue trend returns latest-12 ascending
15. gym timezone controls analytics/dashboard day boundaries via attendance dayKey
16. admin cannot activate another admin through membership assignment

**Total: 33/33 pass** (5 bootstrap + 16 core + 7 gymTime + 5 paymentConfig = 33).

---

## 6. Validation actually run (all green)

| Command | Result |
|---|---|
| `node --test --test-concurrency=1 "test/*.test.js"` (server) | 33/33 · duration ~6.5 s |
| `npm.cmd test` (server, updated script) | 33/33 |
| `npm.cmd run lint` (client, oxlint) | clean (unused-imports warnings removed) |
| `npm.cmd run build` (client, vite) | ✓ built in ~550 ms |
| `npm.cmd test` (client, vitest) | 13 passed (2 files) |
| Live boot smoke (`startServer` on scratch DB) | admin created via env, `/api/health` ok, admin login 200 rôle admin, clean shutdown; scratch DB dropped |

Test databases used and removed (`fitsync-ai-boot-smoke`, `fitsync-ai-test2`); the persistent suite DB `fitsync-ai-test` is expected to stay.

---

## 7. Deploy / migration notes

**Existing live DB (one-time):** after deploying the new code (it backfills `dayKey` at boot), create the unique partial index:
```js
db.attendance.createIndex({ user: 1, dayKey: 1 },
  { unique: true, partialFilterExpression: { dayKey: { $type: 'string' } } });
```
Run the backfill first (or let boot do it) so the partial index covers every row. `Payment` gains `confirmedBy`/`confirmedAt` — no index needed.

**Env vars:** `ADMIN_EMAIL`/`ADMIN_PASSWORD` (first-boot admin; ≥8 chars, letters+digits); `STRIPE_SECRET_KEY` only `sk_live_` counts for production; `UPI_ID` must be real in production; `ML_SERVICE_URL` is NOT consumed by the API (documented).

**Run:** `npm run seed` stays dev-only sample data (does not create an admin). Production starts `node server.js` with the vars above; it will refuse to boot without a real gateway.

---

## 8. Known remaining gaps

- ML service (port 8001) still not wired into the API — documented in README as out of scope.
- Stripe production completion is webhook-driven; the synchronous confirm endpoint returns 503 in production by design.
- Client vitest coverage is API-mocked, not browser E2E.
- `{user, date}` unique index still present — if two rows for the same user ever shared the *same millisecond instant*, date-index uniqueness could raise a false duplicate (dayKey is the intended day key).