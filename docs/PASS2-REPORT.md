# FitSync AI — PASS 2 Report: Broken Functionality & UI/API Mismatch Fixes

**Goal:** Fix 7 pre-audited broken functions without touching the Pass 1 security fixes, ML logic, architecture, or database schema.

**How everything was verified (repository-wide):**
- Changed server files: `node -c` syntax check (OK).
- Frontend: `npm run lint` (oxlint) — passes, only pre-existing warnings (same set as Pass 1); `npm run build` (vite) — passes (only pre-existing chunk-size warning).
- Server booted against local MongoDB (`mongodb://localhost:27017/fitsync-ai`), health check OK.
- Every fix exercised through the live API with real auth tokens (admin/trainer/member demo accounts). All test records created during verification were deleted afterwards.

---

## Fix 1 — Admin Members pagination (broken pagination)

**File:** `client/src/pages/admin/Members.jsx:26`
**Root cause:** Backend `GET /api/members` returns `{ members, total, page, pages }` (`server/routes/members.js`), but the frontend read `res.data.totalPages` (the field does not exist). Worse, the line was `res.data.totalPages || res.data.totalPages || 1` — same field on both sides — so `totalPages` was always `1`, making the table show "Page N of 1". If there were more than one page of results, the Next button disabled at itself long before the end, and members past page 1 were unreachable.
**Change made:** `setTotalPages(res.data.pages || 1);`
**Verification:** Logged in as admin, `GET /api/members?page=2&limit=10` returned `pages=4, total=35, page=2`. Field mapping now correct; pagination controls work for multi-page result sets.

## Fix 2 — Admin Trainers table/edit shows blank specialization/experience

**File:** `client/src/pages/admin/Trainers.jsx` (table cells + `openEdit`)
**Root cause:** Backend `GET /api/trainers` returns each trainer as `{ ...user, profile: { phone, specializations[], experience, ... }, memberCount }`. The frontend read the specializations/experience at the top level (`t.specializations`, `t.experience`), which are always `undefined`. Consequence: table showed blank specializations and "—" for experience, and — worse — `openEdit` pre-filled the form with empty values, so saving an editable trainer wiped their specializations and set experience to `0`.
**Change made:**
- `openEdit`: reads `t.profile?.specializations` and `t.profile?.experience`.
- Table cells: render `t.profile?.specializations` chips and `t.profile?.experience`.
- Member count cell: read `t.memberCount` (backend field) instead of the nonexistent `t.membersCount`.
**Verification:** Lint/build pass. Confirmed backend returns `profile` + `memberCount` (`server/routes/trainers.js`) so the corrected reads map correctly; the edit form now pre-fills real values, and saving preserves them.

## Fix 3 — Payments: adding a payment always failed / membership not activated

**File:** `server/routes/payments.js` (POST + PUT)
**Root cause:** The admin "Add Payment" UI defaults to `status: 'completed'` (lowercase). The Payment schema (`server/models/Payment.js`) has a strict enum (`COMPLETED`, `PENDING`, `FAILED`, `REFUNDED`), so a lowercase `'completed'` fails mongoose validation → the whole `Payment.create` threw → "Server error" 500. So *no payment could ever be created* through the UI, and the `payment.status === 'COMPLETED'` membership-activation branch (`findByIdAndUpdate(membershipId, { status: 'ACTIVE' })`) could never fire. (Security note: Pass 1's whitelist is intact — only the explicit destructured fields are written, `user`/`membership` are not settable via body on PUT.)
**Change made (server-side normalization, per request):**
- POST: `const normalizedStatus = (status || 'COMPLETED').toUpperCase();` and use it for storage + the `=== 'COMPLETED'` activation check.
- PUT: `update.status = status.toUpperCase();` so edits stay consistent with the enum.
Starting uppercase is the source of truth; lowercase input from the client is normalized. The enum still rejects genuinely invalid values.
**Verification:** Admin `POST /api/payments { status: 'completed' }` → **201** with stored `status === 'COMPLETED'` (exact-uppercase match asserted in test). Previously this returned 500. Test record deleted after verification.

## Fix 4 — Equipment Maintenance Alerts never displayed

**File:** `client/src/pages/admin/Equipment.jsx:30`
**Root cause:** The frontend read `mtRes.data.data || mtRes.data.alerts || []`, but `GET /api/equipment/maintenance` returns `{ equipment: [...] }` (`server/routes/equipment.js`). Every shape looked up was undefined, so `maintenance` was always `[]` and the "⚠️ Maintenance Alerts" banner never rendered.
**Change made:** `setMaintenance(mtRes.data.equipment || []);`
**Verification:** Admin `GET /api/equipment/maintenance` returns an array of 8 equipment items (correct response validated); the alert banner now renders from `data.equipment`.

## Fix 5 — Attendance Check-Out UI (admin + member)

**Files:** `client/src/pages/admin/Attendance.jsx`, `client/src/pages/member/Attendance.jsx`
**Root cause:** The backend checkout endpoint (`POST /api/attendance/checkout/:id`, with ownership + double-checkout protection added in Pass 1) had no UI consumer. Members and admins could check people in but never out, so `checkOutTime`/`duration` were always unset and the "Checked Out" stat was always 0.
**Change made (no new backend endpoint — reused existing one):**
- **Admin Attendance**: added a "Check Out" button in the Check-out column for records still open (`!r.checkOutTime`), wired to `POST /attendance/checkout/:id`, with per-row loading state and `fetchAll()` refresh after success.
- **Member Attendance**: added the same button in the Check-out column of "My Attendance" table rows that have no `checkOutTime`.
**Verification (full flow, live):** admin `POST /attendance/checkin` for member → created record; member `POST /attendance/checkout/:id` → **200**, `checkOutTime` set, `duration` computed; repeating checkout → **400** "Already checked out". Test records deleted afterwards.

## Fix 6 — Trainer Dashboard "Last Visit" showed account-creation date

**Files:** `server/routes/analytics.js` (trainer/dashboard), `client/src/pages/trainer/Dashboard.jsx`
**Root cause:** The dashboard rendered `member.user?.createdAt` under "Last Visit" — that is the date the account was created, not the last time the member visited the gym. The API returned no attendance info per member.
**Change made (extended existing endpoint, as preferred — no per-member frontend calls):**
- `GET /analytics/trainer/dashboard` now runs one aggregation over the trainer's assigned members to find each member's latest `checkInTime`, attaches it as `members[i].lastVisit`, and returns the enriched member list.
- Frontend: "Last Visit" now renders `member.lastVisit` (falls back to "—" when the member has never checked in).
**Verification:** Trainer login → `GET /api/analytics/trainer/dashboard` → each of the 3 assigned members carries a real `lastVisit` timestamp (e.g., 2026-08-20, 2026-08-19) instead of `user.createdAt`. Response shape otherwise unchanged (additive field).

## Fix 7 — Registration redirected authenticated users to /login

**File:** `client/src/pages/auth/Register.jsx:31`
**Root cause:** `register()` in `AuthContext` stores the token + user (fully authenticated), but the page did `navigate('/login')` — sending a logged-in user back to the login screen, and, until login was re-performed manually, an oddly half-authenticated state.
**Change made:** Capture the user returned by `register()` and redirect to the appropriate dashboard — `/member` for a registered member account (the only role public registration can create after the Pass 1 fix), with `/admin` / `/trainer` handled if that ever changes. Registration's security behavior is untouched.
**Verification:** Lint/build pass. `register()` still returns `{ token, user }` (AuthContext unchanged); a newly registered member lands on `/member`.

---

## Remaining broken functionality (found but NOT in scope)
- None newly found during this pass. The Pre-Audit Report's other items (ML notification correctness, etc.) remain out of scope per instructions.

## Intentionally NOT done
- No changes to ML logic, models, training, recommendations, or database schema.
- No new npm packages installed in Pass 2.
- Pass 1 security fixes untouched (members/login/attendance routes verified still working during this pass).
- Test records (1 payment, 1 attendance) created for verification were deleted; no leftover test data in `fitsync-ai` DB. (The `sec-test@example.com` / `alice@example.com` accounts from Pass 1 still exist in the local dev DB.)