# Phase 5.12 — ClinicConnect Role & Permission Matrix

## Scope and security model

This audit covers ClinicConnect routes, server services, UI gates, account
context resolution, existing WACRM WhatsApp configuration endpoints, grants,
RLS policies, tenancy constraints, and role-related tests.

The authoritative chain is:

```text
authenticated session → account context → role guard → table privilege → RLS → tenancy constraint
```

The browser never supplies the authoritative `account_id`,
`recorded_by_user_id`, or role. ClinicConnect services derive those values from
`AccountContext`, which is built by `getCurrentAccount()`.

## Role definitions

`AccountRole` is the four-value type `owner | admin | agent | viewer`.
`hasMinRole()` uses the hierarchy owner > admin > agent > viewer. The same
ordering is represented by the database `is_account_member()` helper.

`requireRole()` resolves the authenticated account context and rejects a caller
below the requested minimum with HTTP 403. `useCan()` and `RequireRole` are UI
gates only; they are not the security boundary.

## Final capability matrix

`ALLOW` means the current implementation permits the capability. `READ-ONLY`
means the role can inspect the capability but cannot mutate it. `DENY` means
the current API/RLS contract rejects it. `NOT APPLICABLE` means the capability
does not apply to that role.

| Capability | Owner | Admin | Agent | Viewer | Enforcement layer |
|---|---|---|---|---|---|
| View clinic profile | ALLOW | ALLOW | ALLOW | ALLOW | API `getCurrentAccount` + authenticated SELECT + RLS |
| Edit clinic profile | ALLOW | ALLOW | DENY | DENY | API `requireRole('admin')` + grant + RLS |
| Change `booking_enabled` | ALLOW | ALLOW | DENY | DENY | Same profile PUT path and RLS |
| View onboarding status | ALLOW | ALLOW | ALLOW | ALLOW | API account context + RLS |
| Change onboarding status | ALLOW | ALLOW | DENY | DENY | `requireRole('admin')` + RLS |
| List/view doctors | ALLOW | ALLOW | ALLOW | ALLOW | API account context + RLS |
| Create/edit/activate doctors | ALLOW | ALLOW | DENY | DENY | API `requireRole('admin')` + RLS |
| List/view services | ALLOW | ALLOW | ALLOW | ALLOW | API account context + RLS |
| Create/edit/activate services | ALLOW | ALLOW | DENY | DENY | API `requireRole('admin')` + RLS |
| List/view schedules | ALLOW | ALLOW | ALLOW | ALLOW | API account context + RLS |
| Create/edit/activate schedules | ALLOW | ALLOW | DENY | DENY | API `requireRole('admin')` + RLS |
| List/view patients | ALLOW | ALLOW | ALLOW | ALLOW | API account context + RLS |
| Create/edit patients | ALLOW | ALLOW | DENY | DENY | Current API `requireRole('admin')`; RLS permits agent |
| Associate a contact | ALLOW | ALLOW | DENY | DENY | Patient API admin guard + composite tenancy FK + RLS |
| Search contacts | ALLOW | ALLOW | ALLOW | ALLOW | Account-scoped service query + contacts RLS |
| List/view appointments | ALLOW | ALLOW | ALLOW | ALLOW | API account context + RLS |
| Create/reschedule/change appointment status/cancel | ALLOW | ALLOW | DENY | DENY | Current API `requireRole('admin')`; RLS permits agent |
| Access availability | ALLOW | ALLOW | ALLOW | ALLOW | API account context + RLS |
| View WhatsApp readiness | ALLOW | ALLOW | ALLOW | ALLOW | API account context + RLS |
| Run readiness diagnostics | ALLOW | ALLOW | ALLOW | ALLOW | Authenticated WACRM diagnostic route |
| View consent history | ALLOW | ALLOW | ALLOW | ALLOW | ClinicConnect `requireRole('viewer')` + RLS |
| Record `OPT_IN` / `OPT_OUT` | ALLOW | ALLOW | ALLOW | DENY | ClinicConnect `requireRole('agent')` + RLS + recorder identity |
| Modify WhatsApp configuration | ALLOW | ALLOW | DENY | DENY | RLS is admin-only; WACRM route lacks an early `requireRole` guard |
| Modify WhatsApp templates | ALLOW | ALLOW | DENY | DENY | WACRM template routes `requireRole('admin')` + RLS |
| View ClinicConnect dashboard | ALLOW | ALLOW | ALLOW | ALLOW | Auth-gated dashboard shell; APIs enforce access |
| View onboarding checklist/blockers/actions | ALLOW | ALLOW | ALLOW | ALLOW | Authenticated onboarding GET + UI rendering |
| Access another account | DENY | DENY | DENY | DENY | Session-derived account + RLS |
| Supply `account_id` to override scope | DENY | DENY | DENY | DENY | Request validation or ignored query parameter |
| Supply `recorded_by_user_id` | DENY | DENY | DENY | DENY | Request validation; server uses `context.userId` |
| Use service-role credentials from browser | DENY | DENY | DENY | DENY | No browser service-role path |
| Change another user’s role | ALLOW | ALLOW | DENY | DENY | Account-members API `requireRole('admin')`; ownership RPC rules |
| Change another account’s onboarding state | DENY | DENY | DENY | DENY | Account context + account-scoped RLS |

## Enforcement details by domain

### Clinic profile, doctors, services, and schedules

All reads resolve the caller with `getCurrentAccount()`. All mutations call
`requireRole('admin')`. Migration 038 supplies authenticated table privileges;
the corresponding RLS policies use `is_account_member(account_id, 'admin')`
for writes and account membership for reads.

### Patients, contacts, and appointments

The current HTTP API requires admin for patient and appointment mutations. The
database policies in migration 038 intentionally allow agent-level writes for
`patient_profiles` and `appointments`, while contacts policies in migration 017
also allow agent writes. This is a deliberate tightening at the API layer, but
it is a permission inconsistency requiring a product decision before changing
the role matrix. No change was made in this audit.

Appointment overlap is additionally enforced by migration 041’s exclusion
constraint. Patient-to-contact tenancy is enforced by the composite foreign key
introduced in migration 039.

### Onboarding

The onboarding GET is available to all authenticated account members. Status
transitions call `requireRole('admin')`, validate the transition graph, derive
the account from the session, and persist only within that account.

### WhatsApp consent and readiness

ClinicConnect consent GET requires the minimum `viewer` role, so all four roles
can read it. Consent POST requires `agent`; the server derives both
`account_id` and `recorded_by_user_id`. RLS independently requires agent
membership and `recorded_by_user_id = auth.uid()`.

Readiness is diagnostic/read-only. It does not connect to Meta during normal
ClinicConnect onboarding.

## Authorization gaps and inconsistencies

### Gap 1 — patient and appointment API is stricter than RLS

- Endpoints: `/api/clinicconnect/patients` POST/PUT and
  `/api/clinicconnect/appointments` POST/PUT.
- Current behavior: agents receive 403 from `requireRole('admin')`.
- Database behavior: migrations 038 policies permit agent writes.
- Security impact: not an isolation bypass; it is a policy mismatch that may
  deny intended operational agent workflows.
- Recommended action: decide whether agents should manage patients and
  appointments. If yes, change the API and retain matching RLS. If no, narrow
  the database policies in a separately approved security change.

### Gap 2 — WhatsApp config routes lack an early role guard

- Endpoints: `/api/whatsapp/config` POST and DELETE.
- Current behavior: the handlers authenticate the user and rely on the
  `whatsapp_config` RLS policies for admin-only mutation. POST also performs
  Meta validation and a service-role uniqueness lookup before the user-scoped
  write is evaluated.
- Expected behavior: configuration mutation should reject non-admin callers at
  the server boundary before external work.
- Security impact: agents/viewers cannot successfully persist through RLS, but
  they can trigger work before the final database denial. The route also uses a
  service-role client for cross-account phone-number uniqueness checks.
- Recommended action: add an explicit admin guard and preserve the existing RLS
  policy; review the service-role uniqueness check separately. No fix was made.

These are reported findings, not silently corrected defects.

## Tests

Added `src/lib/auth/clinicconnect-role-permission.test.ts`. It covers the full
role ordering, the declared minimum role for ClinicConnect read/write domains,
the agent consent boundary, and admin-only onboarding transitions.

Existing route tests cover unauthorized mutation rejection, account override
rejection, recorder identity derivation, and per-route `requireRole` calls.
The existing authenticated local fixtures are owner fixtures; no agent/viewer
fixture was altered or created. Therefore agent/viewer behavior is verified at
the server role-contract and route-guard layers, while the authenticated RLS
integration remains the tenancy regression gate.

## Security and regression result

- No migration, schema, RLS, grant, or production file was changed.
- No service-role credential was used by the focused role tests or security
  assertions.
- The existing RLS integration must remain at 27/27 assertions.
- Any future permission change should resolve Gap 1 and Gap 2 explicitly before
  broadening the operational UI.
