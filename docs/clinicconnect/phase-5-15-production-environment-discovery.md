# Phase 5.15 â€” ClinicConnect Production Environment Discovery

## 1. Executive summary

This was a read-only repository discovery pass. No remote Supabase project was
contacted, no credentials were read or printed, and no deployment, migration,
schema, RLS, grant, Auth, or application behavior was changed.

The repository recommends Hostinger Managed Node.js with external Supabase.
Standalone Docker and other Node.js hosts are also supported. This specific
ClinicConnect deployment has no confirmed hosting account, production Supabase
project, or production domain.

Official result: NO-GO. Local test success is not production validation.

## 2. Hosting platform determination

README.md explicitly recommends and documents Hostinger Managed Node.js, including
hPanel environment variables, HTTPS, logs, and Git deployment. package.json has
build/start/typecheck/test scripts but no provider deploy command. next.config.ts
sets output: standalone. Dockerfile builds a Node 20 Alpine standalone image and
docker-compose.yml runs only the app, with Supabase external. docs/docker.md
documents hosted or self-hosted Supabase and external cron pingers.

.github/workflows/ci.yml runs lint, typecheck, tests, and build, but has no deploy
step. No Vercel, Railway, Cloudflare, Hostinger API, Terraform, Kubernetes, or
platform deployment manifest is present.

Determination:
- Recommended: Hostinger Managed Node.js plus external Supabase.
- Alternatives: Docker/self-hosted Node.js, Vercel, Railway, or another Node host.
- Project-specific decision: MULTIPLE POSSIBLE TARGETS â€” HUMAN DECISION REQUIRED.
  Hostinger is recommended by the repository, not proven to be this project's
  selected account.

## 3. Supabase environment determination

supabase/config.toml has project_id = ClinicConnect and localhost development
ports (API 54321, database 54322). It is local configuration, not a production
project reference. .env.local.example contains only the placeholder
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co. Docker documentation
also uses placeholders. CI uses ci.example.supabase.co dummy values. No
production project-ref, dashboard URL, or unambiguous production environment
file exists.

PRODUCTION SUPABASE PROJECT = UNKNOWN.

Because identity is unknown, no remote Supabase status, catalog, Auth
configuration, or migration history was inspected.

## 4. Environment variable matrix

Actual values were not read or printed.

| Variable | Classification | Requiredness | Purpose / references | Production action |
|---|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Browser-safe public | Required | Browser, SSR, middleware, server clients | Set to verified production project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Browser-safe public | Required | Publishable Auth/RLS requests | Set matching production key |
| NEXT_PUBLIC_SITE_URL | Public configuration, server-read | Recommended | Canonical origin and invite links | Set selected HTTPS origin |
| NEXT_PUBLIC_APP_LOCALE | Browser-safe public | Optional; en default | next-intl locale | Set intended supported locale |
| SUPABASE_SERVICE_ROLE_KEY | Server-only secret | Feature-required | Webhook, admin clients, API-key paths | Runtime secret only; never browser or RLS assertions |
| ENCRYPTION_KEY | Server-only secret | Credential features | AES-256-GCM WhatsApp/provider credentials | Stable 64-hex-character key |
| META_APP_SECRET | Server-only secret | WhatsApp webhook | Meta HMAC verification | Configure; absence fails closed |
| META_APP_ID | Server-only configuration | Image-header templates | Meta resumable upload | Configure matching app |
| AUTOMATION_CRON_SECRET | Server-only secret | Cron features | x-cron-secret for automation/flow sweeps | Configure scheduler and secret |
| ALLOWED_INVITE_HOSTS | Server-only configuration | Optional/recommended | Invite host allow-list | Set canonical hostnames |
| WHATSAPP_TEMPLATES_DRY_RUN | Server-only flag | Optional; false/unset in prod | Avoids real template submission | Disable in production |
| AI_REQUEST_TIMEOUT_MS | Server-only tuning | Optional | AI timeout | Use bounded value/default |
| AI_CONTEXT_MESSAGE_LIMIT | Server-only tuning | Optional | AI context size | Use bounded value |
| ALLOWED_DEV_ORIGINS | Development-only | Not production | Next dev tunnel origins | Leave unset |
| TEST_CLINIC_A/B_* | Test-only fixtures/secrets | Test-only | Local integration auth/isolation | Never provision in production |
| TEST_ONBOARDING_APP_PORT | Test-only | Test-only | Spawned local Next server | Never provision in production |

No OAuth or storage credential environment variables are referenced by
production source. Supabase Storage uses the authenticated client and Storage
policies. Per-account Meta access tokens are encrypted in the database, not
global environment variables.

## 5. Domain/origin determination

PRODUCTION DOMAIN = UNKNOWN.

The repository contains local 127.0.0.1 Auth origins, the example
https://crm.example.com in .env.local.example, and upstream wacrm.tech
documentation/marketing links. None is this deployment's confirmed hostname.

The eventual origin must be configured in NEXT_PUBLIC_SITE_URL, Supabase Auth
site/redirect URLs, password-reset and signup callback flows, cookie
domain/Secure/SameSite settings, Supabase allowed origins, and Meta's
/api/whatsapp/webhook callback. ALLOWED_INVITE_HOSTS should pin request-derived
invite hosts. The app has no custom CORS policy.

## 6. Authentication deployment requirements

VERIFIED LOCALLY:
- @supabase/ssr browser and cookie-backed server clients.
- Middleware auth.getUser(), cookie refresh, dashboard redirects, and
  unauthenticated WhatsApp API rejection.
- getCurrentAccount() derives account from the authenticated profile.
- requireRole() enforces owner/admin/agent/viewer.
- Local authenticated RLS and onboarding tests pass.

REQUIRES PRODUCTION VALIDATION:
- Correct production Supabase URL/key and email/password provider.
- Email confirmation policy, site URL, login/signup/password-reset/invite URLs.
- HTTPS custom domain, Secure/SameSite/path/domain cookies, proxy headers.
- Session refresh/rotation, password reset allow-list, and Supabase origins.

Local Auth configuration was not changed and must not be treated as production.

## 7. Storage requirements

Existing buckets are avatars, flow-media, and chat-media. Avatar reads are
public with user-owned writes. Flow/chat media reads are public so Meta can
fetch URLs; writes use user/account-prefixed paths and Storage RLS. Inbound
Meta media uses an authenticated proxy route. ClinicConnect MVP tables do not
require a new bucket, but existing WACRM media requires production bucket,
MIME/size, public/private, path, and Storage-policy verification. No buckets
were created.

## 8. WhatsApp/Meta requirements

| Item | Classification | Action |
|---|---|---|
| Cloud API send/verify/register/subscribe helpers | IMPLEMENTED IN CODE | Controlled production verification |
| Encrypted per-account token storage | IMPLEMENTED IN CODE | Stable ENCRYPTION_KEY and backup protection |
| Meta App ID/App Secret | CONFIGURATION REQUIRED | Provision META_APP_ID and META_APP_SECRET |
| WABA, phone, phone number ID, production token | CONFIGURATION REQUIRED | Connect intended account/number |
| Verify token and HTTPS webhook URL | CONFIGURATION REQUIRED | Register exact callback |
| Signed webhook verification and inbound processing | IMPLEMENTED IN CODE | Verify signed delivery and monitor failures |
| Templates, approvals, languages, quality limits | PRODUCTION VERIFICATION REQUIRED | Approve and verify in Meta |
| Consent history/readiness | IMPLEMENTED IN CODE | Verify account/recorder smoke tests |
| Campaign/template approval workflows outside MVP | DEFERRED | Do not represent dry-run as production |
| Meta API calls during discovery | NOT RUN | None made |

## 9. Cron/webhook requirements

| Endpoint/mechanism | Auth/secret | Production requirement |
|---|---|---|
| GET /api/automations/cron | Constant-time x-cron-secret / AUTOMATION_CRON_SECRET | External scheduler, HTTPS URL, 401/503/500 monitoring |
| GET /api/flows/cron | Constant-time x-cron-secret / AUTOMATION_CRON_SECRET | Same scheduler and monitoring |
| GET /api/whatsapp/webhook | Per-account verify_token challenge | Meta callback at selected HTTPS origin |
| POST /api/whatsapp/webhook | x-hub-signature-256 / META_APP_SECRET | Meta delivery, signature and retry monitoring |
| Outbound public API webhooks | Scoped API key and encrypted endpoint secret | Customer HTTPS endpoints and delivery monitoring |

No container scheduler, queue worker, Vercel Cron configuration, or jobs were
executed. A scheduler and owner are required if automation wait/timeout
features are enabled.

## 10. CI/CD status

CI = ESTABLISHED. .github/workflows/ci.yml runs on pushes and pull requests to
main, installs with npm ci, and runs lint, typecheck, tests, and build with dummy
non-production values.

DEPLOYMENT PIPELINE = NOT ESTABLISHED. No workflow deploys to Hostinger, Vercel,
a registry, or another target. There is no automated migration, backup, release,
or rollback command. Hostinger's documented flow is provider-side/manual Git
deployment.

## 11. Local build/typecheck verification

npm.cmd run typecheck was run for this phase and PASSED.

npm.cmd run build is clearly defined but was not run. The prior readiness audit
recorded a restricted-environment next/font/google network failure. A successful
build in the selected production build environment remains required; no source
workaround was made.

## 12. Production prerequisites

1. Select and record the hosting target.
2. Identify the production Supabase project independently of local config.
3. Select the HTTPS hostname, DNS, and TLS owner.
4. Provision the environment matrix with secret isolation and stable encryption.
5. Configure Auth redirects/cookies/origins and Storage buckets/policies.
6. Rehearse migrations 001â€“045 on a clean disposable database; currently
   BLOCKED / UNVERIFIED.
7. Establish backup, failure, restore, and migration evidence procedures.
8. Configure Meta App/WABA/phone/token/verify token/webhook/templates if enabled.
9. Configure external cron and monitoring if required.
10. Produce a target-environment build and run authenticated cross-account smoke
    tests.

## 13. Unknowns requiring owner decision

- Authoritative hosting target and account (Hostinger is recommended but not
  project-confirmed).
- Production Supabase project reference and owner.
- Canonical production domain and staging/production separation.
- Whether WhatsApp is enabled at first launch and which Meta assets are
  authoritative.
- Whether cron is required at launch and who operates it.
- Backup retention, restore cadence, incident owner, and observability provider.
- Whether the project owner accepts the currently blocked clean migration
  rehearsal.
- Build environment strategy for the next/font/google network dependency.

## 14. Go/No-Go decision

NO-GO.

Hosting is recommended but not selected for this project; production Supabase
and domain are unknown; Auth, Storage, Meta, secrets, backup, scheduler, and
target build remain unverified; and the fresh migration rehearsal is
BLOCKED / UNVERIFIED.

Move to GO only after the identity questions are resolved, the owner completes
or explicitly accepts the clean rehearsal, production configuration and backup
are verified, and smoke-test evidence is approved.

No remote Supabase project was contacted. No credentials, tokens, passwords, or
secret values were printed. No deployment, migration, database, RLS, grant,
Auth, production, or application operation was performed.
