# Phase 5.14 â€” ClinicConnect Deployment Readiness Plan

## 1. Executive summary

ClinicConnect is operationally ready for a controlled deployment process, not for
an unconditional production go-live. The verified local baseline is strong:
typechecking passes, the relevant regression suite is 41 files / 259 tests with
no failures or skips, authenticated RLS isolation is 27/27, and the onboarding,
appointment-conflict, WhatsApp-consent, and role tests pass.

The release status remains **READY WITH CONDITIONS**. The principal unresolved
condition is empirical: migrations 001â€“045 have been statically audited but have
not been run against a clean database. The local Supabase CLI is blocked by an
EPERM while writing its telemetry temporary file, Docker and psql are
unavailable, and no authorized staging database was supplied. Production Auth,
domain, storage, Meta, backup, and observability configuration also require
operator verification.

This document is a plan only. No production system, migration, schema, RLS
policy, grant, or application behavior was changed.

## 2. Current verified baseline

- Next.js application implementation for the current ClinicConnect MVP is present.
- npm.cmd run typecheck: PASS (authoritative Phase 5.13 result).
- Relevant local regression: 41 files / 259 tests / 0 failures / 0 skipped.
- Authenticated multi-tenant RLS integration: 27/27 PASS.
- Role authorization, onboarding API, appointment conflict, WhatsApp consent,
  appointment domain/UI, patient, doctor, service, schedule, and locale tests:
  PASS.
- Migrations 001â€“045: ordered and statically audited only.
- Fresh migration rehearsal: **BLOCKED, NOT FAILED**.
- Production database and production application: untouched.

The fresh rehearsal remains unverified because no disposable database was
available; Docker and psql were unavailable; no authorized staging project was
available; and supabase.cmd failed before database work while attempting to write
C:\Users\DELL\.supabase\telemetry.json.tmp.* (EPERM). The migration chain must
not be described as clean-database verified.

## 3. Deployment architecture

### Application

- package.json pins Next.js 16.2.12, React 19.2.4, and Node >=20.
- next.config.ts uses output: standalone, so a self-contained Node artifact can
  be used by a container or Node host. The repository does not establish a
  single hosting provider. Comments mention Hostinger, Vercel, Cloudflare, and
  external cron pingers as supported shapes; these are not proof of the chosen
  production platform.
- App Router pages live under src/app; API route handlers live under src/app/api.
- Security headers include HSTS, nosniff, frame denial, referrer and permissions
  policies. CSP is currently Content-Security-Policy-Report-Only.
- API responses are marked Cache-Control: no-store; non-API pages have a short
  public edge cache policy, while authenticated dashboard rendering and
  middleware remain per-session.

### Authentication and sessions

- Browser and server clients use @supabase/ssr with the public Supabase URL and
  anon key.
- src/middleware.ts calls auth.getUser(), refreshes rotated cookies, redirects
  unauthenticated dashboard users, and rejects unauthenticated
  /api/whatsapp/* requests except the webhook.
- createClient() in src/lib/supabase/server.ts reads/writes Next request cookies.
  getCurrentAccount() and requireRole() derive user, profile, account, and role
  server-side. No browser-supplied account_id or role is authoritative.
- The middleware protected-path list should be explicitly checked for
  /clinicconnect defense-in-depth; API authorization remains the boundary.

### Database and storage

- Supabase supplies Auth, Postgres, PostgREST, Realtime, and Storage.
- Local supabase/config.toml is development configuration (127.0.0.1, API port
  54321, database port 54322); it does not identify a production project.
- Storage migrations define public avatars, flow-media, and chat-media buckets.
  Reads are public where Meta must fetch media URLs; writes are public-bucket
  path scoped by Storage RLS.

### Integrations and jobs

- Meta WhatsApp Cloud API calls are server-side in src/lib/whatsapp/meta-api.ts.
  Per-account access tokens are encrypted in whatsapp_config.
- /api/whatsapp/webhook handles Meta verification and inbound events. POST
  payloads require META_APP_SECRET HMAC verification; webhook processing uses a
  server-only service-role client and must remain isolated from browser code.
- /api/automations/cron and /api/flows/cron are pull-based jobs protected by
  constant-time x-cron-secret comparison against AUTOMATION_CRON_SECRET. A
  platform cron, GitHub Action, or external pinger must invoke them; no provider
  is selected in this repository.
- No other production background-worker configuration is established.

### Build caveat

The earlier production audit recorded a restricted-environment build failure
when next/font/google attempted to reach fonts.googleapis.com. Run a build in the
actual build network/container before release; do not treat local typecheck or
tests as a substitute for a successful production build.

## 4. Environment variable matrix

Values are intentionally omitted. Secrets must never be printed in CI logs,
documentation, browser bundles, or error responses.

| Variable | Exposure | Requiredness | Purpose / references | Production action |
|---|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Client-safe | Required | Supabase browser, SSR, middleware, and server integrations | Set to the production Supabase URL; verify it is not local or another tenant |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Client-safe | Required | Public Supabase client authentication and RLS requests | Set to the matching production publishable/anon key |
| NEXT_PUBLIC_SITE_URL | Client-visible value, read server-side | Recommended; required for deterministic links | Canonical invite URL in /api/account/invitations | Set to the HTTPS production origin |
| NEXT_PUBLIC_APP_LOCALE | Client-safe | Optional (defaults to en) | src/i18n/request.ts | Set only if a supported locale is intended |
| SUPABASE_SERVICE_ROLE_KEY | Server-only secret | Required for webhook, WACRM config conflict checks, AI/flow/automation admin paths | src/app/api/whatsapp and admin-client modules | Store only in server runtime secret storage; never expose to NEXT_PUBLIC_*, client bundles, logs, or RLS tests |
| ENCRYPTION_KEY | Server-only secret | Required when encrypted WhatsApp/AI credentials are used | src/lib/whatsapp/encryption.ts | Provision a stable 32-byte AES-256 key in the expected hex form; preserve it across deploys |
| META_APP_SECRET | Server-only secret | Required when WhatsApp webhook is enabled | src/lib/whatsapp/webhook-signature.ts | Configure Meta App Secret; missing value fails verification closed |
| META_APP_ID | Server-only config | Required for image-header template uploads | src/lib/whatsapp/template-header-handle.ts | Set the Meta app ID matching the WABA/app |
| AUTOMATION_CRON_SECRET | Server-only secret | Required if cron endpoints are enabled | /api/automations/cron and /api/flows/cron | Set high-entropy secret and send it as x-cron-secret |
| ALLOWED_INVITE_HOSTS | Server-only config | Recommended | Restricts invite-link host derivation | Set canonical production hostnames |
| WHATSAPP_TEMPLATES_DRY_RUN | Server-only feature flag | Optional; unset/false in production | Template submit/update routes | Keep disabled in production |
| AI_REQUEST_TIMEOUT_MS | Server-only tuning | Optional | AI request timeout | Set a bounded value or use the code default |
| AI_CONTEXT_MESSAGE_LIMIT | Server-only tuning | Optional | AI context size | Set a bounded value for cost/latency |
| ALLOWED_DEV_ORIGINS | Development-only config | Development-only | Next 16 dev-origin allow-list | Leave unset in production |

TEST_CLINIC_* and TEST_ONBOARDING_APP_PORT are integration-test fixtures, not
production application inputs. OPENAI_API_KEY appears only in local Supabase
Studio configuration comments, not as a production application variable.

No raw Meta access token is expected in an environment variable: account tokens
are entered through the authenticated workflow and stored encrypted. Protect
database backups and the encryption key with appropriate separation of duties.

## 5. Supabase production checklist

### Auth

- Confirm the production Supabase project and matching API URL/key pair.
- Enable the intended email/password provider and decide email-confirmation
  behavior; local config currently has confirmations disabled.
- Set exact HTTPS site and /auth/callback redirect URLs for login, signup,
  password reset, and invite flows.
- Verify Secure, SameSite, path, proxy, and refresh-token behavior.
- Verify password-reset links resolve only to the production origin.

### Database and migration safety

- Confirm the production project identifier independently of local configuration.
- Take and verify a restorable backup before any migration.
- Apply migrations through the selected Supabase migration mechanism in numeric
  order, recording history and operator identity.
- Stop on the first migration error; do not improvise edits or rerun partial SQL.
- Treat rollback as database restore unless a separately reviewed reversible
  operation exists. Do not invent destructive rollback SQL.

### RLS and privileges

- Verify RLS is enabled on ClinicConnect tables and account-scoped policies use
  the authenticated membership model.
- Verify migrations 040, 042, 044, and 045 grant only intended authenticated
  privileges; confirm anon has no unintended DML.
- Verify service-role clients are server-only and always use explicit account
  and resource filters.
- Run cross-account authenticated tests after deployment with non-service-role
  clients.

### Functions, triggers, and storage

- Verify is_account_member() and related SECURITY DEFINER functions exist, have
  an intentional owner, and use a controlled search_path or fully qualified
  names.
- Verify updated-at, membership, invitation, notification, contact-tenancy, and
  appointment-conflict mechanisms exist.
- Verify avatars, flow-media, and chat-media buckets, MIME limits, public/private
  flags, and Storage RLS policies.
- Confirm public reads are an intentional Meta delivery trade-off and that
  private patient material is not placed in public paths without review.
- Verify account-scoped object paths and upload/delete behavior with two accounts.

## 6. Migration deployment plan

Do not execute migrations in this phase. The intended sequence is the complete
numeric chain:

001 â†’ 002 â†’ 003 â†’ 004 â†’ 005 â†’ 006 â†’ 007 â†’ 008 â†’ 009 â†’ 010 â†’ 011 â†’ 012 â†’
013 â†’ 014 â†’ 015 â†’ 016 â†’ 017 â†’ 018 â†’ 019 â†’ 020 â†’ 021 â†’ 022 â†’ 023 â†’ 024 â†’
025 â†’ 026 â†’ 027 â†’ 028 â†’ 029 â†’ 030 â†’ 031 â†’ 032 â†’ 033 â†’ 034 â†’ 035 â†’ 036 â†’
037 â†’ 038 â†’ 039 â†’ 040 â†’ 041 â†’ 042 â†’ 043 â†’ 044 â†’ 045

Immediately after deployment, verify migration history and:

| Migration | Change | Immediate verification |
|---|---|---|
| 040 | Authenticated DML grants for ClinicConnect operational tables and contacts | has_table_privilege for authenticated; anon INSERT/UPDATE/DELETE false; RLS/policies remain |
| 041 | btree_gist and appointments_no_overlapping_active_doctor_time exclusion constraint | Extension exists; constraint is enabled and covers active doctor/time ranges; a conflict returns the expected response |
| 042 | Account-scoped append-only whatsapp_consent_events with RLS and authenticated SELECT/INSERT | Table, indexes, RLS, policies, recorder check, and no update/delete grant/policy |
| 043 | clinic_profiles.onboarding_status text field, default REGISTERED, allowed-state CHECK | Column is NOT NULL; existing rows have safe default; CHECK permits only approved states |
| 044 | Authenticated SELECT on profiles | SELECT true; INSERT/UPDATE/DELETE false; existing profile RLS unchanged |
| 045 | Authenticated SELECT on accounts | SELECT true; INSERT/UPDATE/DELETE false; existing account RLS unchanged |

**Fresh-database rehearsal remains unverified.** The chain appears additive and
mostly forward-only. If deployment fails after partial application, stop and
restore a verified backup rather than inventing rollback SQL.

## 7. Production security checklist

- Keep authenticated session â†’ server/API â†’ authenticated Supabase client â†’ RLS
  as the ClinicConnect boundary.
- Derive account scope from profiles/membership; reject client account_id, role,
  and consent-recorder overrides.
- Enforce owner/admin/agent/viewer rules server-side; UI hiding is not auth.
- Never bundle service-role keys into browser code, NEXT_PUBLIC_*, or responses.
- Keep WhatsApp tokens encrypted and ENCRYPTION_KEY stable; never log tokens,
  keys, cookies, passwords, or full health data.
- Verify webhook HMAC before processing payloads.
- Preserve authenticated consent recorder identity and append-only semantics.
- Verify appointment conflict and patient/contact composite tenancy constraints.
- Review 401/403/409/500 responses for SQL, stack, token, or account-data
  leakage. ClinicConnect routes use generic mapping; adjacent WhatsApp config
  routes return some Meta diagnostics to authenticated callers.
- Confirm Cache-Control: no-store is preserved for /api/* by the edge.
- Validate CSRF/origin assumptions for cookie-authenticated mutations. The
  repository has no separate application CSRF token; production origin,
  SameSite cookies, proxy behavior, and Next request checks require verification.

## 8. Domain / HTTPS checklist

The repository does not establish a production hostname. **Production domain:
UNKNOWN** until the operator selects and records one.

Before release:

- Use HTTPS end-to-end and preserve original host/protocol headers at the edge.
- Set NEXT_PUBLIC_SITE_URL to the canonical origin and ALLOWED_INVITE_HOSTS to
  exact allowed hostnames.
- Register exact HTTPS origin and auth callback/reset URLs in Supabase Auth.
- Verify cookie domain/path/Secure/SameSite behavior.
- Verify Supabase allowed origins/CORS; no custom browser CORS policy is defined.
- Register the exact /api/whatsapp/webhook URL with Meta and verify GET challenge
  plus signed POST delivery.
- Confirm no invite-link fallback to https://wacrm.tech can occur in production.

## 9. WhatsApp / Meta production checklist

### Implemented in application

- Authenticated per-account WhatsApp configuration.
- Server-side encryption/decryption of stored access tokens.
- Meta phone verification, WABA subscription, phone registration, template
  submission/sync, sending, media handling, and webhook helpers.
- HMAC-SHA256 webhook verification that fails closed without META_APP_SECRET.
- Account-scoped readiness and consent-event APIs.
- Account-scoped storage paths for media used by Meta.

### Requires production configuration/verification

- Meta App ID and App Secret.
- WhatsApp Business Account ID, phone number ID, and production access token.
- Meta webhook subscription, callback URL, verify token, and subscribed WABA/phone.
- Approved templates, languages, quality/throughput limits, and 24-hour window.
- Stable ENCRYPTION_KEY and a tested rotation/recovery procedure.
- Signed webhook delivery and non-destructive readiness checks. No Meta API calls
  are made by this audit.

## 10. Observability checklist

Current logging is primarily console.error/console.warn. Typed ClinicConnect
errors generally avoid exposing raw database details, but the repository has no
evidence of structured logs, request IDs, auth/authorization metrics, database
monitoring, webhook dashboards, or cron metrics.

- P1: ensure the selected host captures searchable server logs, deployment
  failures, webhook failures, and cron failures before go-live.
- P2: add structured secret-redacting logs and request/correlation IDs.
- P2: alert on repeated 401/403, database errors, webhook signature failures,
  Meta API failures, and appointment-conflict spikes.
- P3: formalize retention, audit export, privacy review, and DR observability.
- No observability system is implemented in this phase.

## 11. Backup and recovery plan

### Before migration

1. Confirm the exact production Supabase project and current migration history.
2. Create and verify a restorable provider-supported database backup.
3. Record backup identifier, operator, timestamp, application version, and
   intended migration range (001â€“045).

### After migration

1. Verify migration history and catalog structure.
2. Verify RLS, policies, grants, functions, triggers, extensions, storage
   buckets, and the appointment exclusion constraint.
3. Run authenticated smoke and cross-account checks.
4. Inspect logs for errors or secret leakage.

### Rollback

Application rollback alone is not assumed safe after schema changes. Do not
invent destructive down-migrations. On partial migration or incompatible state,
stop traffic as appropriate and restore the verified backup, then deploy a
compatible application version. Practice this in disposable staging first.

## 12. Post-deployment smoke-test plan

Execute only after production deployment, with normal publishable/anon clients
and authenticated sessions; never use service-role credentials for assertions.

1. Unauthenticated /clinicconnect is rejected.
2. User A login succeeds.
3. User A onboarding GET returns 200.
4. User A profile returns only Account A data.
5. User A doctors/services/schedules return only Account A data.
6. User A patient/contact reads return only Account A data.
7. User A appointment availability is Account A scoped.
8. User A creates a valid appointment.
9. User A cannot read or mutate User B data, including with User B IDs.
10. User B cannot read or mutate User A data.
11. Owner/admin mutations succeed where the role matrix permits.
12. Agent/viewer restrictions return expected authorization failures.
13. WhatsApp readiness is account scoped and exposes no credentials.
14. Consent recording stores the authenticated recorder and correct account.
15. Conflicting active appointment is rejected with HTTP 409.
16. Logout, expiry, and refreshed-cookie paths reject protected access.

Record endpoint, status, sanitized response shape, account fixture, role, and
timestamp; never record tokens, passwords, or full health data.

## 13. Go / No-Go gates

### GO only if

- Production environment variables and secret isolation are verified.
- The production Supabase project is independently verified.
- A restorable backup is complete and recorded.
- Migrations 001â€“045 are approved and successfully rehearsed on a clean or
  explicitly accepted staging environment.
- Auth provider, confirmation behavior, redirects, cookies, and origins pass.
- HTTPS and the canonical domain are live and recorded.
- Meta/WhatsApp production configuration is verified if messaging is enabled.
- The post-deployment smoke plan has an owner.
- No critical RLS, authorization, build, or secret-handling issue remains.

### NO-GO if

- The production Supabase project or hostname is unknown.
- No verified backup exists.
- Required secrets or stable encryption key are missing.
- Auth redirects, cookies, or origins are unverified.
- A migration fails or the clean-database state is not accepted by the owner.
- RLS, cross-account isolation, role enforcement, or conflict protection fails.
- A service-role key is exposed to browser code or used for assertions.
- Webhook signature or credential protection is not configured.
- The production build is not reproducible or has unresolved deployment errors.

## 14. Remaining P1 / P2 / P3 conditions

### P1 â€” resolve or explicitly accept before production

- Perform or formally accept the missing clean-database rehearsal for 001â€“045.
- Verify production Supabase/Auth, storage, domain/HTTPS, and Meta settings.
- Run a production-like build in the selected deployment environment.
- Confirm backup/restore ownership and the smoke-test owner.
- Confirm the host captures actionable webhook, cron, authentication, and database
  failure logs.

### P2 â€” should be completed soon after MVP launch

- Replace console-only logs with structured, secret-redacting logs and request
  correlation IDs.
- Add operational alerting and webhook/cron dashboards.
- Review service-role paths for least privilege and explicit ownership.
- Move CSP from report-only to enforced mode after telemetry confirms sources.
- Consider explicitly adding /clinicconnect to middleware protected paths.

### P3 â€” deferred

- Formal backup-restore drills, retention/deletion SLAs, and DR runbooks.
- Legal, privacy, healthcare, and WhatsApp/Meta compliance review.
- Long-term audit export and broader operational analytics.

## 15. Explicit rehearsal status

**Fresh migration rehearsal is still unverified.** Migrations 001â€“045 were not
executed against a clean database in Phase 5.14. Local passing tests and static
SQL review do not replace that evidence. The official status remains
**READY WITH CONDITIONS**, not production-ready without the listed gates.
