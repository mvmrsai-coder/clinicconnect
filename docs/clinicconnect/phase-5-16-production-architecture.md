# Phase 5.16 — ClinicConnect Production Architecture

## Status

**Production deployment: NO-GO.**

This document prepares the approved architecture only. No production Supabase
project was created or contacted, no Hostinger deployment occurred, no Meta
resource or message was created, and no migration, schema, RLS, grant, Auth, or
production-data operation was performed.

## 1. Approved architecture

### Application

- Next.js 16.2.12 with React 19 and TypeScript.
- App Router pages and route handlers under src/app.
- Standalone Node.js output is enabled in next.config.ts.
- Hostinger Managed Node.js is the approved application hosting target.
- The Dockerfile remains a supported alternative, but is not deployed by this
  phase.

### Backend

- A NEW dedicated Supabase production project, separate from local development.
- Supabase Auth for email/password sessions.
- Supabase PostgreSQL for application data, migrations, RLS, grants, functions,
  triggers, and constraints.
- Supabase Storage for existing avatars, flow-media, and chat-media buckets.

### External services

- Meta WhatsApp Cloud API for the controlled pilot.
- An external scheduler for automation and flow cron endpoints when enabled.
- No container-local scheduler or queue worker is provided.

### Domain

- PRODUCTION DOMAIN = TBD.
- HTTPS is required for Auth cookies, callback URLs, and the WhatsApp webhook.
- No domain is hardcoded or approved by this document.

### Environment separation

| Environment | Backend | Credentials |
|---|---|---|
| Development | Existing local Supabase configured by supabase/config.toml | Local .env.local values only |
| Test | Local/test Supabase fixtures loaded from .env.test.local | Test credentials only |
| Production | NEW dedicated Supabase project | Production credentials only |

Credentials, URLs, keys, Auth users, Meta assets, and data must never cross
environment boundaries. In particular, local/test keys and clinic fixture
passwords must never be configured in Hostinger production.

## 2. Hostinger Managed Node.js requirements

The repository evidence supports the following Hostinger configuration:

- Application root: repository root containing package.json.
- Node.js: version 20 or newer; Dockerfile and package engines target Node 20.
- Install: npm ci (or the Hostinger equivalent clean npm install).
- Build: npm run build.
- Start: npm run start, or the standalone server produced by next.config.ts.
- Output: next.config.ts already sets output: standalone. PASS.
- Port: use the port Hostinger assigns through PORT; the Docker runtime defaults
  to 3000 and binds HOSTNAME 0.0.0.0. The Hostinger process must listen on its
  assigned port, not a hardcoded public port.
- Environment: configure public NEXT_PUBLIC_* values at build time and
  server-only values at runtime in Hostinger's environment manager.
- Public assets: deploy public/ and the generated .next/static assets. The
  standalone build must include .next/standalone, .next/static, and public.
- Runtime: Node.js process, Next.js standalone server, HTTPS termination,
  forwarded host/protocol headers, and enough memory/time for route handlers and
  WhatsApp webhook processing.
- Logs/health: configure Hostinger application logs and a health check for the
  running process.

Repository caveats:

- No Hostinger API/deployment workflow or project-specific hPanel settings are
  present. Manual/provider-side setup remains required.
- package.json has no migration, backup, or rollback command; those are separate
  Supabase operator procedures.
- The prior audit recorded a next/font/google network failure in the restricted
  environment. A successful build in the actual Hostinger build environment is
  still required.
- The production domain and Hostinger account are not yet known.

## 3. Next.js standalone verification

next.config.ts contains output: standalone. **PASS.**

package.json provides build and start scripts. The standalone setting is useful
for a portable Node deployment and is already consumed by the Dockerfile. No
change was required.

## 4. Production environment template

Created .env.production.example because no equivalent existed. It contains only
empty variable assignments and no secrets, test credentials, or example values.

Public/browser-safe entries:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_SITE_URL
- NEXT_PUBLIC_APP_LOCALE

Server-only entries:

- SUPABASE_SERVICE_ROLE_KEY
- ENCRYPTION_KEY
- META_APP_SECRET
- META_APP_ID
- AUTOMATION_CRON_SECRET
- ALLOWED_INVITE_HOSTS
- WHATSAPP_TEMPLATES_DRY_RUN
- AI_REQUEST_TIMEOUT_MS
- AI_CONTEXT_MESSAGE_LIMIT

ALLOWED_DEV_ORIGINS and TEST_CLINIC_* variables are intentionally excluded:
they are development/test-only and must not be provisioned in production.

## 5. Supabase production initialization plan

Do not execute these steps in this phase:

1. Create a new dedicated Supabase production project.
2. Record its project reference and owner.
3. Configure production Auth email/password behavior and email confirmation.
4. Set the production site URL and exact login, signup, reset, invite, and
   callback redirect URLs.
5. Configure production origins, cookies, and HTTPS assumptions.
6. Configure avatars, flow-media, and chat-media Storage buckets and policies.
7. Obtain the production public URL and publishable/anon key.
8. Securely configure the server-only service-role, encryption, Meta, and cron
   secrets in Hostinger.
9. Apply migrations 001–045 in order using the approved Supabase procedure.
10. Verify migration history, tables, functions, triggers, RLS, policies,
    grants, extensions, composite tenancy keys, consent append-only behavior,
    onboarding status, and appointment exclusion.
11. Create the first production owner through the approved Auth/onboarding flow.
12. Run authenticated smoke and cross-account security tests with normal
    publishable/anon clients, never service-role assertions.

The production project does not yet exist or have an established identity.

## 6. Migration safety

**Fresh migration rehearsal remains UNVERIFIED.**

Migrations 001–045 have been statically audited and the current local regression
baseline passes, but the chain has not been executed against a clean database.
Production migration execution must not be the first-ever execution if a
disposable rehearsal environment becomes available before launch.

If rehearsal remains impossible, the project owner must explicitly accept that
deployment risk in release evidence. Do not edit migrations or invent
destructive down-migrations. Capture a backup and migration state before
production migration; use database restore when schema rollback is unsafe.

## 7. Controlled WhatsApp pilot architecture

WhatsApp is enabled only for a controlled real-world pilot:

- Phase 1 scope: 1–3 clinics.
- Each clinic uses its real WhatsApp Business number and its own account-scoped
  configuration.
- Patient messaging requires explicit OPT_IN recorded in
  whatsapp_consent_events.
- Use the appointment workflow and approved Meta message templates.
- Monitor delivery, webhook processing, errors, and consent history.
- Do not enable bulk campaigns during this pilot.
- Do not implement new messaging or campaign functionality in this phase.

Pilot success criteria:

1. Patient OPT_IN is recorded with the correct authenticated recorder/account.
2. A message is sent only after consent.
3. Account and recipient are correct.
4. The approved template and language are correct.
5. Meta delivery/webhook status is captured.
6. OPT_OUT is recorded.
7. Subsequent proactive messaging is blocked after OPT_OUT.
8. Cross-account reads, writes, and message sends remain denied.

The existing code implements token encryption, readiness, consent recording,
Meta helpers, webhook signature verification, and account-scoped operations.
Meta App/WABA/phone/template setup and real delivery verification remain
production configuration tasks. No Meta API calls occur in this phase.

## 8. Domain decision

**PRODUCTION DOMAIN = TBD.**

Do not hardcode a domain. A candidate is not approved until ownership,
availability, legal review, DNS control, TLS, and Supabase Auth redirect
configuration are confirmed.

Do not use clinicconnect.health: it is already an active healthcare software
product. No domain availability claim is made here; registrar verification is
required.

## 9. Security boundary

### Browser-safe

- NEXT_PUBLIC_SUPABASE_URL.
- NEXT_PUBLIC_SUPABASE_ANON_KEY.
- Same-origin application requests using the authenticated cookie session.

### Server-only

- SUPABASE_SERVICE_ROLE_KEY.
- ENCRYPTION_KEY.
- META_APP_SECRET and META_APP_ID.
- AUTOMATION_CRON_SECRET.
- Invite, webhook, and other server-side secrets/configuration.
- Per-account encrypted Meta access tokens stored in Supabase.

Service-role credentials must never enter browser bundles, NEXT_PUBLIC_* values,
logs, response bodies, or RLS/security assertions. Account scope and role are
derived server-side from the authenticated session and membership; the browser
cannot select the authoritative account_id.

## 10. Backup / rollback

Before production migration:

- Create and verify a restorable Supabase database backup.
- Capture current migration history and the application release identifier.
- Back up environment configuration through the approved secret manager without
  exposing values.
- Record the migration range, operator, timestamp, and rollback decision owner.
- Confirm a restore destination/procedure before applying SQL.

After migration:

- Verify migration history and catalog structure.
- Verify RLS/policies/grants/functions/triggers/extensions/constraints.
- Verify Storage buckets and policies.
- Run authenticated smoke and cross-account tests.
- Inspect logs for migration, Auth, webhook, and database errors.

Rollback:

- Do not invent destructive rollback SQL.
- Application rollback alone is not assumed safe after schema changes.
- Restore the verified database backup when schema rollback is unsafe, then
  deploy a compatible application version.

## 11. Required validation

npm.cmd run typecheck was run and passed.

No production operation, remote account creation, migration application,
deployment, Auth change, Storage change, Meta call, or message send was run.

## 12. Go / No-Go

**PRODUCTION DEPLOYMENT = NO-GO** until all of the following are true:

- Dedicated production Supabase project exists and its identity is recorded.
- Production domain is selected, owned, DNS-configured, and HTTPS-enabled.
- Hostinger environment and assigned port are configured.
- Public and server-only secrets are securely configured and separated.
- Migrations are approved and rehearsed, or the blocked rehearsal risk is
  explicitly accepted.
- Backup and restore evidence exists.
- Production Auth, Storage, and redirect/origin settings are verified.
- Meta App/WABA/phone/webhook/templates are configured for the pilot.
- External cron ownership and monitoring are configured if needed.
- Production build and smoke/security tests pass.

No existing application behavior was changed.
