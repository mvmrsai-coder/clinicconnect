# Phase 5.13 — ClinicConnect Production Readiness & Deployment Audit

## Verdict

**READY WITH CONDITIONS**.

The ClinicConnect application passes typechecking, the authenticated RLS gate,
appointment conflict protection, WhatsApp consent verification, onboarding API
verification, and the complete local regression suite. Production deployment
should wait for the conditions listed below:

1. Apply and inspect migrations 001–045 in a disposable staging/fresh-database
   rehearsal. This was not run against the current local database because the
   local Supabase CLI could not write its telemetry temporary file (`EPERM`),
   and no separate disposable database was available.
2. Set and validate the production environment variables below, including
   Supabase Auth redirect/origin configuration and WhatsApp webhook settings.
3. Execute the post-deployment smoke and cross-account checks in the checklist.

No production systems were accessed or changed during this audit.

## 1. Environment audit

### Public/browser-safe variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_APP_LOCALE`

The browser Supabase client uses only the public URL and anon key. The server
SSR client uses the same public pair with cookie adapters.

### Server-only variables

- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY`
- `META_APP_SECRET`
- `META_APP_ID`
- `AUTOMATION_CRON_SECRET`
- `ALLOWED_INVITE_HOSTS`
- `WHATSAPP_TEMPLATES_DRY_RUN`
- `AI_REQUEST_TIMEOUT_MS`
- `AI_CONTEXT_MESSAGE_LIMIT`

`SUPABASE_SERVICE_ROLE_KEY` is referenced only by server-side modules/routes
(webhook, automation/API-key internals, and the WACRM WhatsApp configuration
uniqueness check). No ClinicConnect browser code imports those modules, and no
service-role credential is used by the ClinicConnect security tests.

`ENCRYPTION_KEY` protects stored WhatsApp and AI provider credentials. It must
be a stable production secret; rotating it without a re-encryption plan makes
existing encrypted values unreadable.

### Test/development-only variables

- `TEST_CLINIC_A_EMAIL`
- `TEST_CLINIC_A_PASSWORD`
- `TEST_CLINIC_A_ACCOUNT_ID`
- `TEST_CLINIC_B_EMAIL`
- `TEST_CLINIC_B_PASSWORD`
- `TEST_CLINIC_B_ACCOUNT_ID`
- `TEST_ONBOARDING_APP_PORT`
- `ALLOWED_DEV_ORIGINS`

The `TEST_CLINIC_*` variables are loaded by integration tests and are not read
by production ClinicConnect application code. `.env.test.local` is ignored by
the repository `.gitignore` (`.env*` with only example files unignored).

`WHATSAPP_TEMPLATES_DRY_RUN` must be unset or false in production. It is a
test/development switch, not a production safety mechanism.

### Secret/hardcoding review

No credential values, access tokens, JWTs, service-role keys, or password
values were found hardcoded in source. `.env.local.example` contains names and
placeholders only. Vitest contains deterministic dummy test values for module
tests; these are not production configuration.

## 2. Supabase migration audit

There are 45 numerically ordered migrations, 001 through 045. The dependency
sequence is coherent: the initial schema precedes account sharing; account
sharing precedes ClinicConnect composite foreign keys, RLS, grants, and
onboarding features.

Important extensions and database mechanisms:

- `uuid-ossp` is created by migration 001.
- `vector` is created by migration 030 for AI knowledge search.
- `btree_gist` is created by migration 041 for appointment exclusion.
- Account membership and role checks use `is_account_member()`.
- Multiple `SECURITY DEFINER` functions implement account/member RPCs,
  invitation handling, triggers, aggregation, and scoped retrieval.
- Updated-at, profile privilege, notification, webhook, and aggregation
  triggers are defined across the earlier migrations.

ClinicConnect-specific migrations:

- **040** grants authenticated DML on ClinicConnect operational tables and
  contacts.
- **041** adds the active-doctor/time exclusion constraint for appointments.
- **042** creates account-scoped append-oriented WhatsApp consent events with
  authenticated SELECT/INSERT grants.
- **043** adds the coarse `clinic_profiles.onboarding_status` state and check.
- **044** grants authenticated SELECT on `profiles`.
- **045** grants authenticated SELECT on `accounts`.

The migration files were not modified. A fresh-database application rehearsal
was not possible without risking the current local database; the CLI also
failed while attempting to write its telemetry temporary file. The ordered SQL
is suitable for a one-time fresh application, but migration history must be
used for deployment and reruns must not be performed manually.

## 3. RLS, privilege, and constraint audit

RLS is enabled for ClinicConnect tables:

- `clinic_profiles`
- `clinic_doctors`
- `clinic_services`
- `doctor_schedules`
- `patient_profiles`
- `appointments`
- `whatsapp_consent_events`

Existing account-scoped RLS also protects `contacts`, `profiles`, `accounts`,
`whatsapp_config`, and message/template data.

The authenticated privilege path required by `getCurrentAccount()` and the
ClinicConnect services is covered by migrations 040, 042, 044, and 045. The
27/27 authenticated RLS integration passed, so cross-account reads and writes
remain isolated. No anon DML grants were added by the ClinicConnect migrations.

Database protections include:

- Composite patient/contact tenancy foreign key from migration 039.
- Composite doctor, service, schedule, patient, and appointment foreign keys.
- Appointment time-range and status checks.
- Migration 041 exclusion constraint preventing overlapping active doctor
  appointments.
- Consent insert policy requiring agent membership and
  `recorded_by_user_id = auth.uid()`.
- No UPDATE/DELETE policy or grant for consent events; application writes are
  append-only.

Direct catalog verification of every privilege/RLS flag was not available in
this environment; the conclusions above are based on migration definitions
and successful authenticated integration execution.

## 4. Authentication and session audit

- `src/lib/supabase/client.ts` exposes only the public Supabase URL and anon
  key.
- `src/lib/supabase/server.ts` uses `createServerClient` with Next cookie
  adapters and does not expose secrets.
- Middleware refreshes Supabase sessions with `auth.getUser()`.
- `getCurrentAccount()` derives user, profile, account, and role from the
  authenticated session; it never accepts a browser-selected account.
- `requireRole()` applies the owner > admin > agent > viewer hierarchy.
- Dashboard pages render inside the authenticated `DashboardShell`; APIs
  independently enforce authentication and role authorization.
- Unauthenticated API calls return 401 through the shared error contract.
- Browser `account_id` overrides are rejected or ignored by ClinicConnect
  routes; role and recorder fields are server-derived.

The middleware protected-path list does not explicitly include every
`/clinicconnect` page, but these pages are inside `DashboardShell`, which fails
closed and redirects unauthenticated users client-side. ClinicConnect pages
load protected data through authenticated APIs rather than direct browser
database mutations. A server-side middleware path addition could be considered
later as defense-in-depth, but no protected-data exposure was observed.

## 5. ClinicConnect API security matrix

| Route | Auth | Role | Account scope | Mutation | Error contract |
|---|---|---|---|---|---|
| `GET /api/clinicconnect/onboarding` | Required | Any member | `getCurrentAccount()` | No | 401; generic 500 |
| `POST /api/clinicconnect/onboarding/status` | Required | Admin+ | `requireRole()` | Yes | 400/401/403/409/500 |
| `GET /api/clinicconnect/profile` | Required | Any member | `getCurrentAccount()` | No | 401/500 |
| `PUT /api/clinicconnect/profile` | Required | Admin+ | `requireRole()` | Yes | 400/401/403/500 |
| `GET/POST /api/clinicconnect/doctors` | Required | Read any; write admin+ | Context | POST | 401/403/500 |
| `GET/PUT /api/clinicconnect/doctors/:id` | Required | Read any; write admin+ | Context + account filter | PUT | 401/403/404/500 |
| `GET/POST /api/clinicconnect/services` | Required | Read any; write admin+ | Context | POST | 401/403/500 |
| `GET/PUT /api/clinicconnect/services/:id` | Required | Read any; write admin+ | Context + account filter | PUT | 401/403/404/500 |
| `GET/POST /api/clinicconnect/schedules` | Required | Read any; write admin+ | Context | POST | 400/401/403/500 |
| `GET/PUT /api/clinicconnect/schedules/:id` | Required | Read any; write admin+ | Context + account filter | PUT | 400/401/403/404/500 |
| `GET/POST /api/clinicconnect/patients` | Required | Read any; write admin+ | Context | POST | 400/401/403/404/500 |
| `GET/PUT /api/clinicconnect/patients/:id` | Required | Read any; write admin+ | Context + account filter | PUT | 400/401/403/404/500 |
| `GET /api/clinicconnect/appointments` | Required | Any member | Context | No | 400/401/500 |
| `POST /api/clinicconnect/appointments` | Required | Admin+ | Context | Yes | 400/401/403/409/500 |
| `GET/PUT /api/clinicconnect/appointments/:id` | Required | Read any; write admin+ | Context + account filter | PUT | 401/403/404/409/500 |
| `GET /api/clinicconnect/appointments/availability` | Required | Any member | Context + resource ownership checks | No | 400/401/404/500 |
| `GET /api/clinicconnect/whatsapp/readiness` | Required | Any member | Context | No | 401/500 |
| `GET /api/clinicconnect/whatsapp/consent` | Required | Viewer+ | `requireRole('viewer')` | No | 400/401/403/404/500 |
| `POST /api/clinicconnect/whatsapp/consent` | Required | Agent+ | `requireRole('agent')` | Yes | 400/401/403/404/500 |
| `GET /api/whatsapp/config` | Required | Any authenticated user | Profile-derived account | No | 401/200 diagnostic/500 |
| `POST /api/whatsapp/config` | Required | Admin+ | `requireRole('admin')` | Yes | 400/401/403/409/500 |
| `DELETE /api/whatsapp/config` | Required | Admin+ | `requireRole('admin')` | Yes | 401/403/500 |

The final three rows are existing WACRM configuration endpoints used by the
WhatsApp UI, not ClinicConnect database services. POST/DELETE were explicitly
hardened in Phase 5.12A. The POST route still has a server-only service-role
uniqueness lookup for phone-number conflicts; this is not browser-accessible,
but should remain separately reviewed as a least-privilege operational path.

No route accepts a client role or authoritative account selector. Consent
recorders are derived from the authenticated user. Unknown database errors are
collapsed by `toErrorResponse()` for ClinicConnect routes.

## 6. Frontend security audit

- ClinicConnect pages are inside the dashboard shell and use `useAuth()` for
  role-aware UI gates.
- Profile, doctor, service, schedule, patient, and appointment mutation UI is
  hidden/disabled below admin, while server routes enforce the same boundary.
- Consent recording is gated at agent level in both UI and API.
- Onboarding transitions are gated at admin level in both UI and API.
- No ClinicConnect component imports a service-role client or secret.
- No ClinicConnect sensitive credentials are stored in localStorage or
  sessionStorage. Theme preferences are the only local browser persistence
  found in the audited scope.

## 7. Build and test audit

`npm.cmd run typecheck` passed.

The authoritative Phase 5.13A regression result is:

- 41 files passed.
- 259 tests passed.
- 0 failed.
- 0 skipped.

The previous onboarding setup failure was caused by concurrent execution of
`onboarding.integration.test.ts` and `onboarding-api.integration.test.ts`
against the same one-profile-per-account fixtures. A shared OS-temp
integration lock corrected the test-harness isolation issue. It was not an
application, schema, RLS, or constraint defect.

Verified gates:

- RLS integration: 27/27.
- Role authorization: passed.
- Appointment conflict integration: passed.
- WhatsApp consent integration: passed.
- Onboarding HTTP integration: passed.
- Typecheck: passed.

The onboarding HTTP readiness harness retains bounded 10-second probes, a
45-second overall deadline, child lifecycle handling, bounded output, and
cleanup in `afterAll`.

## 8. Error handling and observability

ClinicConnect route errors generally use typed domain errors and
`toErrorResponse()`, which prevents raw SQL, stack traces, and Supabase error
objects from reaching clients. Validation messages are intentionally returned
for actionable 400 responses.

The adjacent WACRM WhatsApp configuration routes log server-side errors and may
return Meta diagnostic messages to the authenticated caller. Stored access
tokens are encrypted and are not returned in response bodies.

Logging is currently `console.error`/`console.warn` oriented. Production would
benefit from structured logs, request/correlation IDs, security-event logging,
and a clear retention policy. These are P2 operational improvements, not
implemented in this audit.

## 9. Data protection audit

ClinicConnect stores:

- Names, phone numbers, and email in existing account-scoped `contacts`.
- Date of birth, gender, language, and notes in `patient_profiles`.
- Doctor identity, qualifications, contact details, and bios in
  `clinic_doctors`.
- Appointment dates, times, statuses, notes, and lifecycle timestamps in
  `appointments`.
- Consent events and metadata in append-oriented
  `whatsapp_consent_events`.
- WhatsApp credentials in encrypted `whatsapp_config` fields.

Account RLS and composite foreign keys enforce tenant isolation. Account
deletion cascades through ClinicConnect records. Contact deletion cascades to
patient profiles and consent events; related appointments cascade through their
foreign keys. Consent is append-only for normal authenticated application
operations, although account/contact deletion intentionally removes dependent
records.

Backup, restore, retention, deletion SLAs, privacy notices, healthcare
regulatory obligations, and WhatsApp/Meta contractual compliance require an
operator/legal review; they cannot be inferred from the schema alone.

## 10. Deployment checklist

### Pre-deployment

- Set the production variable names listed in the environment audit.
- Keep service-role, encryption, Meta, and cron secrets server-only.
- Configure Supabase Auth site URL, redirect URLs, cookie domain, and allowed
  origins for the production hostname.
- Apply migrations 001–045 in order to a disposable staging project first.
- Verify migration history, RLS, privileges, functions, triggers, and the
  migration 041 exclusion constraint.
- Configure storage buckets/policies used by existing WACRM features.
- Configure WhatsApp/Meta webhook URL, verify token, app secret, WABA, and
  phone-number settings; keep template dry-run disabled.
- Set `NEXT_PUBLIC_SITE_URL` and, where appropriate, `ALLOWED_INVITE_HOSTS`.
- Run typecheck, build, and the complete relevant tests against clean fixtures.

### Deployment

- Apply migrations in numeric order before enabling the new application build.
- Deploy the immutable application build and matching environment configuration.
- Verify startup, health endpoint behavior, Supabase connectivity, and cookie
  session refresh.
- Run smoke tests with one authenticated clinic account.

### Post-deployment

- Authenticate and load onboarding/profile.
- Exercise doctor, service, schedule, patient, appointment, and availability
  reads/writes with authorized roles.
- Verify appointment conflict rejection.
- Verify WhatsApp readiness without requiring a Meta mutation.
- Verify consent history and OPT_IN/OPT_OUT recording.
- Verify cross-account reads and writes are denied.
- Verify unauthenticated APIs return 401 and admin-only APIs return 403.
- Inspect logs for leaked SQL, tokens, cookies, or stack traces.

## 11. Classified findings

### P0 — blocks production

None confirmed.

### P1 — fix or verify before production

1. **Fresh-database migration rehearsal is outstanding.** Evidence: no
   disposable Supabase validation environment was available and the local CLI
   telemetry write failed. Impact: deployment ordering and catalog state have
   not been empirically verified on a clean project. Action: rehearse 001–045
   in disposable staging before production. Code/database change: deployment
   procedure only.
2. **Production Supabase/Auth/Meta environment validation is outstanding.**
   Evidence: only local Supabase and test credentials were exercised. Impact:
   incorrect redirects, cookies, origins, encryption keys, or webhook secrets
   can prevent login or messaging. Action: complete the checklist with staging
   values. Code/database change: configuration only.

### P2 — should fix soon

1. Replace console-only operational logging with structured logs, correlation
   IDs, and security-event monitoring.
2. Review the server-only service-role paths for least privilege and explicit
   operational ownership, especially the WACRM WhatsApp configuration conflict
   lookup.
3. Move the Content Security Policy from report-only to enforced mode after
   production telemetry confirms required sources.
4. Consider adding `/clinicconnect` explicitly to middleware protected paths as
   defense-in-depth, while retaining API authorization as the boundary.

### P3 — deferred/improvement

1. Formal backup/restore drills, retention schedules, and documented deletion
   workflows.
2. Legal/privacy/healthcare and WhatsApp/Meta compliance review.
3. Broader production observability and formal disaster-recovery runbooks.

## 12. Required release conditions

The production readiness verdict can move from **READY WITH CONDITIONS** to
**READY** after:

- Migrations 001–045 pass a disposable staging/fresh-database rehearsal.
- Production environment, Supabase Auth, storage, domain/origin, and Meta
  settings pass the deployment checklist.
- Post-deployment authenticated and cross-account smoke tests pass.

No code, schema, migration, RLS, grant, production, commit, or push changes
were made during this audit.

## Phase 5.13A validation addendum

The onboarding fixture failure was reproduced and isolated. The failing test
passes when run alone, while the full suite previously failed only when
`onboarding.integration.test.ts` and `onboarding-api.integration.test.ts`
mutated the same one-profile-per-account fixtures concurrently. The database
unique constraint is correct; this was a cross-worker test-fixture isolation
defect.

The smallest harness correction was a shared OS-temp lock used only by those
two local mutating integration tests. It serializes their fixture lifecycle,
creates no database objects, deletes no existing application data, and removes
its lock during cleanup. The complete relevant suite now passes:

- 41 test files passed.
- 259 tests passed.
- 0 failed.
- 0 skipped.

The clean migration rehearsal remains outstanding. `supabase.cmd status` still
fails before database inspection because the CLI cannot write
`C:\Users\DELL\.supabase\telemetry.json.tmp...` (`EPERM`). The current local
development database was not reset or destroyed, and no service-role
credential was used for security assertions.

## Phase 5.13 final gate

### LOCAL APPLICATION VALIDATION

PASS

### FULL REGRESSION

PASS — 41 files / 259 tests / 0 failures / 0 skipped

### RLS

PASS — 27/27

### TYPECHECK

PASS

### MIGRATIONS 001–045 STATIC AUDIT

PASS

### FRESH DATABASE MIGRATION REHEARSAL

OUTSTANDING

### PRODUCTION ENVIRONMENT VALIDATION

OUTSTANDING

### PRODUCTION AUTH/DOMAIN VALIDATION

OUTSTANDING

### PRODUCTION WHATSAPP/META VALIDATION

OUTSTANDING

### POST-DEPLOYMENT SMOKE TEST

OUTSTANDING

### FINAL VERDICT

READY WITH CONDITIONS
