# Phase 5.13B — Production Environment Readiness

## Verdict

**READY WITH CONDITIONS**.

The repository and local security gates are healthy, but production has not
been accessed or validated. Two release conditions remain evidence-based:

1. Complete the disposable migration rehearsal for migrations 001–045.
2. Produce a successful production build in an environment that can resolve
   the configured Google Font, or provide an approved build-time font strategy.

No production credentials were read, no production Supabase project was
contacted, and no deployment was attempted.

## 1. Production environment variable inventory

### Required production variables

- `NEXT_PUBLIC_SUPABASE_URL` — browser-safe Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser-safe publishable/anon key.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only Supabase administrative key used by
  existing webhook, automation, API-key, and related server paths.
- `ENCRYPTION_KEY` — server-only AES-256-GCM key for encrypted WhatsApp and AI
  provider credentials.
- `META_APP_SECRET` — server-only Meta webhook signature secret.
- `NEXT_PUBLIC_SITE_URL` — recommended canonical application URL for generated
  links and metadata.

### Optional or feature-dependent variables

- `META_APP_ID` — required for Meta resumable uploads used by image-header
  template workflows.
- `AUTOMATION_CRON_SECRET` — required when the automation cron endpoint is
  enabled.
- `ALLOWED_INVITE_HOSTS` — optional host allow-list for generated invitation
  URLs; recommended behind a public proxy.
- `WHATSAPP_TEMPLATES_DRY_RUN` — development/CI switch; must be unset or false
  in production.
- `NEXT_PUBLIC_APP_LOCALE` — optional locale default.
- `AI_REQUEST_TIMEOUT_MS` — optional AI timeout tuning.
- `AI_CONTEXT_MESSAGE_LIMIT` — optional AI context tuning.

### Test/development-only variables

- `TEST_CLINIC_A_EMAIL`
- `TEST_CLINIC_A_PASSWORD`
- `TEST_CLINIC_A_ACCOUNT_ID`
- `TEST_CLINIC_B_EMAIL`
- `TEST_CLINIC_B_PASSWORD`
- `TEST_CLINIC_B_ACCOUNT_ID`
- `TEST_ONBOARDING_APP_PORT`
- `ALLOWED_DEV_ORIGINS`

The `TEST_CLINIC_*` variables are referenced by local integration tests only.
`.env.test.local` remains ignored by `.gitignore`. No secret values were
printed or inspected.

## 2. Production Supabase configuration audit

### Verified from repository/local evidence

- Authenticated SSR uses Supabase cookies and `auth.getUser()`.
- The browser uses only the public URL and anon key.
- ClinicConnect migrations 001–045 are ordered and present.
- ClinicConnect RLS integration passes 27/27.
- Migrations 040–045 passed static review.
- ClinicConnect tables, consent append policy, onboarding state, account/profile
  SELECT privileges, and appointment conflict protection are represented in
  the migration set.

### Requires production validation

- Supabase Auth Site URL and redirect URLs.
- Email confirmation and password-reset redirect behavior.
- OAuth providers, if enabled by the deployment.
- Production database migration history and catalog state.
- `uuid-ossp`, `vector`, and `btree_gist` availability.
- RLS enablement, policies, authenticated grants, functions, and triggers.
- Storage buckets and policies used by existing WACRM features.
- Edge Functions, if any are enabled outside this repository.
- Meta webhook verification and callback configuration.

The production project was not contacted. The fresh migration rehearsal remains
outstanding because the local Supabase CLI fails while writing its telemetry
temporary file (`EPERM`); the current local database was not reset.

## 3. Domain and origin audit

- `NEXT_PUBLIC_SITE_URL` is the canonical configurable application origin.
- Invitation URL generation uses `NEXT_PUBLIC_SITE_URL` when present and has a
  request-host fallback controlled by `ALLOWED_INVITE_HOSTS`.
- The WhatsApp settings UI builds the webhook URL from
  `window.location.origin`, so the deployed origin must be the public HTTPS
  hostname.
- Supabase SSR cookies are handled by the server client and middleware; the
  production domain must be configured in Supabase Auth.
- API responses are marked `Cache-Control: no-store` by `next.config.ts`.
- Development-only `allowedDevOrigins` includes tunnel/local patterns and is
  not a production origin allow-list.
- Localhost values occur in `supabase/config.toml`, Docker documentation, and
  local integration tests only. No ClinicConnect production route embeds a
  localhost URL.
- The Meta webhook endpoint must be configured externally to point to the
  deployed HTTPS `/api/whatsapp/webhook` URL.

## 4. Security and secret audit

- No service-role key, database password, JWT secret, Meta token, encryption
  key, test password, or test credential value is hardcoded in source.
- Service-role references are server-side only; no browser component imports an
  administrative client.
- The public Supabase values are the only Supabase values used by browser
  clients.
- `.env.test.local` is ignored and test variables are not application runtime
  dependencies.
- WhatsApp access/verify tokens are encrypted before persistence.
- Webhook signatures fail closed when `META_APP_SECRET` is absent.

## 5. Build audit

Command: `npm.cmd run build` (`next build`).

Result: **FAILED in the current restricted environment**. Next.js could not
fetch Google’s Inter font stylesheet from `fonts.googleapis.com` while
processing `src/app/layout.tsx` (`next/font/google`). The failure is an
external build-network dependency, not a TypeScript or application-code error.
The build also reports the existing Next.js middleware-to-proxy deprecation
warning.

`npm.cmd run typecheck` passes. No production configuration was changed to hide
the build failure.

## 6. Migration deployment readiness

Migrations 001–045 are ordered and the key ClinicConnect migrations are
present:

- 040 authenticated ClinicConnect DML privileges.
- 041 appointment exclusion constraint and `btree_gist` extension.
- 042 account-scoped consent history and RLS.
- 043 onboarding status/default/check constraint.
- 044 authenticated profile SELECT.
- 045 authenticated account SELECT.

Operational procedure:

1. Snapshot/backup the staging database.
2. Apply migrations strictly in numeric order through the Supabase migration
   mechanism.
3. Verify migration history and catalog state.
4. Verify extensions, functions, triggers, indexes, constraints, RLS, and
   authenticated grants.
5. Run authenticated ClinicConnect security and smoke tests.
6. Repeat the validated process for production with an approved rollback plan.

No migrations were applied in this phase.

## 7. Authentication production checklist

Validate in staging/production without destructive operations:

- Sign in and sign out.
- Session refresh and expired-session behavior.
- Password reset redirect and completion.
- Unauthenticated page and API access.
- Owner/admin/agent/viewer role enforcement.
- Account isolation and browser `account_id` rejection.
- Consent recorder identity derivation.
- Cookie `Secure`, domain, SameSite, and HTTPS behavior.
- Production Site URL and redirect URL matching.

## 8. WhatsApp/Meta readiness

The repository supports:

- Meta phone-number verification.
- WABA subscription checks.
- Phone registration workflows.
- Encrypted access and verify token storage.
- Webhook HMAC verification.
- Template sync/submit flows and dry-run mode for non-production testing.
- ClinicConnect readiness diagnostics and consent history.

Production still requires external setup and validation of:

- Meta App and Business Manager configuration.
- WABA ID and phone-number ID.
- Production access token and encryption key.
- Public HTTPS webhook callback and verify token.
- App subscriptions and approved message templates.
- Meta delivery/error monitoring.

No Meta API calls were made with production credentials.

## 9. Operational readiness

| Area | Status | Required action |
|---|---|---|
| Backups | REQUIRES VALIDATION | Confirm Supabase backups and retention. |
| Restore procedure | REQUIRES SETUP | Perform a disposable restore drill. |
| Monitoring | REQUIRES SETUP | Add production health and error monitoring. |
| Logging | REQUIRES SETUP | Prefer structured logs and request correlation IDs. |
| Alerts | REQUIRES SETUP | Alert on auth, webhook, migration, and database failures. |
| Migration process | REQUIRES VALIDATION | Complete clean 001–045 rehearsal. |
| Rollback | REQUIRES SETUP | Document application rollback and forward-fix policy. |
| Incident response | REQUIRES SETUP | Define escalation and secret-compromise procedures. |
| Secret rotation | REQUIRES SETUP | Document encryption/Meta/Supabase rotation impact. |
| Audit logs | REQUIRES VALIDATION | Confirm required account/member and consent audit coverage. |
| Data retention | DEFERRED | Legal/privacy policy is outside this technical audit. |

## 10. Classified findings

### P0

None confirmed.

### P1

1. **Clean migration rehearsal outstanding.** The local CLI telemetry EPERM
   prevents validation of a disposable 001–045 application. Complete this
   before production deployment.
2. **Production build not reproducible in the current environment.** The build
   requires access to Google Fonts through `next/font/google`, or an approved
   build environment/font strategy. Verify a successful production build before
   deployment.
3. **Production Supabase/Auth/Meta settings are unverified.** Validate them in
   staging before production.

### P2

1. Structured logging, request IDs, monitoring, and alerting.
2. Backup restore drill and rollback runbook.
3. Explicit least-privilege review of existing server-only service-role paths.
4. Middleware-to-proxy migration planning and CSP enforcement after report-only
   telemetry review.

### P3

1. Formal retention/deletion policy and legal/compliance review.
2. Broader disaster-recovery and long-term operational documentation.

## 11. Final production gate

**READY WITH CONDITIONS**.

Remaining conditions:

- Complete a disposable clean migration rehearsal for 001–045.
- Produce a successful production build in a network-capable or approved
  self-contained font environment.
- Validate production Supabase Auth, domain/origin, storage, Meta webhook, and
  secret configuration in staging.
- Complete the smoke, cross-account, monitoring, backup, and rollback checks.

No production database, Supabase configuration, migrations, RLS, grants, or
application behavior were changed.
