# Phase 5.17 â€” Production Supabase Baseline

## Status

**PRODUCTION SUPABASE = NOT CREATED**

Project creation was not attempted because no Supabase access token, management
credential, authorized connector, or unambiguous production project identity is
available in this environment. The repository contains only the local
development project label and placeholders. No remote Supabase project was
contacted.

Human action required: an authorized project owner must create a NEW dedicated
Supabase project for ClinicConnect, record its safe project reference, region,
and URL, and provide an approved read-only baseline-validation path. Do not
reuse the local development project.

## 1. Production project identity

- Project name: NOT CREATED.
- Project reference: NOT AVAILABLE.
- Region: NOT AVAILABLE.
- Database version: NOT AVAILABLE.
- Project URL: NOT AVAILABLE.
- Production identity confirmed: NO.
- Existing development project touched: NO.

Repository evidence is limited to supabase/config.toml with local project_id
ClinicConnect and localhost ports, plus placeholder URLs in
.env.local.example and Docker documentation. CI uses dummy values. None is a
production project reference.

## 2. Baseline inspection

Because no new project exists and no authorized remote target is available:

- Project reachability: NOT CHECKED.
- PostgreSQL: NOT CHECKED.
- Supabase Auth: NOT CHECKED.
- Storage: NOT CHECKED.
- Supabase API: NOT CHECKED.
- Production URL/key acquisition: NOT PERFORMED.
- Production data/schema inspection: NOT PERFORMED.

No migrations were run and no application data or users were inserted.

## 3. Auth baseline plan

The production domain remains TBD, so no Site URL or redirect URL was invented.

After the project is created, configure and record:

- email/password provider status;
- email confirmation requirement;
- password reset behavior;
- exact production Site URL and redirect URLs once the domain is approved;
- HTTPS, Secure/SameSite cookie, proxy, and session-refresh behavior.

Auth baseline configuration was not changed because there is no approved project
or domain.

## 4. Storage baseline plan

The application eventually requires these existing repository buckets:

| Bucket | Expected access | Required future verification |
|---|---|---|
| avatars | Public reads; user-owned writes | Bucket, MIME/size limits, and Storage policies |
| flow-media | Public reads for Meta delivery; account-scoped writes | Bucket and account-path policies |
| chat-media | Public reads for Meta delivery; account-scoped writes | Bucket and account-path policies |

No ClinicConnect-specific bucket is required for this baseline. No bucket was
created, modified, copied, or populated.

## 5. Safe production environment inventory

No secret values are stored in this document. The production template
.env.production.example contains empty assignments only.

| Variable | Requiredness | Source/purpose | Environment | Classification/configuration location |
|---|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Required | New production project URL | Production | Browser-safe; Hostinger build/runtime configuration |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Required | New production publishable key | Production | Browser-safe; Hostinger build configuration |
| SUPABASE_SERVICE_ROLE_KEY | Feature-required | Server-side webhook/admin/API-key paths | Production | Server-only Hostinger secret |
| ENCRYPTION_KEY | Required for encrypted credentials | AES-256-GCM database credentials | Production | Server-only Hostinger secret |
| META_APP_SECRET | Required for WhatsApp webhook | Meta HMAC verification | Production pilot | Server-only Hostinger secret |
| META_APP_ID | Required for image-header templates | Meta resumable uploads | Production pilot | Server-only Hostinger configuration |
| AUTOMATION_CRON_SECRET | Required if cron enabled | Cron endpoint authentication | Production | Server-only Hostinger secret |
| ALLOWED_INVITE_HOSTS | Recommended | Invite host allow-list | Production | Server-only Hostinger configuration |
| WHATSAPP_TEMPLATES_DRY_RUN | Must be false/unset | Prevents real Meta calls in non-prod | Production | Server-only feature flag |
| AI_REQUEST_TIMEOUT_MS | Optional | AI timeout tuning | Production | Server-only configuration |
| AI_CONTEXT_MESSAGE_LIMIT | Optional | AI context tuning | Production | Server-only configuration |
| NEXT_PUBLIC_SITE_URL | Required after domain selection | Canonical application origin | Production | Public configuration; Hostinger |
| NEXT_PUBLIC_APP_LOCALE | Optional | Locale selection | Production | Public configuration; Hostinger |

Test credentials, local Supabase URLs/keys, and .env.test.local values must
never be copied into production.

## 6. Migration gate

**PRODUCTION MIGRATION STATUS = NOT APPLIED**

Migrations 001â€“045 remain pending for the future dedicated project. No
supabase db push, migration up, SQL script, or manual migration execution was
performed. Existing migration files were not modified.

Before migration, a disposable clean rehearsal should be completed if possible.
If it remains unavailable, the project owner must explicitly accept that risk.

## 7. Backup and recovery gate

**BACKUP BEFORE MIGRATION = NOT YET REQUIRED / NOT EXECUTED**

Required future checkpoint:

1. Create and verify a production database backup/snapshot.
2. Capture migration history and application release state.
3. Capture environment configuration securely without exposing values.
4. Record the migration execution log and operator.
5. Perform post-migration structural/RLS/grant/constraint verification.
6. Test or explicitly accept the restore procedure.
7. Do not invent destructive rollback SQL; restore the database when schema
   rollback is unsafe.

## 8. Security baseline

- Browser receives only the production public URL and anon/publishable key.
- Service-role, encryption, Meta, webhook, cron, and other server secrets remain
  server-only.
- No production secret is committed or stored in this document.
- No test credentials were copied.
- Development and production projects remain separate.
- No security defaults were weakened.
- Production identity is not confirmed, so no remote security assertion was
  made.

## 9. Next steps requiring explicit authorization

1. Human owner creates the new dedicated Supabase project.
2. Owner records project name, safe reference, region, database version, and URL.
3. Owner supplies an approved, secret-safe read-only validation mechanism.
4. Configure Auth only after the production domain is selected; do not invent
   redirect URLs.
5. Inspect/create the required Storage baseline according to the later plan.
6. Execute a separately authorized migration phase; not in Phase 5.17.
7. Keep the Next.js app on its current local/test environment until a later
   controlled connection phase.

## 10. Validation

npm.cmd run typecheck was run and passed.

No production tests were run. No production credentials, application users,
application data, Meta APIs, Hostinger, or remote Supabase resources were used.

## Final gate

Production deployment remains **NO-GO**. The dedicated production Supabase
project must exist and be unambiguously identified before any remote baseline
inspection or migration phase can proceed.
