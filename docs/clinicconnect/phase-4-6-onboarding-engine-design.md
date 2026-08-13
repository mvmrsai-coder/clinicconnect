# Phase 4.6 — ClinicConnect Onboarding Engine Design

## 1. Architecture overview

The onboarding engine is an application-side, account-scoped read model. It
answers four questions for the authenticated clinic member:

1. What configuration evidence exists now?
2. Which required setup items are incomplete?
3. What is the one highest-priority next action?
4. Is an admin allowed to move the coarse onboarding state forward?

It must not introduce another tenancy model, persist duplicated checklist
booleans, or make an external request on every dashboard render. The source
of truth remains the account-owned ClinicConnect and messaging records. The
only persisted onboarding field is
`clinic_profiles.onboarding_status`, added by migration 043:
`REGISTERED`, `TESTING`, `READY`, `LIVE`, or `BLOCKED`.

The engine returns a derived snapshot shaped for a future dashboard. It does
not create UI, booking, WhatsApp, or automation behaviour in this phase.

## 2. Existing application architecture

The application is a Next.js dashboard with both browser and SSR Supabase
clients:

- `src/lib/supabase/client.ts` creates the browser client.
- `src/lib/supabase/server.ts` creates the cookie-backed SSR client for route
  handlers, server components, and server-only helpers.
- `src/lib/auth/account.ts` is the correct server boundary. `getCurrentAccount`
  authenticates the session and derives `accountId` and account role from the
  caller's `profiles` row. `requireRole('admin')` is the existing way to
  protect settings-class mutations.
- `src/lib/auth/roles.ts` defines the existing role hierarchy: `owner`,
  `admin`, `agent`, and `viewer`.
- Existing API routes use route handlers, the SSR client, `NextResponse`,
  manual request validation, and `toErrorResponse()` for 401/403 errors.

There is no existing onboarding module, route, server action, or dedicated
ClinicConnect dashboard page. There are also no production references to
`clinic_profiles` beyond the current integration tests, so adding a read-only
engine later does not require a compatibility change to an existing clinic
form.

The existing WhatsApp configuration endpoint is important: its `GET
/api/whatsapp/config` decrypts the saved token and calls Meta to verify the
phone number. The more detailed `GET
/api/whatsapp/config/verify-registration` verifies phone metadata, WABA app
subscription, and locally recorded registration. A `whatsapp_config` row by
itself is therefore not an operational connection signal.

## 3. Onboarding checklist

The initial checklist should expose these steps. `Required` is evaluated per
clinic rather than hard-coded for every possible ClinicConnect use case.

| Step key | Required when | Purpose |
| --- | --- | --- |
| `clinic_profile` | Always | Identify the clinic and its operating timezone. |
| `doctors` | `booking_enabled = true` | Supply bookable clinicians. |
| `services` | `booking_enabled = true` | Supply bookable services and durations. |
| `schedules` | `booking_enabled = true` | Ensure each active doctor has availability. |
| `patients` | Never for MVP | Informational migration/adoption metric only. |
| `whatsapp` | Never for core booking MVP; required only after a future persisted channel decision | Report current messaging readiness accurately. |
| `automations` | Never for MVP | Informational; no arbitrary automation is required. |
| `testing` | Operator workflow, not a derived database condition | Make the hand-off to a real operational test explicit. |

`booking_enabled` is the current product switch that prevents a
WhatsApp-only/non-booking clinic from being blocked by doctors, services, or
schedules. Its default is `true`, so a standard newly created clinic follows
the full booking checklist without another setting.

## 4. Exact completion condition for each step

All database reads are scoped to the account resolved from the authenticated
session. Empty strings are treated as missing even where old schema columns
cannot prevent them.

| Step | Complete condition | Incomplete / not-required condition |
| --- | --- | --- |
| Clinic profile | Exactly one visible `clinic_profiles` row exists for the account; `btrim(clinic_name) <> ''`; and `btrim(timezone) <> ''`. | No row or either required value blank is incomplete. The unique `clinic_profiles(account_id)` constraint means more than one row is invalid data, not a normal state. |
| Doctors | At least one `clinic_doctors` row for the account has `is_active = true`. | Required and incomplete if there are zero active doctors. `not_required` when booking is disabled. |
| Services | At least one `clinic_services` row for the account has `is_active = true`. Existing constraints already require a positive duration. | Required and incomplete if there are zero active services. `not_required` when booking is disabled. |
| Schedules | Every active doctor has at least one active `doctor_schedules` row in the same account. This is an anti-join over active doctors and active schedules. | Required and incomplete when an active doctor has no active schedule. `not_required` when booking is disabled. The current schema has no separate “bookable doctor” flag, so `is_active` is the only defensible MVP signal. |
| Patients | Always complete as an optional, informational step; return the count of `patient_profiles` rows. | Zero patients is valid for a newly created clinic and must not prevent testing, readiness, or go-live. |
| WhatsApp | For a cheap persisted indicator: configuration exists for the account, `status = 'connected'`, nonblank `phone_number_id`, non-null `connected_at`, and no `last_registration_error`. For an operational “live” assertion: the existing verify-registration route returns `live: true`, which also requires token decryption, successful Meta phone metadata verification, WABA subscription, and a non-null `registered_at`. | Optional in the current MVP. A saved row, `status = 'connected'`, or a successful metadata check alone does not establish inbound webhook readiness. The engine must label persisted readiness and live verification separately. |
| Automations | Always complete as an optional informational step. Return counts of active `automations`, active `flows`, and approved message templates when the caller may read them. | Do not require the existence of an arbitrary record. A future clinic template can declare a named required capability, but Phase 4.6 must not infer one. |
| Testing | Not automatically complete. A user starting `TESTING` is a workflow action, not evidence that a test occurred. | Expose `needs_operator_test` until a later, auditable test-run design exists; do not add a fake boolean or use it in the numerical completion denominator. |

The schedule criterion deliberately proves only that availability has been
configured. It does not yet prove holiday handling, appointment-slot
generation, capacity, or a real appointment workflow. Database-level active
appointment overlap prevention is already provided by migration 041 and is
separate from onboarding completion.

## 5. Progress calculation

Progress is derived at request time:

```text
requiredSteps = checklist items whose required flag is true
completedRequiredSteps = requiredSteps where state is complete
percent = requiredSteps.length === 0
  ? 100
  : round(100 * completedRequiredSteps / requiredSteps.length)
```

For the standard booking-enabled clinic, the denominator is four: profile,
doctors, services, and schedules. For a booking-disabled clinic, only the
profile is required. Patients, WhatsApp, automations, and operator testing do
not distort the percentage.

The result must include the raw `completedRequiredSteps` and
`requiredSteps` counts. A UI should not recalculate progress from translated
labels or locally cached data.

## 6. Next-step logic

`nextStep` is a deterministic recommendation, not a transition. Order it as:

1. `clinic_profile`
2. `doctors` (when required)
3. `services` (when required)
4. `schedules` (when required)
5. `testing` once all required derived checks are complete

If all required derived checks are complete, return `nextStep: 'testing'`
while the status is `REGISTERED`. If status is `TESTING`, return a testing
instruction that distinguishes booking validation from the optional WhatsApp
live verification. If `READY` or `LIVE`, return no setup next step. If
`BLOCKED`, return a neutral “review blocker with an administrator” action;
there is currently no persisted blocker reason, so the engine must not invent
one.

Optional steps may be surfaced as recommendations after the mandatory next
step, but may not displace an unmet required step.

## 7. Overall status model

The five existing database values are sufficient for the MVP:

| Status | Meaning | How it is reached |
| --- | --- | --- |
| `REGISTERED` | Setup is in progress, regardless of derived progress. | Default for every existing and newly inserted clinic profile. |
| `TESTING` | An operator has explicitly started operational testing. | Admin action after the engine reports all currently required derived checks complete. |
| `READY` | An operator has explicitly confirmed the clinic is ready to go live. | Admin action after the engine rechecks required conditions. |
| `LIVE` | The clinic is explicitly activated. | Admin action from `READY`; never automatic. |
| `BLOCKED` | An operator has paused onboarding pending resolution. | Explicit admin action from any non-live state; return to `REGISTERED` or `TESTING` through an explicit admin action. |

The engine must not automatically write `READY` merely because a count has
reached 100%, and must never automatically write `LIVE`. `REGISTERED` is the
single setup state; adding every detailed milestone as a persisted database
state would duplicate derivable information and make the state machine brittle.

## 8. Transition rules

The server action/route must re-evaluate the checklist in the same request as
the mutation. Client-supplied progress, account ID, or an earlier GET response
is never authority for a transition.

| From | To | Rule |
| --- | --- | --- |
| `REGISTERED` | `TESTING` | All required derived setup checks complete. |
| `TESTING` | `REGISTERED` | Admin explicitly returns to setup. |
| `TESTING` | `READY` | All required derived setup checks still complete. An operator has performed the real test workflow; no false database assertion is made. |
| `READY` | `LIVE` | All required derived checks still complete; explicit admin activation. |
| `READY` | `TESTING` | Admin explicitly reopens testing. |
| Any non-`LIVE` | `BLOCKED` | Explicit admin action. |
| `BLOCKED` | `REGISTERED` or `TESTING` | Explicit admin action; use `TESTING` only when requirements still pass. |
| `LIVE` | any | No MVP self-service transition. A future audited deactivation design is required. |

Return `409 Conflict` for a valid requested transition whose current state or
freshly evaluated checklist no longer permits it. Return `400 Bad Request` for
an invalid status or state edge.

## 9. Permission model

- `owner` and `admin`: may read the snapshot and request onboarding-status
  transitions. This matches current `clinic_profiles` insert/update/delete RLS
  policies, which require `is_account_member(account_id, 'admin')`.
- `agent` and `viewer`: may read the snapshot if the future dashboard exposes
  it. They may not transition the status.
- Every individual configuration surface continues to use its existing
  permissions. The onboarding engine does not grant an agent the ability to
  edit clinic settings, schedules, or WhatsApp configuration.

The engine should use `requireRole('admin')` for a transition and
`getCurrentAccount()` for a read. The database remains the final authority:
the SSR client carries the user session and existing RLS applies to every
query and update.

## 10. Account resolution and tenancy

The browser must never send an arbitrary `account_id` to select a clinic. The
server resolves it only through `getCurrentAccount()` / `requireRole()`:

```text
session cookie -> auth.getUser() -> profiles.account_id + account_role
               -> RLS-scoped account queries
```

Each query should still include `.eq('account_id', context.accountId)` as
defence in depth and to make the intended tenant scope obvious. No onboarding
endpoint should use the public API-key account context, a service-role client,
or an unscoped admin query. This design is for authenticated dashboard users,
not external API keys.

## 11. Error handling and consistency

- Missing session: existing `UnauthorizedError` / HTTP 401.
- Authenticated user without a usable account context: existing
  `ForbiddenError` / HTTP 403.
- Missing clinic profile: return a normal snapshot with
  `clinic_profile: incomplete`; do not treat a new clinic as a server error.
- Unexpected database error on a required check: fail closed. Return a generic
  500/`onboarding_unavailable`; do not say that the clinic is ready.
- Bad target status or disallowed state edge: HTTP 400.
- Fresh state/check failure at transition time: HTTP 409 with a small,
  non-sensitive code such as `checklist_incomplete` or `state_changed`.
- Meta failure: retain the structured, user-safe result from the existing
  WhatsApp diagnostic route; do not log access tokens or propagate provider
  error internals through the general onboarding snapshot.

The engine can perform its independent database reads with `Promise.all`.
For a state-changing request, it must issue a fresh evaluation immediately
before updating `clinic_profiles`; it should not rely on a cached dashboard
response.

## 12. Empty clinic behaviour

An empty, valid account has no clinic profile, doctors, services, schedules,
patients, WhatsApp configuration, flows, or automations. The expected result
is a useful setup snapshot, not an exception:

- `onboardingStatus` is unavailable until the profile exists (the creation
  form will create it with the database default `REGISTERED`).
- `clinic_profile` is incomplete and is `nextStep`.
- booking steps should be reported as pending/unknown until
  `booking_enabled` can be read from a profile; the numerical denominator is
  not calculated from assumptions.
- patients remain optional with count zero.
- WhatsApp and automations remain optional and unavailable/not configured.

Once the profile is created, its persisted default is the safe starting state:
`REGISTERED`.

## 13. New clinic flow

The intended MVP flow is:

```text
Create clinic profile (REGISTERED)
  -> engine derives profile / booking setup
  -> configure active doctors, services, and schedules when booking is enabled
  -> engine reports readyToTest
  -> admin starts TESTING
  -> operator performs real booking and, if enabled, WhatsApp tests
  -> admin marks READY
  -> admin explicitly activates LIVE
```

Patient import, message-template approval, flows, and automations can happen
before or after `LIVE`. They are not prerequisites for a clinic that does not
need those capabilities.

## 14. Template compatibility

Future master clinic templates should populate normal account-owned records:
clinic profile values, doctors, services, schedules, message templates, flows,
and automations. The engine should only evaluate the target account's final
records; it must not depend on a template ID, a static template implementation,
or a source clinic.

The repository currently has static application templates for flows and
automations. They are suitable as creation helpers, not as onboarding truth.
A later template system may add an explicit, versioned manifest declaring
which optional capabilities it intends to enable. Until then, the engine must
not require flows or automations merely because template source code exists.

## 15. TypeScript interfaces and types

Place future types in a ClinicConnect-specific module, for example
`src/lib/clinicconnect/onboarding.ts`, rather than expanding the broad legacy
types file unnecessarily.

```ts
export type ClinicOnboardingStatus =
  | 'REGISTERED'
  | 'TESTING'
  | 'READY'
  | 'LIVE'
  | 'BLOCKED'

export type OnboardingStepKey =
  | 'clinic_profile'
  | 'doctors'
  | 'services'
  | 'schedules'
  | 'patients'
  | 'whatsapp'
  | 'automations'
  | 'testing'

export type OnboardingStepState =
  | 'complete'
  | 'incomplete'
  | 'not_required'
  | 'needs_operator_test'
  | 'unavailable'

export interface OnboardingStep {
  key: OnboardingStepKey
  state: OnboardingStepState
  required: boolean
  detailKey: string
  count?: number
  missingDoctorIds?: string[]
}

export interface ClinicOnboardingSnapshot {
  onboardingStatus: ClinicOnboardingStatus | null
  bookingEnabled: boolean | null
  steps: OnboardingStep[]
  completedRequiredSteps: number
  requiredSteps: number
  progressPercent: number | null
  nextStep: OnboardingStepKey | null
  readyToTest: boolean
  canMarkReady: boolean
  canActivateLive: boolean
}
```

`detailKey` rather than display prose keeps the engine independent of the
application's translation/UI layer. The public response must never include a
WhatsApp access token, encrypted token, verification token, or raw provider
diagnostic details.

## 16. Server functions and server actions

Recommended server-only functions:

```ts
getClinicOnboardingSnapshot(context: AccountContext): Promise<ClinicOnboardingSnapshot>
getCurrentClinicOnboarding(): Promise<ClinicOnboardingSnapshot>
transitionClinicOnboardingStatus(
  target: ClinicOnboardingStatus,
): Promise<ClinicOnboardingSnapshot>
```

`getCurrentClinicOnboarding()` obtains `getCurrentAccount()` and delegates to
the context-taking function. The context-taking version is useful to route
handlers that have already performed an admin-role check and avoids a second
account lookup.

`transitionClinicOnboardingStatus()` obtains `requireRole('admin')`, validates
the target against a literal allowlist, reloads the snapshot, validates the
state edge, and updates only `clinic_profiles.onboarding_status` with the
RLS-scoped SSR client. It returns a freshly computed snapshot after a
successful update.

Do not add a server action initially. The repository's established mutation
boundary is API route handlers; a future dashboard Server Component can call
the read helper directly. A server action may be added later only if its UI
needs it, and it must call the same server functions rather than replicate
authorization or transition logic.

## 17. Route/API design

When implementation is authorized, add authenticated dashboard routes only:

| Route | Method | Role | Behaviour |
| --- | --- | --- | --- |
| `/api/clinicconnect/onboarding` | `GET` | account member | Return the derived snapshot for the session account. |
| `/api/clinicconnect/onboarding/status` | `POST` | owner/admin | Accept only `{ status: ClinicOnboardingStatus }`; invoke the transition function. |

The POST body has no `accountId`. It must be parsed defensively, reject
unknown keys/statuses as appropriate, and use the existing `toErrorResponse()`
for account-context errors. A public API-key route is explicitly out of scope.

The general GET snapshot must use database-derived WhatsApp configuration only
and report it as a persisted signal. A separate, deliberate testing action may
reuse the existing authenticated WhatsApp health/registration endpoints; it
must not perform a Meta request as a side effect of rendering the onboarding
dashboard.

## 18. Test strategy

Unit-test the pure checklist evaluator with record/count fixtures:

- empty account; profile only; booking-enabled complete; booking-disabled
  complete;
- no active doctor, no active service, and one active doctor without an active
  schedule;
- inactive doctors/schedules ignored correctly;
- zero patients never blocks progress;
- WhatsApp row is not confused with the stricter live verification result;
- optional automations/flows/templates never block;
- progress denominator and next-step ordering;
- all valid and invalid state transitions.

Integration-test the route/server functions against local Supabase with the
existing authenticated anonymized clients:

- User A can read only Account A's snapshot and transition only Account A;
- User B cannot read, influence, or transition Account A;
- agent/viewer receive 403 for transitions;
- owner/admin update only `onboarding_status`, under RLS;
- a transition to `TESTING`, `READY`, or `LIVE` is rejected when a freshly
  evaluated required check is incomplete.

Do not use a service-role key for these security assertions. Keep external
Meta checks mocked in unit tests or separately test the existing WhatsApp
routes; they should not make the local RLS suite network-dependent.

## 19. Security boundaries

Every part of the design preserves the verified multi-tenant model:

- The session-derived profile selects the account; the browser does not.
- The cookie-backed SSR client remains authenticated as the calling user.
- Existing account-scoped RLS policies remain the final authorizer for clinic
  profile, doctor, service, schedule, patient, and other data reads/writes.
- Status mutations use the existing admin+ `clinic_profiles` update policy;
  no grant or policy change is required.
- The engine does not use service role, disable RLS, impersonate a user, or
  return secrets.
- Query filters explicitly match the resolved account even though RLS already
  isolates it.

Automations, flows, and legacy message templates have existing historical
`user_id` ownership patterns in addition to later account sharing. They are
optional information only in this MVP design, so they cannot grant readiness
or weaken the tenant boundary. A future mandatory automation/template feature
needs a separate tenancy audit before it becomes a go-live condition.

## 20. Deferred scope

This phase intentionally defers:

- onboarding UI, forms, and dashboard navigation;
- database migrations, checklist tables, progress columns, audit tables, RLS
  changes, grants, and PostgreSQL functions;
- persisted testing evidence, test-run history, blocker reason, approval
  identity, and activation/deactivation audit trail;
- clinic template/version tables and template application;
- automatic WhatsApp/Meta calls, WhatsApp automation, template submission,
  booking UI/API, holiday/exceptions scheduling, buffers, and capacity rules;
- an external/public onboarding API;
- making patients, WhatsApp, automations, flows, or message templates universal
  go-live prerequisites.

The recommended next implementation step is a small server-only evaluator and
authenticated read route, covered by unit and existing local RLS integration
tests. Add the status-transition route only with the same implementation
slice. Build the dashboard UI afterwards, once the snapshot contract has been
validated with real clinics.
