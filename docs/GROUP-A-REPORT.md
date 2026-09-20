# FitSync AI — GROUP A Implementation Report

**Verify date:** 2026-09-21 · Backend tests 33/33 pass · Client lint clean · Client build OK · Client tests 13/13 pass · Live boot smoke OK

Admin safety, real-gym payment integrity, attendance integrity, and centralized gym timezone.

---

## Result: DONE

---

## Per-task status

| Task | Status | Notes |
|---|---|---|
| T1 — Admin bootstrap from env-only credentials | ✅ DONE | Empty DB → admin created from `ADMIN_EMAIL`/`ADMIN_PASSWORD`; never default creds; fails loudly if creds missing/weak (<8 chars, letters+digits required); skipped when users exist. |
| T2 — Payment safety (no fake completion) | ✅ DONE | COMPLETED requires legitimate confirmation (`POST /api/payments/:id/verify`, admin-only, records `confirmedBy`/`confirmedAt`); member "I have paid" click keeps payment PENDING + notifies admins; production refuses to boot without a real gateway (`ensureProductionPaymentConfig`); placeholder UPI ids rejected; demo path is non-production only. |
| T3 — Membership-gated check-in (manual + QR) | ✅ DONE | Server-side gate: only ACTIVE membership with endDate ≥ now passes; expired/inactive/deactivated → 403; non-member target → 404; "ends later today" still allowed. |
| T4 — Centralized gym timezone | ✅ DONE | `server/utils/gymTime.js` single source (default Asia/Kolkata), loaded at boot from GymSetting, re-detectable, used by attendance/analytics/stats; validated via Settings page. |
| T5 — One check-in per gym day | ✅ DONE | `dayKey` (gym-local `YYYY-MM-DD`) + unique partial index `{user:1, dayKey:1}`; pre-check + E11000 backup → clean 400 on duplicate; concurrent duplicates verified to produce exactly one record. |
| T6 — Membership controlled by payment | ✅ DONE | Payment create → membership PENDING → activated ONLY on COMPLETED; `complimentary: true` is the only direct-activation path; refund cancels linked membership; PENDING/FAILED never activate. |
| T7 — Admin Settings page (server + UI) | ✅ DONE | `GET/PUT /api/settings` (admin-only, IANA timezone validation, gymTime cache sync, returns payment-method status without secrets); new `admin/Settings.jsx` + route + sidebar link. |
| AllData escalation lock | ✅ DONE | `EDITABLE_FIELDS`: `users` no `role`; `memberships` no `status`; `payments` no `status`. Verified via API: AllData cannot escalate/flip. |
| Renewal safety | ✅ DONE | `PUT /memberships/:id/renew` requires explicit `{ acknowledged: true }` (else 400). |
| Backend test suite | ✅ DONE | node:test, in-process app, dedicated test DB, 33/33 green (see below). |
| Docs/env | ✅ DONE | `.env.example` (bootstrap + payment + ML-not-wired), README, `server` test script. |

---

## Files changed (with reason)

**New**
- `server/utils/paymentConfig.js` — placeholder detection, `upiConfigured`/`stripeConfigured` (requires `sk_live_`), `hasRealPaymentConfig`, `describePaymentConfig`, `ensureProductionPaymentConfig` (T2).
- `server/utils/bootstrapAdmin.js` — safe first-admin provisioning (T1).
- `server/utils/membershipActivation.js` — single activation helper used by payments/verify (T6).
- `server/utils/gymTime.js` — centralized timezone math (T4).
- `server/test/helpers.js`, `server/test/gymTime.test.js`, `server/test/paymentConfig.test.js`, `server/test/bootstrap.test.js`, `server/test/core.test.js` — test suite.
- `client/src/pages/admin/Settings.jsx` — Admin Settings UI (T7).

**Modified**
- `server/models/Attendance.js` — `dayKey` + unique partial index `{user:1, dayKey:1}` (T5).
- `server/models/Payment.js` — `confirmedBy` (ObjectId→User), `confirmedAt` (Date) (T2).
- `server/routes/attendance.js` — membership gate, dayKey dedup, gym tz stats/bounds, `/today` select now includes `dayKey` (T3/T4/T5).
- `server/routes/payments.js` — verify endpoint, amount-vs-plan validation, PENDING→COMPLETED activation, refund cancels membership, target-role member check, reuse of existing PENDING membership for user+plan, gym tz stats + latest-12 revenue (T2/T6).
- `server/routes/checkout.js` — production 503 instead of silent completion; UPI confirm keeps PENDING + "submitted for verification" + admin notification (T2).
- `server/routes/memberships.js` — PENDING unless complimentary, renew `acknowledged`, target-role check (T6).
- `server/routes/settings.js` — IANA timezone validation + gymTime sync + payment status (T7).
- `server/routes/analytics.js` — gym month/day/hour boundaries everywhere; revenue-trend latest-12 ascending (T4).
- `server/routes/admin.js` — AllData `EDITABLE_FIELDS` lock.
- `server/server.js` — refactored to export `{ app, createApp, startServer, loadGymTimezone, backfillAttendanceDayKeys }`; boot order connectDB → load tz → backfill dayKeys → bootstrap → prod payment guard → listen/cron/socket/expiry (T1).
- `server/package.json` — `"test": "node --test --test-concurrency=1 \"test/*.test.js\""`.
- `.env.example`, `README.md` — fresh-install bootstrap, real payment-gateway requirements, ML service marked NOT wired.
- `client/src/App.jsx`, `client/src/components/common/Sidebar.jsx` — `/admin/settings` route + nav.
- `client/src/pages/admin/Payments.jsx` — Verify button for PENDING, verify request, plan→amount autofill, payment-method hint.
- `client/src/pages/admin/Memberships.jsx` — complimentary checkbox, PENDING explanation, renew confirm sending `acknowledged: true`.
- `client/src/pages/member/Membership.jsx` — UPI confirm message now factual ("submitted for verification").

---

## Tests executed

Backend (node:test, HTTP-level against in-process app on `fitsync-ai-test`, Node 24):
- `gymTime.test.js` — 7/7: IST boundaries, month start, weekday, wall-time→UTC, cache switching.
- `paymentConfig.test.js` — 6/6: placeholder detection, UPI id rules, stripe live-key rule, production boot guard, non-prod allowed.
- `bootstrap.test.js` — 5/5: fresh-DB admin creation + login, skip on existing users, missing creds fail, weak password rejected.
- `core.test.js` — 16/16: registration role lock, AllData escalation/status lock, manual+QR gate (403 no-membership), wrong-amount 400 / correct-amount activates PENDING, one-check-in-per-gym-day + clean 400, **concurrent duplicate QR → exactly one record**, ends-today passes / expired fails after `expireMemberships()`, UPI flow (claim stays PENDING → admin verify completes + activates), cash-not-UPI confirm 400, refund cancels membership, renew-without-ack 400 / with-ack 200, complimentary-only activation, settings admin-only + invalid timezone 400 + cache sync, revenue-trend latest-12 ascending, gym-day analytics boundaries via dayKey, admin-cannot-activate-admin.
- **Total: 33/33 pass.**

Client: `npm run lint` (oxlint) **clean**; `npm run build` (vite) **OK**; `npm run test` (vitest) **13/13 pass**.

Boot smoke (live `startServer` on scratch DB): admin bootstrap, `GET /api/health`, admin `POST /api/auth/login` → role `admin`, clean shutdown. Scratch DB removed.

End-to-end: all group workflows exercised as API journeys with real auth tokens inside the integration suite (register → admin owns AllData → assign membership/complimentary → payment verify → check-in gate → analytics tz boundaries → settings timezone validation → bootstrap).

---

## Migrations / index changes

`Attendance` gains a unique partial index **`{ user: 1, dayKey: 1 }`** with `partialFilterExpression: { dayKey: { $type: 'string' } }` (old records → null dayKey are ignored; `backfillAttendanceDayKeys()` at boot fills missing dayKeys for existing attendance so the index can apply). Existing `{user:1,date:1}` index kept. MongoDB builds this automatically on first boot after deploy; for an existing live DB run `db.attendance.createIndex({ user: 1, dayKey: 1 }, { unique: true, partialFilterExpression: { dayKey: { $type: 'string' } } })` after the backfill.

`Payment` adds `confirmedBy`/`confirmedAt` — no index needed.

## Environment variables

- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — first-boot admin (must be ≥8 chars, letters+digits). Set both explicitly on every environment; production should refuse to leave them.
- `STRIPE_SECRET_KEY` — only `sk_live_...` counts as configured for production.
- `UPI_ID`, `UPI_NAME` — real id required for production (placeholder patterns rejected).
- `ML_SERVICE_URL` — NOT consumed by the API (ML not wired).

## Deployment notes

1. Fresh install: `npm run seed` is dev-only sample data (does not bootstrap an admin). Set `ADMIN_EMAIL`/`ADMIN_PASSWORD`; production boots with a real gateway or refuses to start.
2. Existing installs: one-time index creation for attendance (see Migrations) — the app backfills dayKeys at boot automatically.
3. `NODE_ENV=production` + live `sk_live_` Stripe key (or real UPI id) is the supported production payment path; verification is manual admin approval (`Payments → Verify`) for UPI, webhook auto-complete for Stripe.

## Remaining / known gaps
- ML service remains unintegrated (out of scope; documented in README).
- Stripe confirm observation: in production, `POST /api/checkout/confirm/:paymentId` returns 503 (no silent auto-complete) — Stripe completion happens through the webhook.
- `client` component tests are API-mocked (vitest), not browser E2E.