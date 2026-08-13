# Phase 4.2 — ClinicConnect Schema Gap Plan

## 1. Executive summary

Phase 3's account isolation foundation is retained: authenticated multi-tenant RLS verification passed 27/27 assertions, and migration 040 is locally applied. This plan does not propose a second tenancy model, a relaxation of RLS, or any change in this phase.

The smallest robust path for a first clinic is:

1. Use the existing account, clinic profile, doctor, service, recurring doctor schedule, patient/contact, appointment, WhatsApp, template, automation, and flow schema.
2. Do **not** add a formal onboarding-state table for MVP. Derive readiness from the existing records and use an operational checklist; `booking_enabled` is the existing operational switch.
3. Add database-level protection against active overlapping appointments before calendar booking goes live.
4. Add a contact-level, account-scoped WhatsApp consent-event record before proactive WhatsApp messaging goes live.
5. Implement MVP availability/rule checks in the future booking application/API, backed by the overlap constraint. Per-clinic configurable rules, exceptions, persistent onboarding state, and versioned clinic templates are not P0.

The current schema is sufficient for clinic identity, staff/service setup, recurring availability data, account-scoped patient records, appointment lifecycle labels, and WhatsApp/provider configuration. It is not sufficient by itself to prevent double booking, prove WhatsApp consent, enforce availability, or persist a full onboarding workflow.

This document is a plan only. No migration, schema, RLS policy, grant, production source file, UI, or API is changed by Phase 4.2.

## 2. Evidence reviewed

### Specification and local schema

The complete [Master Clinic Onboarding Data Specification](master-clinic-onboarding-spec.md) was reviewed against the locally applied ClinicConnect migration chain through 040 and the current application paths.

| Area | Confirmed current capability | Important limit |
| --- | --- | --- |
| `clinic_profiles` | One account-scoped profile per account; name, contact details, timezone, `working_days`, and `booking_enabled` | No onboarding status, structured operating-hours contract, or configurable booking-rule fields |
| `clinic_doctors` | Account-owned doctors with the required identity/professional fields and active flag | No appointment-availability enforcement |
| `clinic_services` | Account-owned services, positive `duration_minutes`, non-negative optional price, active flag | Service duration is not tied to appointment duration |
| `doctor_schedules` | Recurring weekly doctor rows with valid weekday/time range/slot duration and same-account doctor FK | No schedule-overlap protection, date exceptions, holidays, or booking engine |
| `patient_profiles` and `contacts` | Patient extension is conceptually separate from CRM contact; `(account_id, contact_id)` composite FK enforces same-account ownership | Contacts have no dedicated address or WhatsApp consent model |
| `appointments` | Same-account patient/doctor/service composite FKs, valid time range, status check, and lookup indexes | No exclusion constraint, no availability validation, no policy configuration, and no reschedule lineage |
| WhatsApp configuration and templates | One `whatsapp_config` per account, encrypted-token application handling, provider status, Meta template content/status/sync | No contact consent/opt-out evidence or enforcement gate |
| Automations and flows | Account-scoped records and existing static starter-template clone paths | No clinic template/version/clone model |
| RLS and grants | Account-scoped RLS uses `public.is_account_member(account_id)`; 040 enables authenticated table privilege evaluation | Every future relation still requires its own RLS and least-privilege grant review |

### Existing application implementation

- There is no production clinic-onboarding, doctor, schedule, service, patient-profile, or appointment UI/API path. Those six ClinicConnect tables are currently exercised by the authenticated RLS integration test, not a booking implementation.
- `contacts`, `conversations`, `whatsapp_config`, `message_templates`, `automations`, `flows`, and `webhook_endpoints` are used by the existing messaging application.
- The app already has static, source-controlled flow templates in `src/lib/flows/templates.ts`, with an API clone path, and static automation starter definitions in `src/lib/automations/templates.ts`. These are application constants, not database master-template records.
- `custom_fields` and `contact_custom_values` can store arbitrary account-scoped contact metadata. They are not adequate as a WhatsApp consent source of truth because they are untyped text values with no channel, event time, evidence/source, immutable history, or send-time enforcement.
- WhatsApp send, broadcast, automation, flow, webhook, and conversation paths scope config and contacts by `account_id`. The reviewed send paths validate phone/configuration but do not query a consent or opt-out record.

## 3. Classification rules

Every gap below has exactly one primary implementation classification:

| Code | Meaning |
| --- | --- |
| A | **ALREADY SUPPORTED** |
| B | **CAN BE IMPLEMENTED WITHOUT SCHEMA CHANGE** |
| C | **REQUIRES NEW DATABASE COLUMN** |
| D | **REQUIRES NEW DATABASE TABLE** |
| E | **REQUIRES NEW CONSTRAINT/INDEX** |
| F | **REQUIRES DATABASE FUNCTION/trigger** |
| G | **DEFER TO POST-MVP** |

Priorities have the following meaning:

- **P0** — required before the first clinic uses the affected live capability.
- **P1** — required shortly after MVP when a clinic-specific configuration/operational workflow is needed.
- **P2** — future scalability or self-service capability.
- **P3** — explicitly post-MVP.

## 4. Gap-by-gap analysis and priority register

| ID | Gap / decision | Classification | Priority | Decision |
| --- | --- | --- | --- | --- |
| G1 | Basic onboarding progression and go-live checklist | B | P0 | Derive readiness from existing records and an operational checklist; do not persist formal state for MVP. |
| G2 | Persistent onboarding status, block reason, and go-live timestamp | C | P1 | Add small state columns to `clinic_profiles` only if workflows need resumability/reporting. No onboarding table is needed for the first iteration. |
| G3 | Clinic hours for initial booking configuration | B | P0 | Use the clinic timezone and doctor schedules as canonical bookable availability. Treat `working_days` only as optional display metadata until an application JSON contract exists. |
| G4 | Clinic closures, doctor leave, and date-specific schedule exceptions | D | P1 | Add one account-scoped exception table only when exceptions must be persisted and applied to booking. |
| G5 | Overlapping recurring schedule rows | B | P0 | Validate overlapping weekly ranges in the future schedule editor/API. A database exclusion constraint is not required for the first clinic because doctor schedules are configuration data, not bookings. |
| G6 | Active appointment double booking | E | P0 | Add a PostgreSQL exclusion constraint; a unique index cannot protect arbitrary time intervals. |
| G7 | Appointment/service/doctor-schedule compatibility | B | P0 | Validate in the future appointment creation/update path: active records, local date/time, service duration, schedule coverage, and rule values. Database conflict protection remains G6. |
| G8 | Server-enforced schedule compatibility for every direct table write | F | P2 | Consider a trigger or controlled RPC only if direct authenticated appointment writes remain an intended interface after a booking API exists. |
| G9 | Per-clinic same-day, advance-window, cancellation, reschedule, and buffer configuration | C | P1 | Store a small, explicit set of one-to-one booking-rule columns on `clinic_profiles`; use application defaults for MVP. |
| G10 | Reschedule lineage | C | P1 | Add an optional account-scoped self-reference from the replacement appointment to the original appointment. |
| G11 | Maximum appointments per session / rooms / multi-capacity resources | G | P3 | Defer. Current model correctly represents one doctor/time interval, not room or group-capacity scheduling. |
| G12 | WhatsApp consent and opt-out evidence | D | P0 for proactive WhatsApp; otherwise P1 | Use an account-scoped, contact-level consent-event table. Do not put consent on patient profile, conversation, or account. |
| G13 | Contact postal address | C | P2 | Add `contacts.address` only if a real workflow requires a patient/contact address. Clinic address already exists separately. |
| G14 | Master clinic templates for MVP | B | P0 | Use source-controlled application constants and explicit clone code, as existing flow/automation templates do. Do not persist a global master-template model yet. |
| G15 | Tenant-authored/versioned clinic template library | D | P2 | Introduce account-owned definition/version tables only after self-service template management is a proven requirement. |
| G16 | Legal entity and tax-registration data | G | P3 | Defer until launch jurisdiction, billing, and retention requirements are agreed. |

## 5. Detailed analysis

### 5.1 Onboarding state

#### Is a formal status required?

No, not for the first clinic. The MVP can answer readiness from existing account-scoped data:

- a `clinic_profiles` row with a name and confirmed timezone;
- at least one active doctor, service, and schedule when booking is enabled;
- a connected `whatsapp_config` and approved required `message_templates` when WhatsApp is enabled; and
- a manually recorded test/approval checklist.

`clinic_profiles.booking_enabled` is already a useful operational switch. It must not be treated as proof that every onboarding activity is complete.

#### Where should formal state live later?

For the smallest future model, it should live on `public.clinic_profiles`, not in a new table. The profile is one-to-one with the account, already account-scoped, and represents clinic configuration. A separate onboarding table is justified only when multiple concurrent onboarding runs, assigned workflow queues, immutable transition/audit history, or cross-team operational reporting is actually required.

`LEAD` should not be stored on `clinic_profiles`: a lead may not yet have a clinic profile or even a provisioned account. It belongs in a future sales/onboarding control-plane process, if that process is introduced.

#### MVP and future states

The MVP should use an operational checklist rather than persisted states. If G2 is implemented, the minimal persisted clinic states are:

```text
CONFIGURING → TESTING → READY → LIVE
                     ↘ BLOCKED
```

`REGISTERED`, `PROFILE_COMPLETE`, `DOCTORS_CONFIGURED`, `SERVICES_CONFIGURED`, `SCHEDULE_CONFIGURED`, `PATIENTS_IMPORTED`, `WHATSAPP_CONNECTED`, and `AUTOMATIONS_CONFIGURED` are useful derived checklist milestones, not required stored states. This avoids a state machine whose values duplicate configuration data and can become inconsistent.

### 5.2 Clinic hours, schedules, holidays, and exceptions

`doctor_schedules` is the right initial source for *bookable doctor availability*: it has account-scoped doctor ownership, weekday, start/end time, active state, and slot duration. `clinic_profiles.timezone` provides the account-level timezone. Therefore a clinic-level hours table is not P0.

`clinic_profiles.working_days` is JSONB with no contract or database validation. For MVP it may be used as optional display metadata only after application validation defines a documented versioned shape. It must not override doctor availability or be relied on for conflict prevention.

Date-specific closures and exceptions cannot be represented reliably by either current field. Do not create separate clinic-hours and doctor-leave tables now. When required, one `clinic_schedule_exceptions` table (G4) can cover both account-wide closures and doctor-specific exceptions.

The database currently allows two active `doctor_schedules` rows for the same doctor/day to overlap. This does not itself create duplicate appointments. The future schedule writer should reject overlaps in application logic in P0. A database constraint can be reconsidered after exception semantics and schedule editing behavior are settled.

### 5.3 Appointment rules and current sufficiency

| Requirement | Current support | MVP decision |
| --- | --- | --- |
| Appointment time range | `start_time < end_time` check | Supported |
| Appointment status | Controlled values including pending, confirmed, rescheduled, cancelled, completed, and no-show | Supported as labels, not a full lifecycle policy |
| Service duration | Positive `clinic_services.duration_minutes` | Available as an input; appointment duration is not enforced to match it |
| Slot duration | Positive `doctor_schedules.slot_duration_minutes` | Available as an input; no slot generation/enforcement |
| Doctor availability | Recurring schedule rows exist | Future booking code must check coverage; no current DB enforcement |
| Active doctor/service | `is_active` values exist | Future booking code must enforce them |
| Same-day booking | No configuration | Application default for MVP; G9 for per-clinic setting |
| Advance booking window | No configuration | Application default for MVP; G9 for per-clinic setting |
| Cancellation | Status and `cancelled_at` exist | Application workflow/default for MVP; G9 for per-clinic window |
| Rescheduling | `rescheduled` status exists | Application workflow for MVP; G10 for lineage |
| Buffer time | No configuration | Application default for MVP; G9 for per-clinic setting |
| Maximum appointments/session | No capacity/resource model | Defer (G11) |
| Double booking | No interval constraint | P0 exclusion constraint (G6) |

The current tables are sufficient for a basic internal booking workflow only when future application code performs availability and rule validation **and** the database receives G6's overlap protection. They are insufficient for configurable self-service booking rules, holiday-aware availability, multi-capacity scheduling, or a fully database-enforced scheduling engine.

### 5.4 Database-level conflict prevention

#### Current result

PostgreSQL currently does **not** prevent two appointments from occupying the same doctor/time interval. The existing `idx_appointments_account_doctor_date` is a lookup index, not a uniqueness or interval-overlap rule. `start_time < end_time` validates each individual row only.

#### Recommended approach — G6 (P0)

Use a partial GiST exclusion constraint on `public.appointments`:

```sql
EXCLUDE USING gist (
  account_id WITH =,
  doctor_id WITH =,
  tsrange(appointment_date + start_time, appointment_date + end_time, '[)') WITH &&
)
WHERE (status IN ('pending', 'confirmed', 'rescheduled'))
```

Proposed exact constraint name: `appointments_no_overlapping_active_doctor_time`.

This requires the `btree_gist` extension so UUID equality can participate in a GiST exclusion constraint. The half-open range `[)` allows an appointment ending at 10:00 and another starting at 10:00 while rejecting any actual overlap. Cancelled appointments are intentionally excluded so their released slot can be booked again. The final status list must be reviewed with the appointment lifecycle before implementation.

Why alternatives are not selected:

- A unique index can reject only exactly equal values; it cannot reject overlapping intervals of different start/end values.
- Application-side “check then insert” alone has a race condition when two requests read availability before either inserts.
- Transaction-level locking works only if every current and future write path uses exactly the same transaction discipline. Direct authenticated inserts would still bypass it.
- A database function/trigger can validate schedule and service compatibility, but it is more complex and does not replace the simple, race-safe exclusion constraint. It is deferred as G8 until the public write interface is decided.

Before adding the exclusion constraint, its migration must preflight existing appointments for active overlaps and handle any existing conflicting data explicitly. The constraint migration must be tested locally against the applied database before it is considered for production.

### 5.5 WhatsApp consent

#### Correct ownership

Consent belongs to the **contact** and the communication **channel**, not to the patient profile, conversation, or account:

- A contact can interact without being a patient; consent must remain valid for the messaging identity.
- A patient profile is a clinic extension of a contact and should not determine messaging consent.
- A conversation is an event/thread and can be recreated or closed; it is not the enduring consent subject.
- An account can define its policy, but cannot grant consent for an individual contact.

The proposed source of truth is a separate account-scoped `contact_channel_consents` event table (G12). It keeps the consent subject, channel, evidence, source, timestamp, and later revocation history together without overloading the shared `contacts` CRM record or relying on free-form custom fields.

For a small MVP, the application can calculate the current consent as the latest event for `(account_id, contact_id, channel)`. It must gate proactive template sends, broadcasts, and automation sends on that result. The existing inbound WhatsApp conversation window/provider policy is a separate Meta delivery rule and is not a substitute for consent evidence.

### 5.6 Master clinic templates

The existing source-controlled flow and automation template approach demonstrates the correct MVP pattern:

- definitions live in reviewed application constants;
- clone code creates account-owned target records;
- no source template is visible or mutable as tenant data; and
- no provider credentials, contacts, patients, conversations, or user identities are copied.

Use this pattern for initial clinic profile defaults, service seeds, schedule patterns, message-template drafts, and automation/flow seeds. Personal doctor records must not be cloned from a master; a template may provide role placeholders only.

Do not create database master-template records for MVP. If clinics later need to author, version, approve, and reuse their own templates without a deployment, add the tenant-owned definition/version model in G15. A global platform-managed catalogue would require a separate privileged control-plane authorization model and is deliberately not proposed here.

## 6. Recommended MVP data model

### Retain unchanged

- `accounts`, `profiles`, `clinic_profiles`, `clinic_doctors`, `clinic_services`, `doctor_schedules`, `contacts`, `patient_profiles`, and `appointments`.
- Existing account-scoped composite foreign keys and Phase 3 RLS model.
- Existing WhatsApp/provider, messaging, automation, flow, and webhook tables.

### P0 addition 1 — active appointment interval exclusion

| Exact object | Classification / priority | Purpose | Why current schema is insufficient | Security/tenancy implications |
| --- | --- | --- | --- | --- |
| Extension: `btree_gist` | E / P0 | Supplies GiST equality operators needed for UUID equality in the exclusion constraint | Existing btree indexes cannot test interval overlap | No tenant data or RLS behavior changes |
| `public.appointments` constraint `appointments_no_overlapping_active_doctor_time` | E / P0 | Prevents overlapping pending/confirmed/rescheduled intervals for one account/doctor | Current checks validate only an individual row; current index is non-unique | Includes `account_id` and `doctor_id`; works independently of, and does not weaken, RLS |

### P0 addition 2 — WhatsApp consent events

| Exact object | Classification / priority | Purpose | Why current schema is insufficient | Security/tenancy implications |
| --- | --- | --- | --- | --- |
| `public.contact_channel_consents` | D / P0 when proactive WhatsApp is enabled | Account-owned consent/opt-out event history for a contact and channel | `contacts`, `conversations`, `whatsapp_config`, and custom values do not provide a typed auditable consent record | Required `account_id`; composite FK `(account_id, contact_id)` to `contacts(account_id, id)`; own RLS based on `is_account_member(account_id)` |
| `contact_channel_consents.id UUID` | D / P0 component | Event identifier | No consent event exists | System-generated, not a cross-account identifier |
| `contact_channel_consents.account_id UUID NOT NULL` | D / P0 component | Tenant key | A consent must be tenant-owned | FK to `accounts(id)` and part of contact composite FK |
| `contact_channel_consents.contact_id UUID NOT NULL` | D / P0 component | Consent subject | Consent belongs to a CRM contact | Composite FK keeps contact in same account |
| `contact_channel_consents.channel TEXT NOT NULL` | D / P0 component | Communication channel | Current data cannot distinguish channel scope | MVP check restricts it to `whatsapp` |
| `contact_channel_consents.status TEXT NOT NULL` | D / P0 component | Event result | Current data has no opt-in/opt-out state | MVP check restricts it to `opted_in` or `opted_out` |
| `contact_channel_consents.source TEXT NOT NULL` | D / P0 component | Records how the decision was obtained | Free-form custom values have no source | Controlled application vocabulary, e.g. inbound, import, form, agent |
| `contact_channel_consents.recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()` | D / P0 component | Effective/audit event time | No timestamped consent evidence | System or authorized actor writes it |
| `contact_channel_consents.evidence JSONB NULL` | D / P0 component | Minimal provider/form/import evidence reference | Current schema cannot retain proof without overloading notes | Validate shape in application; never store secrets unnecessarily |
| `contact_channel_consents.recorded_by UUID NULL REFERENCES auth.users(id)` | D / P0 component | Optional human/system actor trace | Existing contact row cannot identify consent event actor | RLS must not let an actor spoof another user; set server-side or validate `auth.uid()` |
| Index `idx_contact_channel_consents_latest` on `(account_id, contact_id, channel, recorded_at DESC)` | E / P0 supporting object | Efficient current-consent lookup | Event history needs latest-event retrieval | Account-first index supports tenant-scoped lookup |

No unique constraint should limit this table to one row per contact/channel: consent history must retain a later opt-out or renewed opt-in. A future migration may add a derived state projection only if the query pattern proves it necessary.

## 7. P1 and later schema candidates

### G2 — persistent onboarding status (P1)

| Exact object | Classification / priority | Purpose | Why current schema is insufficient | Security/tenancy implications |
| --- | --- | --- | --- | --- |
| `clinic_profiles.onboarding_status TEXT NOT NULL DEFAULT 'CONFIGURING'` | C / P1 | Optional persistent onboarding state | Current profile has no state; readiness is only derivable | Existing `clinic_profiles.account_id` and account-scoped RLS continue to apply |
| `clinic_profiles.onboarding_block_reason TEXT NULL` | C / P1 | Explain `BLOCKED` state | No blocker/audit field | Admin-only settings writes remain appropriate |
| `clinic_profiles.onboarding_status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` | C / P1 | State change timestamp | No lifecycle timestamp | System/update path should maintain it consistently |
| `clinic_profiles.go_live_at TIMESTAMPTZ NULL` | C / P1 | Controlled launch record | `booking_enabled` is not an auditable go-live timestamp | Admin-only write; do not infer tenant crossing |
| Check `clinic_profiles_onboarding_status_check` | E / P1 supporting object | Limit values to `CONFIGURING`, `TESTING`, `READY`, `LIVE`, `BLOCKED` | Text alone accepts invalid state values | No RLS impact |

No `LEAD` column is proposed. If sales-lead management is later needed, it should be a separate product/control-plane decision rather than an invalid nullable clinic profile.

### G4 — schedule exceptions (P1)

| Exact object | Classification / priority | Purpose | Why current schema is insufficient | Security/tenancy implications |
| --- | --- | --- | --- | --- |
| `public.clinic_schedule_exceptions` | D / P1 | Persist clinic closures and doctor-specific availability exceptions | Recurring weekly schedules and JSONB working days cannot represent dated overrides | Required `account_id`, RLS via `is_account_member(account_id)`, admin+ configuration writes |
| `clinic_schedule_exceptions.id UUID` | D / P1 component | Exception identity | No exception entity exists | System-generated |
| `clinic_schedule_exceptions.account_id UUID NOT NULL` | D / P1 component | Tenant key | Exceptions must never cross clinics | FK to `accounts(id)` |
| `clinic_schedule_exceptions.doctor_id UUID NULL` | D / P1 component | `NULL` means clinic-wide; set means a doctor-specific exception | No current date-specific doctor/clinic override | Composite FK `(account_id, doctor_id)` to `clinic_doctors(account_id, id)` when supplied |
| `clinic_schedule_exceptions.starts_at TIMESTAMPTZ NOT NULL`, `ends_at TIMESTAMPTZ NOT NULL` | D / P1 component | Precise local-time exception range after timezone conversion | Current schema has recurring time-only rows | Check `starts_at < ends_at`; convert/display using clinic timezone |
| `clinic_schedule_exceptions.kind TEXT NOT NULL DEFAULT 'closed'` | D / P1 component | `closed` or `available` override | No override semantics exist | Check controlled values; tenant policy remains account-scoped |
| `clinic_schedule_exceptions.reason TEXT NULL` | D / P1 component | Operational explanation | No exception reason exists | Avoid sensitive clinical data |
| Index `idx_clinic_schedule_exceptions_account_range` on `(account_id, starts_at, ends_at)` | E / P1 supporting object | Availability lookup | Future booking needs efficient account/date filtering | Account-first tenant-safe query shape |

### G9 — per-clinic booking rules (P1)

This should be explicit columns on the existing one-to-one `clinic_profiles` row, not a new JSONB rules table and not a separate one-row table. The values are small, stable configuration for one clinic.

| Exact column | Classification / priority | Purpose | Why current schema is insufficient | Security/tenancy implications |
| --- | --- | --- | --- | --- |
| `clinic_profiles.same_day_booking_enabled BOOLEAN NOT NULL DEFAULT true` | C / P1 | Permit/deny same-day booking | Only broad `booking_enabled` exists | Existing account-scoped profile RLS applies |
| `clinic_profiles.same_day_booking_cutoff_time TIME NULL` | C / P1 | Define local same-day cutoff | No cutoff exists | Interpret in `clinic_profiles.timezone` |
| `clinic_profiles.max_advance_booking_days INTEGER NOT NULL DEFAULT 90` | C / P1 | Limit future booking horizon | No horizon exists | Check greater than or equal to zero |
| `clinic_profiles.cancellation_window_minutes INTEGER NULL` | C / P1 | Per-clinic cancellation deadline | Status/timestamp exist but no rule | Check greater than or equal to zero when set |
| `clinic_profiles.reschedule_window_minutes INTEGER NULL` | C / P1 | Per-clinic reschedule deadline | No rule exists | Check greater than or equal to zero when set |
| `clinic_profiles.default_buffer_before_minutes INTEGER NOT NULL DEFAULT 0` | C / P1 | Booking buffer before appointments | No buffer exists | Check greater than or equal to zero |
| `clinic_profiles.default_buffer_after_minutes INTEGER NOT NULL DEFAULT 0` | C / P1 | Booking buffer after appointments | No buffer exists | Check greater than or equal to zero |
| Check `clinic_profiles_booking_rules_nonnegative_check` | E / P1 supporting object | Reject negative window/buffer values | Numeric columns alone permit invalid values | No RLS impact |

### G10 — reschedule lineage (P1)

| Exact object | Classification / priority | Purpose | Why current schema is insufficient | Security/tenancy implications |
| --- | --- | --- | --- | --- |
| `appointments.rescheduled_from_appointment_id UUID NULL` | C / P1 | Link a replacement appointment to its original appointment | `rescheduled` is only a status label | Must be same-account, not a bare FK to an arbitrary appointment |
| Unique key `appointments_account_id_id_key` on `(account_id, id)` | E / P1 supporting object | Referenced key for scoped self-reference | `appointments` does not currently expose this composite unique key | Makes same-account relation possible |
| FK `appointments_account_id_rescheduled_from_fkey` on `(account_id, rescheduled_from_appointment_id)` to `appointments(account_id, id)` | E / P1 supporting object | Enforce same-account appointment lineage | Bare self FK would permit cross-account linkage | Preserve tenant boundary; use `ON DELETE RESTRICT` unless lifecycle policy explicitly approves another action |
| Index `idx_appointments_account_rescheduled_from` on `(account_id, rescheduled_from_appointment_id)` | E / P1 supporting object | Lineage lookup | Parent/replacement reporting needs lookup support | Account-first lookup |

### G13 — contact postal address (P2)

| Exact object | Classification / priority | Purpose | Why current schema is insufficient | Security/tenancy implications |
| --- | --- | --- | --- | --- |
| `contacts.address TEXT NULL` | C / P2 | Store a general contact/patient postal address if a real workflow needs it | `contacts` has no address; clinic address is not patient address | Existing contact account RLS applies; collect only necessary PII and define retention/access policy |

Do not add clinical or medical fields under this item.

### G15 — tenant-authored versioned clinic templates (P2)

| Exact object | Classification / priority | Purpose | Why current schema is insufficient | Security/tenancy implications |
| --- | --- | --- | --- | --- |
| `public.clinic_template_definitions` | D / P2 | Tenant-owned reusable template identity | Static application constants cannot be edited/versioned at runtime | Required `account_id`; only owner/admin may manage; no cross-account template reads |
| `clinic_template_definitions.id UUID`, `account_id UUID NOT NULL`, `name TEXT NOT NULL`, `is_active BOOLEAN NOT NULL DEFAULT true` | D / P2 components | Identify a named tenant template | No tenant template entity exists | Unique `(account_id, name)`; account-scoped RLS |
| `public.clinic_template_versions` | D / P2 | Immutable version snapshots | A definition alone cannot preserve clone provenance | Parent template is account-scoped; inserts should be owner/admin controlled |
| `clinic_template_versions.id UUID`, `template_id UUID NOT NULL`, `version INTEGER NOT NULL`, `snapshot JSONB NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` | D / P2 components | Version service/schedule/message/automation/flow seed data as one reviewed snapshot | Existing tables are runtime target records, not reusable source definitions | Unique `(template_id, version)`; validate snapshot in application; never include credentials, patients, contacts, conversations, or user identities |

This P2 model is only for templates owned by one tenant. It intentionally does not create a cross-account global master-template catalogue. Platform defaults should remain reviewed application constants until a separate control-plane model is designed.

## 8. Proposed constraints, indexes, functions, and triggers

### Constraints and indexes

| Object | Gap / priority | Recommendation |
| --- | --- | --- |
| `appointments_no_overlapping_active_doctor_time` exclusion constraint | G6 / P0 | Required. Use account, doctor, and half-open appointment range as described in section 5.4. |
| `idx_contact_channel_consents_latest` | G12 / P0 | Required with consent event table to resolve current state efficiently. |
| `clinic_profiles_onboarding_status_check` | G2 / P1 | Required if/onboarding-state columns are introduced. |
| `clinic_profiles_booking_rules_nonnegative_check` | G9 / P1 | Required if booking-rule columns are introduced. |
| `clinic_schedule_exceptions` time/range and composite doctor FK checks | G4 / P1 | Required with exception table. |
| `appointments_account_id_id_key`, scoped reschedule FK, and lineage index | G10 / P1 | Required if reschedule lineage is introduced. |

### Database functions and triggers

No new database function or trigger is recommended for P0.

G8 is P2: if the product continues to let authenticated clients insert/update `appointments` directly after booking is exposed, introduce one narrowly scoped database function or trigger that validates schedule coverage, active doctor/service state, duration/buffer compatibility, and the applicable booking rules. It must not be `SECURITY DEFINER` merely to bypass tenant rules; it should operate on the row's account and preserve RLS. A controlled RPC plus corresponding write-policy design may be safer than a broad trigger, but that decision depends on the future API boundary.

The exclusion constraint remains required even if G8 is implemented because it is the direct concurrent-write protection.

## 9. RLS, grants, and tenancy implications

Every future table must:

- include `account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE`;
- use `public.is_account_member(account_id)`-based RLS consistent with the data class;
- use composite foreign keys whenever a child references an account-owned parent that may otherwise be guessed by ID;
- receive only the authenticated privileges needed to let PostgreSQL evaluate its RLS policies; and
- be added to the authenticated multi-tenant integration test with both own-account success and cross-account denial assertions.

Recommended role posture, subject to the final product workflow:

| Future data | Read | Create/update/delete | Notes |
| --- | --- | --- | --- |
| `contact_channel_consents` | Viewer+ in the same account where operationally needed | Agent+ may record new events; avoid mutable/deletable history unless an explicit correction process exists | Current consent must be enforced by send/broadcast/automation code |
| `clinic_schedule_exceptions` | Viewer+ | Admin+ | Settings-class availability configuration |
| Onboarding status and booking-rule columns on `clinic_profiles` | Viewer+ | Admin+ | Same posture as current clinic profile |
| Tenant template definitions/versions | Viewer+ | Owner/admin+ | Never make a tenant template readable across accounts |

`recorded_by` for consent needs special care: a browser client must not be able to record a different user's ID. The eventual API should set it from the authenticated identity, or the eventual RLS policy/trigger must validate it. This is an integrity concern, not a reason to weaken RLS.

## 10. Recommended migration sequence

No migration is created in this phase. The following is the recommended **future** sequence, after separate design review and local validation:

1. `041_clinicconnect_appointment_conflict_prevention.sql` — P0. Enable `btree_gist` if absent; preflight existing active appointment overlaps; add `appointments_no_overlapping_active_doctor_time`.
2. `042_clinicconnect_contact_channel_consents.sql` — P0 when proactive WhatsApp is enabled. Create the account-scoped event table, composite contact FK, constraints/index, RLS policies, minimal authenticated grants, and integration assertions.
3. `043_clinicconnect_onboarding_status_and_booking_rules.sql` — P1. Add the small `clinic_profiles` state/rules columns and their checks only when persistent workflow and per-clinic variation are requested.
4. `044_clinicconnect_schedule_exceptions_and_reschedule_lineage.sql` — P1. Add dated schedule exceptions and, if the scheduling UX needs it, same-account reschedule lineage.
5. A later tenant-template migration — P2 only after self-service template authoring/versioning is a validated requirement.

Each migration must remain additive where possible, be validated against the local applied database, include RLS/grant review, and extend the existing authenticated RLS test. No migration should be applied automatically as part of this plan.

## 11. Items explicitly deferred

- A persistent `LEAD` state or sales pipeline tied to clinic profiles.
- A standalone onboarding workflow/checklist/audit table.
- Structured clinic-level operating-hours rows when doctor schedules are sufficient for initial bookable availability.
- Database-level prevention of overlapping recurring schedule configuration rows.
- A database trigger/RPC scheduling engine.
- Per-doctor rooms, equipment, group-session capacity, and maximum appointments per session.
- Contact address unless an actual workflow needs it.
- Legal entity/tax identifiers and clinical/medical data.
- A global cross-account master-template catalogue.

## 12. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Concurrent booking requests double-book a doctor | P0 exclusion constraint, plus map exclusion violations to a clear “slot no longer available” response |
| A valid time range is booked outside doctor hours | Future booking writer validates active doctor/service, schedule coverage, timezone, and rule defaults; consider G8 only when direct writes are a product interface |
| State values drift from actual configuration | Keep MVP milestones derived; if persistent status is added, store only coarse operational state |
| Consent is recorded as an arbitrary custom field and cannot be audited/enforced | Use G12's typed contact/channel event record and gate outbound sends |
| A global template leaks data or credentials across tenants | Use application constants for MVP; future tenant templates remain account-owned and snapshots exclude secrets/data |
| New relations accidentally weaken verified isolation | Make `account_id` mandatory, use scoped composite FKs, preserve `is_account_member` RLS, grant minimally, and add two-account integration assertions |
| Exclusion-constraint migration fails on historical overlaps | Run an explicit local/production preflight and resolve data before `ALTER TABLE ... ADD CONSTRAINT` |

## 13. Recommended next implementation step

Before building onboarding UI or APIs, decide the exact MVP launch channels:

1. If the first clinic will accept appointments, design and implement **G6** first, then build one appointment creation path that performs the G7 validation and handles exclusion conflicts.
2. If the first clinic will send proactive WhatsApp messages, design and implement **G12** first, then gate broadcast/automation/template sends on the latest contact/channel consent event.
3. Use an operational checklist for onboarding rather than persisting state. Revisit G2, G4, G9, and G10 only when the first clinic needs configurable policies, exceptions, auditability, or reschedule history.

This sequence satisfies the product goal: **new clinic → configure → test → go live**, without prematurely introducing an enterprise onboarding or template architecture.
