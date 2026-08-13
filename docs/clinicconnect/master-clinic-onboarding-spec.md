# ClinicConnect Master Clinic Onboarding Data Specification

## 1. Purpose

This document defines the data required to onboard a clinic into ClinicConnect before UI or API work begins. It maps the required onboarding information to the local schema as it exists after migration 040, identifies unsupported requirements without inventing columns, and preserves the verified account-scoped security model.

This is a specification and schema audit only. It does not change migrations, database policies or grants, application code, or production data.

## 2. Audit scope and current schema inventory

### Audit result

There is no onboarding table, onboarding-status column, or equivalent account-level workflow entity in the current schema. `accounts` and membership/profile data establish the tenant and its users, but do not record clinic-onboarding progress.

The current production application paths use the established CRM and WhatsApp tables (`contacts`, `conversations`, `whatsapp_config`, `message_templates`, `automations`, `flows`, and `webhook_endpoints`). The six ClinicConnect clinical/booking tables are presently represented by migration/schema and the local RLS integration test; they are not yet consumed by a clinic-onboarding UI or API.

| Table | Current purpose | Important schema support |
| --- | --- | --- |
| `clinic_profiles` | One clinic identity/profile per account | `UNIQUE (account_id)`; clinic details, timezone, booking toggle, unstructured `working_days` JSONB |
| `clinic_doctors` | Account-owned doctors | Identity, professional details, active flag; account-scoped IDs |
| `clinic_services` | Account-owned services | Name, description, duration, price, active flag |
| `doctor_schedules` | Recurring weekly doctor availability | Day, start/end time, slot duration, active flag; account-scoped doctor FK |
| `patient_profiles` | Patient-only extensions to a CRM contact | Date of birth, gender, language, notes; composite account/contact FK |
| `appointments` | Scheduled patient/doctor/service visits | Date/time, status, source, notes, communication timestamps; account-scoped composite FKs |
| `contacts` | Shared CRM and messaging identity | Name, phone/mobile, optional email; account-scoped uniqueness and account/contact composite key |
| `whatsapp_config` | One Meta WhatsApp configuration per account | Phone number ID, WABA ID, credential/verification and registration status |
| `message_templates` | Meta WhatsApp templates per account | Content, language, category, header/buttons, Meta approval/sync state |
| `webhook_endpoints` | Account outbound webhooks | URL, secret, subscribed events, active/delivery state |
| `automations` | Account automation definitions | Name, description, trigger type/configuration, active state |
| `flows` | Account conversational-flow definitions | Draft/active/archived state, triggers, entry node and fallback policy |
| `conversations` | Operational account/contact message threads | Status, assignment, last-message and AI assistance state |

### Integrity, tenancy, and lifecycle controls observed

- Each ClinicConnect table has a required `account_id` referring to `public.accounts(id)` with cascade deletion.
- `clinic_profiles` is limited to one profile per account by its account unique key.
- `doctor_schedules`, `patient_profiles`, and `appointments` use composite account-scoped foreign keys. In particular, `patient_profiles(account_id, contact_id)` references `contacts(account_id, id)`, preventing a patient profile from pointing to another account's contact.
- `clinic_services` enforces a positive duration and a non-negative price when supplied. `doctor_schedules` and `appointments` enforce `start_time < end_time`; schedules limit the weekday to 0 through 6.
- The ClinicConnect tables have `set_updated_at` triggers. Their RLS policies remain account-scoped through `public.is_account_member(account_id)` and roles `owner`, `admin`, `agent`, and `viewer`. Phase 3's authenticated test verified these controls with 27/27 assertions.
- Migration 040 grants the authenticated role table DML privileges; grants complement, and do not replace, RLS.

## 3. Master onboarding sections

The master onboarding journey is organized as follows:

1. Clinic Registration
2. Clinic Profile
3. Clinic Operating Hours
4. Doctors
5. Doctor Schedules
6. Services
7. Appointment Rules
8. Patient / Contact Setup
9. WhatsApp Configuration
10. Message Templates
11. Automation Configuration
12. Go-Live / Testing

Each field below records whether it is present today. **MISSING FROM CURRENT SCHEMA** means a future design/migration is needed; it is not a directive to add a column now.

## 4. Field-by-field specification and existing schema mapping

### 4.1 Clinic Registration

Clinic registration creates/identifies the tenant. It is separate from the clinic profile, which supplies clinic-facing details after the account exists.

| Logical field | Current table / column | Type | R/O | Default | Validation / allowed values | Entered by | Template source | Go-live | Schema support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Clinic account ID | `accounts.id` | UUID | Required | System generated | Immutable tenant identifier | System | No | Yes | Supported by existing account model |
| Account display name | `accounts.name` | Text | Required | None | Non-empty tenant name; final product validation to define length | Owner or onboarding employee | Master template may suggest a placeholder only | Yes | Supported by existing account model |
| Account owner | `accounts.owner_user_id` and account membership/profile role | UUID/user relationship | Required | System assigned at account creation | Must be the authenticated owner and an account member with `owner` role | System / onboarding employee | No | Yes | Supported by existing account/membership model |
| Owner sign-in email | Auth user, not a clinic table column | Email | Required | None | Valid auth email; verified according to Auth configuration | Owner | No | Yes | Supported by existing Auth model; do not duplicate as clinic data |
| Legal entity name | **MISSING FROM CURRENT SCHEMA** | Text | Optional unless required by the operating jurisdiction | None | Non-empty if collected | Owner or onboarding employee | Master template may provide a label only | No for initial private beta; policy decision for regulated launch | MISSING FROM CURRENT SCHEMA; requires a defined legal/billing entity model |
| Registration/tax identifier | **MISSING FROM CURRENT SCHEMA** | Text | Optional unless required by jurisdiction | None | Jurisdiction-specific format and sensitivity handling | Owner or onboarding employee | No | Depends on launch jurisdiction | MISSING FROM CURRENT SCHEMA; requires data-minimization and access design |
| Primary onboarding contact | **MISSING FROM CURRENT SCHEMA** as a distinct role | User/contact reference | Required | None | Must resolve to an account member or approved contact | Owner or onboarding employee | No | Yes | MISSING FROM CURRENT SCHEMA; current owner is available but no explicit onboarding-contact field |

### 4.2 Clinic Profile

`clinic_profiles` provides one profile per account. It is the canonical place for the clinic-facing identity, not `contacts`.

| Logical field | Current table / column | Type | R/O | Default | Validation / allowed values | Entered by | Template source | Go-live | Schema support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Clinic profile ID | `clinic_profiles.id` | UUID | Required | `uuid_generate_v4()` | System generated, immutable | System | No | Yes | Supported |
| Account | `clinic_profiles.account_id` | UUID | Required | None | Must be the current tenant account; unique per account | System | No | Yes | Supported |
| Clinic name | `clinic_profiles.clinic_name` | Text | Required | None | Non-empty; UI should apply a sensible length limit | Owner or onboarding employee | Can be seeded from master template then customized | Yes | Supported |
| Clinic type | `clinic_profiles.clinic_type` | Text | Optional | `NULL` | Controlled vocabulary should be defined before UI implementation; no DB enum/check currently | Owner or onboarding employee | Yes | Recommended | Supported column; validation vocabulary is missing |
| Primary phone | `clinic_profiles.phone` | Text | Optional | `NULL` | Normalize/display consistently; separate from the WhatsApp sender number | Owner or onboarding employee | Yes | Recommended | Supported column; no format check |
| Public email | `clinic_profiles.email` | Text | Optional | `NULL` | Valid email format in application validation | Owner or onboarding employee | Yes | Recommended | Supported column; no format check |
| Street address | `clinic_profiles.address` | Text | Optional | `NULL` | Non-empty when supplied | Owner or onboarding employee | Yes | Recommended for physical clinic | Supported |
| City | `clinic_profiles.city` | Text | Optional | `NULL` | Non-empty when supplied | Owner or onboarding employee | Yes | Recommended for physical clinic | Supported |
| Time zone | `clinic_profiles.timezone` | Text | Required | `Asia/Kolkata` | Valid IANA time-zone identifier; must govern schedule/appointment display and automation timing | Owner or onboarding employee | Master template default may be used then confirmed | Yes | Supported column; IANA validation is application responsibility |
| Booking enabled | `clinic_profiles.booking_enabled` | Boolean | Required | `true` | `true` only after booking readiness checks pass | Owner/onboarding employee; system may gate it | Template may default to `false` for staged onboarding | Yes for public booking; otherwise No | Supported |
| Legacy/general working days | `clinic_profiles.working_days` | JSONB | Optional | `NULL` | Define a versioned JSON shape before using; do not treat as authoritative availability until then | Owner or onboarding employee | Yes | No | Partial: flexible storage exists but no defined structure/validation |
| Created / updated timestamps | `clinic_profiles.created_at`, `updated_at` | Timestamp with time zone | System | `now()` | System-managed; update trigger maintains `updated_at` | System | No | N/A | Supported |

### 4.3 Clinic Operating Hours

Current schema has an optional `clinic_profiles.working_days` JSONB field and doctor-level recurring schedules. It does **not** define structured clinic-wide opening hours, breaks, closures, holiday exceptions, or a canonical relationship between clinic hours and doctor availability.

| Logical field | Current table / column | Type | R/O | Default | Validation / allowed values | Entered by | Template source | Go-live | Schema support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Clinic operating weekday | `clinic_profiles.working_days` (unstructured only) | JSONB element | Required for a booking clinic | `NULL` | Weekdays must use one canonical 0–6 or named-day convention | Owner/onboarding employee | Yes | Yes if booking enabled | Partial: no defined JSON contract |
| Clinic opening time | **MISSING FROM CURRENT SCHEMA** | Time | Required for a booking clinic | None | Local time in clinic timezone | Owner/onboarding employee | Yes | Yes if booking enabled | MISSING FROM CURRENT SCHEMA; `working_days` has no enforced shape |
| Clinic closing time | **MISSING FROM CURRENT SCHEMA** | Time | Required for a booking clinic | None | Must be after opening time | Owner/onboarding employee | Yes | Yes if booking enabled | MISSING FROM CURRENT SCHEMA |
| Midday breaks / split sessions | **MISSING FROM CURRENT SCHEMA** | Repeating time ranges | Optional | None | Each range must be valid and non-overlapping | Owner/onboarding employee | Yes | No | MISSING FROM CURRENT SCHEMA |
| Holiday / exceptional closure | **MISSING FROM CURRENT SCHEMA** | Date or date-time range | Optional | None | Must be a valid date/range in clinic timezone | Owner/onboarding employee | No | No | MISSING FROM CURRENT SCHEMA |
| Operating-hours time zone | `clinic_profiles.timezone` | Text | Required | `Asia/Kolkata` | Valid IANA timezone | Owner/onboarding employee | Yes | Yes if booking enabled | Supported via clinic profile |

### 4.4 Doctors

Doctors belong to one account. The current table supports the requested identity and professional fields, but does not enforce uniqueness or normalize phone/email values.

| Logical field | Current table / column | Type | R/O | Default | Validation / allowed values | Entered by | Template source | Go-live | Schema support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Doctor ID | `clinic_doctors.id` | UUID | Required | `uuid_generate_v4()` | System generated | System | No | Yes when a schedule/appointment references it | Supported |
| Account | `clinic_doctors.account_id` | UUID | Required | None | Must equal current clinic account | System | No | Yes | Supported |
| Name | `clinic_doctors.name` | Text | Required | None | Non-empty; UI length/character policy required | Owner or onboarding employee | Template may include example roles, not identities | Yes for appointment offering | Supported |
| Specialization | `clinic_doctors.specialization` | Text | Optional | `NULL` | Controlled vocabulary is recommended; no DB restriction currently | Owner or onboarding employee | Yes | Recommended | Supported column; vocabulary missing |
| Qualification | `clinic_doctors.qualification` | Text | Optional | `NULL` | Plain text; credential verification is an operational process, not current schema enforcement | Owner or onboarding employee | No | Recommended where advertised | Supported |
| Display name | `clinic_doctors.display_name` | Text | Optional | `NULL` | Non-empty when supplied; use in patient-facing messages/UI | Owner or onboarding employee | Yes | Recommended | Supported |
| Phone | `clinic_doctors.phone` | Text | Optional | `NULL` | Normalize/display consistently; no current format constraint | Owner or onboarding employee | No | No | Supported column; validation missing |
| Email | `clinic_doctors.email` | Text | Optional | `NULL` | Valid email format in application validation; no current format constraint | Owner or onboarding employee | No | No | Supported column; validation missing |
| Bio | `clinic_doctors.bio` | Text | Optional | `NULL` | Plain text; establish moderation/length rules if patient-visible | Owner or onboarding employee | Master template may provide a structure, never a false biography | No | Supported |
| Active status | `clinic_doctors.is_active` | Boolean | Required | `true` | Inactive doctors must not be offered for new bookings | Owner or onboarding employee | Template default `true` | Yes | Supported; booking enforcement is not yet in schema |

### 4.5 Doctor Schedules

Schedules are recurring weekly availability for a doctor. The composite foreign key ensures the selected doctor belongs to the same account.

| Logical field | Current table / column | Type | R/O | Default | Validation / allowed values | Entered by | Template source | Go-live | Schema support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Schedule ID | `doctor_schedules.id` | UUID | Required | `uuid_generate_v4()` | System generated | System | No | Yes when schedule exists | Supported |
| Account | `doctor_schedules.account_id` | UUID | Required | None | Must equal current clinic account | System | No | Yes | Supported |
| Doctor | `doctor_schedules.doctor_id` | UUID | Required | None | Composite FK requires a doctor in the same account | Owner/onboarding employee | Doctor template role may guide but must resolve to created doctor | Yes if booking enabled | Supported |
| Day of week | `doctor_schedules.day_of_week` | Small integer | Required | None | `0` Sunday through `6` Saturday | Owner/onboarding employee | Yes | Yes if booking enabled | Supported |
| Start time | `doctor_schedules.start_time` | Time | Required | None | Must be before end time; interpreted in clinic timezone | Owner/onboarding employee | Yes | Yes if booking enabled | Supported |
| End time | `doctor_schedules.end_time` | Time | Required | None | Must be after start time; interpreted in clinic timezone | Owner/onboarding employee | Yes | Yes if booking enabled | Supported |
| Slot duration | `doctor_schedules.slot_duration_minutes` | Integer | Required | `30` | Must be greater than zero; should be compatible with offered-service duration | Owner/onboarding employee | Yes | Yes if booking enabled | Supported; compatibility with services is not enforced |
| Active status | `doctor_schedules.is_active` | Boolean | Required | `true` | Inactive schedules must not produce bookable slots | Owner/onboarding employee | Template default `true` | Yes if booking enabled | Supported; availability engine enforcement missing |
| Non-overlapping sessions | **MISSING FROM CURRENT SCHEMA** | Constraint/derived rule | Required for reliable booking | None | Schedule ranges for the same doctor/day must not overlap | System validation | N/A | Yes if booking enabled | MISSING FROM CURRENT SCHEMA: table permits overlapping rows |
| Leave, exceptions, holidays | **MISSING FROM CURRENT SCHEMA** | Date/time exceptions | Optional | None | Valid date/time interval; must override recurrence predictably | Owner/onboarding employee | No | Recommended | MISSING FROM CURRENT SCHEMA |

### 4.6 Services

Services are account-owned. They provide a default duration and optional price, but no schema rule currently binds a booked appointment duration to the service.

| Logical field | Current table / column | Type | R/O | Default | Validation / allowed values | Entered by | Template source | Go-live | Schema support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Service ID | `clinic_services.id` | UUID | Required | `uuid_generate_v4()` | System generated | System | No | Yes when appointment references it | Supported |
| Account | `clinic_services.account_id` | UUID | Required | None | Must equal current clinic account | System | No | Yes | Supported |
| Name | `clinic_services.name` | Text | Required | None | Non-empty; unique within account | Owner/onboarding employee | Yes | Yes if booking enabled | Supported; `UNIQUE (account_id, name)` |
| Description | `clinic_services.description` | Text | Optional | `NULL` | Plain text; patient-facing copy rules should be set by UI/product | Owner/onboarding employee | Yes | Recommended | Supported |
| Duration minutes | `clinic_services.duration_minutes` | Integer | Required | `30` | Greater than zero | Owner/onboarding employee | Yes | Yes if booking enabled | Supported |
| Price | `clinic_services.price` | Numeric(12,2) | Optional | `NULL` | Must be zero or positive if supplied; currency presentation must use tenant/business settings | Owner/onboarding employee | Yes | No | Supported; no service-level currency column |
| Active status | `clinic_services.is_active` | Boolean | Required | `true` | Inactive services must not be newly bookable | Owner/onboarding employee | Template default `true` | Yes if booking enabled | Supported; booking enforcement missing |

### 4.7 Appointment Rules

The existing tables record bookings and recurring schedule rows. They do not yet provide a configurable booking-rules model or an availability engine.

| Logical rule | Current table / column | Type | R/O | Default | Validation / allowed values | Entered by | Template source | Go-live | Schema support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Global booking switch | `clinic_profiles.booking_enabled` | Boolean | Required | `true` | Only enable once readiness checks pass | Owner/onboarding employee/system | Template default recommended as `false` until ready | Yes for public booking | Supported |
| Service booking duration | `clinic_services.duration_minutes` | Integer | Required | `30` | Greater than zero | Owner/onboarding employee | Yes | Yes if booking enabled | Partial: service duration exists but appointments are not required to match it |
| Schedule slot duration | `doctor_schedules.slot_duration_minutes` | Integer | Required | `30` | Greater than zero | Owner/onboarding employee | Yes | Yes if booking enabled | Partial: schedule slot exists but no generation/enforcement logic |
| Appointment start/end | `appointments.start_time`, `appointments.end_time` | Time | Required per appointment | None | Start must be before end | System, owner, agent, or approved booking flow | N/A | Yes | Partial: valid range only; availability/non-overlap not enforced |
| Same-day booking permission | **MISSING FROM CURRENT SCHEMA** | Boolean/rule | Required for public booking | Product default to define | Allow/deny and cut-off time in clinic timezone | Owner/onboarding employee | Yes | Yes if booking enabled | MISSING FROM CURRENT SCHEMA |
| Advance booking window | **MISSING FROM CURRENT SCHEMA** | Integer/rule | Required for public booking | Product default to define | Minimum/maximum future days or date-time window | Owner/onboarding employee | Yes | Yes if booking enabled | MISSING FROM CURRENT SCHEMA |
| Cancellation policy/window | `appointments.status`, `cancelled_at` only | Rule plus existing status/timestamp | Recommended | None | A policy needs allowed actor, deadline, reason and notification behavior | Owner/onboarding employee | Yes | Recommended | Partial: cancellation can be recorded, no configurable policy/reason/window |
| Rescheduling policy | `appointments.status` only | Rule plus existing status | Recommended | None | A policy needs deadline, actor, slot reassignment and original-appointment linkage | Owner/onboarding employee | Yes | Recommended | Partial: `rescheduled` exists, no lifecycle/linkage/enforcement |
| Buffer before/after appointment | **MISSING FROM CURRENT SCHEMA** | Minutes/rule | Optional | None | Non-negative minutes, considered in availability | Owner/onboarding employee | Yes | No | MISSING FROM CURRENT SCHEMA |
| Maximum appointments per session | **MISSING FROM CURRENT SCHEMA** | Integer/rule | Optional | None | Positive capacity; define scope (doctor/day/slot/session) | Owner/onboarding employee | Yes | No | MISSING FROM CURRENT SCHEMA |
| Prevent conflicting bookings | **MISSING FROM CURRENT SCHEMA** | Availability constraint/service | Required for automated booking | None | Must prevent doctor/patient time conflict transactionally | System | N/A | Yes if booking enabled | MISSING FROM CURRENT SCHEMA: no overlap/exclusion constraint or booking lock |
| Appointment status | `appointments.status` | Text | Required per appointment | `pending` | `pending`, `confirmed`, `rescheduled`, `cancelled`, `completed`, `no_show` | System/owner/agent/automation | Template may suggest lifecycle | Yes | Supported |
| Appointment source | `appointments.source` | Text | Optional | `NULL` | Define controlled values (for example manual, WhatsApp, web) before reliance/reporting | System/owner/agent | Template may provide supported source names | No | Supported column; allowed values are missing |

### 4.8 Patient / Contact Setup

**Contact** and **patient profile** are deliberately separate concepts:

- A `contacts` row is the account's shared CRM/messaging identity. It holds a person's name, primary phone number and optional email.
- A `patient_profiles` row extends a contact only when that contact is a clinic patient. Its composite foreign key requires that the contact belongs to the same account.

| Logical field | Current table / column | Type | R/O | Default | Validation / allowed values | Entered by | Template source | Go-live | Schema support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Contact ID | `contacts.id` | UUID | Required | `uuid_generate_v4()` | System generated | System | No | Required to create patient profile | Supported |
| Contact account | `contacts.account_id` | UUID | Required | None | Must equal current clinic account | System | No | Yes | Supported |
| Contact name | `contacts.name` | Text | Optional | `NULL` | Non-empty when supplied | Owner/onboarding employee/agent/AI from inbound message where permitted | Import/template mapping can supply it | Recommended | Supported |
| Mobile | `contacts.phone` | Text | Required | None | Required; normalized digits support account-scoped duplicate handling | Owner/onboarding employee/agent/AI from inbound WhatsApp where permitted | Import mapping can supply it | Recommended for messaging or appointment reminders | Supported |
| WhatsApp number | `contacts.phone` (no distinct marker) | Text | Optional logical field | None | If used as WhatsApp, normalize to supported international form and collect consent under clinic policy | Owner/onboarding employee/agent/AI from inbound WhatsApp where permitted | Import mapping can supply it | Recommended for WhatsApp workflows | Partial: the phone is usable, but no dedicated WhatsApp-number/consent field |
| Email | `contacts.email` | Text | Optional | `NULL` | Valid email format in application validation | Owner/onboarding employee/agent | Import mapping can supply it | No | Supported column; no format check |
| Address | **MISSING FROM CURRENT SCHEMA** | Structured or free-form address | Optional | None | Define whether free-form or normalized fields are needed; minimize stored PII | Owner/onboarding employee/agent | Import mapping may supply it | No | MISSING FROM CURRENT SCHEMA |
| Patient profile ID | `patient_profiles.id` | UUID | Required for a patient | `uuid_generate_v4()` | System generated | System | No | Required to book an appointment | Supported |
| Patient contact | `patient_profiles.contact_id` plus `account_id` | UUID pair | Required | None | Composite FK must reference a contact in the same account | System/owner/onboarding employee/agent | Import mapping can resolve/create it | Yes for patient appointment | Supported |
| Date of birth | `patient_profiles.date_of_birth` | Date | Optional | `NULL` | Valid non-future date should be enforced in application; collection must follow clinic policy | Owner/onboarding employee/agent | Import mapping can supply it | No | Supported column; non-future validation missing |
| Gender | `patient_profiles.gender` | Text | Optional | `NULL` | Define inclusive controlled values and allow unset/prefer-not-to-say; no DB restriction currently | Owner/onboarding employee/agent | Import mapping can supply it | No | Supported column; vocabulary missing |
| Preferred language | `patient_profiles.preferred_language` | Text | Optional | `NULL` | Use supported language/locale list before template selection | Owner/onboarding employee/agent/AI where explicitly selected | Import mapping can supply it | Recommended for automated messaging | Supported column; vocabulary missing |
| Notes | `patient_profiles.notes` | Text | Optional | `NULL` | Administrative notes only; do not introduce clinical/medical data through this field without a dedicated policy/design | Owner/onboarding employee/agent | Import mapping can supply it | No | Supported |
| Import provenance, consent, duplicate-review state | **MISSING FROM CURRENT SCHEMA** | Metadata/workflow | Recommended for imports | None | Needs source, consent, reviewer and audit requirements | System/onboarding employee | Import template | No | MISSING FROM CURRENT SCHEMA |

### 4.9 WhatsApp Configuration

The current configuration is account-scoped and has one configuration per account. Existing app code uses it for Meta integration, registration/sync, inbound webhooks, and message-template operations.

| Logical field | Current table / column | Type | R/O | Default | Validation / allowed values | Entered by | Template source | Go-live | Schema support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Configuration ID | `whatsapp_config.id` | UUID | Required when connected | UUID default | System generated | System | No | Yes for WhatsApp go-live | Supported |
| Account | `whatsapp_config.account_id` | UUID | Required | None | Current clinic account; unique per account | System | No | Yes for WhatsApp go-live | Supported |
| Meta phone number ID | `whatsapp_config.phone_number_id` | Text | Required | None | Required, globally unique; must be the selected Meta sender number | Owner/onboarding employee/system integration | No | Yes for WhatsApp go-live | Supported |
| WhatsApp Business Account ID | `whatsapp_config.waba_id` | Text | Optional in schema | `NULL` | Required operationally for full Meta template/registration integration where applicable | Owner/onboarding employee/system integration | No | Yes for WhatsApp go-live | Supported column |
| Access token | `whatsapp_config.access_token` | Text | Required | None | Secret; collect/store through approved secure integration path and never expose in UI/logs | Owner/onboarding employee/system integration | No | Yes for WhatsApp go-live | Supported column; secret-handling process must remain enforced |
| Verify token | `whatsapp_config.verify_token` | Text | Optional | `NULL` | Secret used for webhook verification when applicable | System/onboarding employee | No | Required when webhook verification uses it | Supported |
| Connection status | `whatsapp_config.status` | Text | Required | `disconnected` | `connected` or `disconnected` | System integration | No | Yes for WhatsApp go-live | Supported |
| Connected timestamp | `whatsapp_config.connected_at` | Timestamp with time zone | System | `NULL` | Set only after successful provider connection | System | No | Yes for WhatsApp go-live | Supported |
| Registration/subscription diagnostics | `registered_at`, `subscribed_apps_at`, `last_registration_error` | Timestamp/text | System | `NULL` | Provider-driven status; do not use errors as credentials | System integration | No | Required to verify WhatsApp launch | Supported |
| Consent and outbound-message eligibility | **MISSING FROM CURRENT SCHEMA** | Contact-level policy/audit data | Required before proactive messaging where law/provider requires it | None | Must capture lawful basis/opt-in, source, timestamp and revocation | System/owner/onboarding employee | Import/template mapping may supply evidence | Yes for affected outbound use cases | MISSING FROM CURRENT SCHEMA |

### 4.10 Message Templates

The existing application already manages and synchronizes Meta WhatsApp templates. A future clinic master template may seed content, but the account-specific template still needs customization and provider approval.

| Logical field | Current table / column | Type | R/O | Default | Validation / allowed values | Entered by | Template source | Go-live | Schema support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Template ID | `message_templates.id` | UUID | Required per template | UUID default | System generated | System | No | Depends on message use case | Supported |
| Account | `message_templates.account_id` | UUID | Required | None | Must equal current clinic account | System | Master template clone target | Yes for account-specific template | Supported |
| Template name | `message_templates.name` | Text | Required | None | Provider-compatible naming; existing uniqueness is by `user_id`, name, and language, so account cloning must handle collisions carefully | Owner/onboarding employee | Yes | Yes for each required notification template | Supported |
| Category | `message_templates.category` | Text | Required | `Marketing` | `Marketing`, `Utility`, `Authentication` | Owner/onboarding employee | Yes | Yes | Supported |
| Language | `message_templates.language` | Text | Required | `en_US` | Supported Meta locale; must align with patient preferred language strategy | Owner/onboarding employee | Yes | Yes | Supported |
| Header type | `message_templates.header_type` | Text | Optional | `NULL` | `text`, `image`, `video`, or `document` when used | Owner/onboarding employee | Yes | Depends on template | Supported |
| Header content | `message_templates.header_content` | Text | Optional | `NULL` | Required when header type/content needs it; provider rules apply | Owner/onboarding employee | Yes | Depends on template | Supported |
| Body | `message_templates.body` | Text | Required | None | Non-empty; variable placeholders must have samples and provider-compatible formatting | Owner/onboarding employee/AI drafting with human approval | Yes | Yes | Supported |
| Footer | `message_templates.footer` | Text | Optional | `NULL` | Provider-compatible content | Owner/onboarding employee | Yes | No | Supported |
| Buttons | `message_templates.buttons` | JSONB | Optional | `[]` | Array, maximum 10 buttons; provider-specific button validation required | Owner/onboarding employee | Yes | Depends on template | Supported storage; detailed shape validation belongs to application/provider |
| Sample values | `message_templates.sample_values` | JSONB | Optional | `NULL` | Must cover variables when provider requires examples | Owner/onboarding employee | Yes | Recommended | Supported |
| Meta template ID | `message_templates.meta_template_id` | Text | System | `NULL` | Set from Meta after submission/sync | System integration | No | Yes for provider-backed template | Supported |
| Provider status | `message_templates.status` | Text | Required | `DRAFT` | `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, `PAUSED`, `DISABLED`, `IN_APPEAL`, `PENDING_DELETION` | System integration; human initiates submission | No | `APPROVED` required before sending that template | Supported |
| Quality/rejection/submission diagnostics | `quality_score`, `rejection_reason`, `submission_error`, `last_submitted_at`, `header_handle`, `header_media_url` | Text/timestamp | System/optional | `NULL` | Provider-driven; surface safely for onboarding resolution | System integration | No | Recommended | Supported |
| Master-template origin/version | **MISSING FROM CURRENT SCHEMA** | UUID/version relationship | Recommended for cloning governance | None | Needs source template, version, cloned-at and divergence strategy | System/onboarding employee | N/A | No | MISSING FROM CURRENT SCHEMA |

### 4.11 Automation Configuration

Existing automations and flows are account-scoped operational configuration. They can support reminders and message routing once triggers and content are deliberately configured; they are not a complete appointment-rules engine.

| Logical field | Current table / column | Type | R/O | Default | Validation / allowed values | Entered by | Template source | Go-live | Schema support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Automation ID | `automations.id` | UUID | Required per automation | UUID default | System generated | System | No | No | Supported |
| Automation name | `automations.name` | Text | Required | None | Non-empty and unique by product convention (not current DB constraint) | Owner/onboarding employee | Yes | Recommended | Supported column; uniqueness rule missing |
| Description | `automations.description` | Text | Optional | `NULL` | Plain text | Owner/onboarding employee | Yes | No | Supported |
| Trigger type | `automations.trigger_type` | Text | Required | None | Define a controlled supported-trigger catalogue before UI implementation | Owner/onboarding employee | Yes | Required for enabled automation | Supported column; no DB allowed-values constraint |
| Trigger configuration | `automations.trigger_config` | JSONB | Required logically | `{}` | Must be validated by trigger type and versioned | Owner/onboarding employee/system | Yes | Required for enabled automation | Supported storage; schema contract missing |
| Active | `automations.active` | Boolean | Required | `false` | Enable only after template/provider/tenant checks pass | Owner/onboarding employee/system | Template defaults `false` | No | Supported |
| Execution telemetry | `automations.execution_count`, `last_execution_at` | Integer/timestamp | System | `0` / `NULL` | System-managed | System | No | No | Supported |
| Flow ID/name/status | `flows.id`, `name`, `status` | UUID/text/text | Required for a conversational flow | UUID / none / `draft` | Status: `draft`, `active`, `archived` | Owner/onboarding employee | Yes | No | Supported |
| Flow trigger | `flows.trigger_type`, `trigger_config` | Text/JSONB | Required for active flow | `keyword` / `{}` | Trigger type: `keyword`, `first_inbound_message`, or `manual`; config must match type | Owner/onboarding employee | Yes | Required for active flow | Supported |
| Flow entry/fallback behavior | `flows.entry_node_id`, `fallback_policy` | UUID/JSONB | Required for a usable flow | `NULL` / configured fallback default | Entry node must resolve; fallback must be validated against supported flow behavior | Owner/onboarding employee | Yes | Required for active flow | Partial: fields exist, flow-node validation is a related implementation concern |
| Appointment reminder automation | Existing `appointments.reminder_sent_at` plus automations/flows | Timestamp/configuration | Recommended | `NULL` / inactive automation | Needs an explicit trigger, timing, approved template, consent and idempotency plan | Owner/onboarding employee/system | Yes | Recommended | Partial: marker and automation primitives exist; no clinic appointment-reminder configuration model |
| Confirmation automation | Existing `appointments.confirmation_sent_at` plus automations/flows | Timestamp/configuration | Recommended | `NULL` / inactive automation | Needs approved template, consent, trigger and idempotency | Owner/onboarding employee/system | Yes | Recommended | Partial: marker and primitives exist; configuration model missing |

### 4.12 Go-Live / Testing

Go-live is a controlled operational decision. The current schema can record individual configuration and message-provider states, but cannot persist a formal onboarding checklist, approval, test evidence, or block reason.

| Logical field/check | Current table / column | Type | R/O | Default | Validation / allowed values | Entered by | Template source | Go-live | Schema support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Clinic profile complete | Derived from `clinic_profiles` | Derived check | Required | Incomplete until evaluated | Require name and confirmed timezone; adopt product rules for other recommended fields | System/onboarding employee | Checklist template | Yes | Partial: fields exist; checklist state missing |
| At least one active doctor | `clinic_doctors.is_active` | Derived check | Required for doctor-based booking | None | At least one active doctor when appointment offering is enabled | System/onboarding employee | Checklist template | Yes if booking enabled | Supported data; enforcement/checklist missing |
| Active service catalog | `clinic_services.is_active` | Derived check | Required for service-based booking | None | At least one active service when booking is enabled | System/onboarding employee | Checklist template | Yes if booking enabled | Supported data; enforcement/checklist missing |
| Valid active schedule | `doctor_schedules.is_active` | Derived check | Required for automated booking | None | At least one valid schedule for each bookable doctor; no overlap/exception validation exists | System/onboarding employee | Checklist template | Yes if booking enabled | Partial |
| Booking rules approved | **MISSING FROM CURRENT SCHEMA** | Checklist/rules reference | Required for public booking | None | Required when booking is exposed beyond staff | Owner/onboarding employee | Yes | Yes if booking enabled | MISSING FROM CURRENT SCHEMA |
| WhatsApp connected | `whatsapp_config.status`, connection/registration fields | Derived check | Required only for WhatsApp launch | `disconnected` initially | Must be connected and provider setup diagnostics successful | System/onboarding employee | Checklist template | Yes for WhatsApp go-live | Supported |
| Required templates approved | `message_templates.status` | Derived check | Required for each outbound template use case | `DRAFT` initially | Required templates must be `APPROVED`; no sending based on rejected/paused/disabled template | System/onboarding employee | Master template checklist | Yes for corresponding outbound communications | Supported data; checklist missing |
| Automation/flow test result | **MISSING FROM CURRENT SCHEMA** | Test evidence/checklist | Recommended | None | Test with non-production recipients/data and record outcome | System/onboarding employee | Checklist template | Recommended | MISSING FROM CURRENT SCHEMA |
| Tenant/RLS verification | Existing automated integration test, not onboarding table data | Test result | Required before release, not each clinic setup | N/A | Maintain account isolation tests; do not use a service-role bypass for assertions | System/engineering | No | Yes for release process | Supported by test harness; no per-clinic record |
| Go-live approval/time | **MISSING FROM CURRENT SCHEMA** | User reference/timestamp | Required for controlled launch | None | Requires authorized approver, timestamp and audit history | Owner/onboarding employee/system | No | Yes | MISSING FROM CURRENT SCHEMA |
| Block reason | **MISSING FROM CURRENT SCHEMA** | Text/code | Required only while blocked | None | Controlled blocker categories plus resolution note recommended | System/onboarding employee | Checklist template | Yes if blocked | MISSING FROM CURRENT SCHEMA |

## 5. Required versus optional information

### Required to establish a clinic account

- Account ID, account name, authenticated owner, and owner membership.
- One `clinic_profiles` row with clinic name and confirmed timezone.

### Required before enabling automated appointment booking

- `clinic_profiles.booking_enabled` intentionally set to `true` only after readiness review.
- At least one active doctor, active service, and valid recurring doctor schedule.
- A product decision and implementation for missing availability/conflict prevention and booking-rule capabilities. The current schema alone cannot safely enforce public automated booking rules.

### Required before WhatsApp launch

- A connected, account-owned `whatsapp_config` with successful provider registration/subscription diagnostics as applicable.
- Approved templates for every proactive message use case.
- An approved consent/eligibility approach; dedicated consent data is currently missing.
- Tested message delivery, inbound routing, and failure handling.

### Optional or recommended information

- Clinic type, public contact information, address/city, doctor qualifications/contact details/bio, service description/price, patient demographic information, and patient administrative notes.
- Appointment cancellation and rescheduling policy, buffer times, and capacity rules are product-recommended; they need future schema/application support before they can be enforced.

## 6. Template-derived and system-generated data

### Master-template model assessment

The current schema does **not** support a governed master-clinic template, cloning workflow, source-template version, or per-account customization/audit trail. Existing `message_templates`, `automations`, `flows`, service rows, schedule rows, and clinic profile defaults can be copied only by future application logic; there is no database-level template abstraction today.

Proposed future lifecycle:

```text
MASTER CLINIC TEMPLATE
        ↓ clone selected configuration
NEW CLINIC ACCOUNT
        ↓ account-scoped copies
CUSTOMIZE AND VALIDATE
        ↓ controlled readiness approval
GO LIVE
```

Template candidates are clinic-profile defaults, service catalogue seeds, schedule patterns, approved-message content patterns, automation definitions, flow definitions, and go-live checklist definitions. Template content must never supply real clinic credentials, owner identities, or patient data.

### System-generated data

- UUID primary keys and `created_at` / `updated_at` timestamps.
- Tenant `account_id` assignment from the selected/current account, never from arbitrary client input.
- Provider-issued Meta IDs, connection timestamps, registration timestamps, template approval/status, quality, and submission diagnostics.
- Automation execution counters/timestamps and appointment communication timestamps.
- Derived readiness checks and any future state transition audit records.

## 7. Validation rules and operational constraints

In addition to the table-level checks described above, implementation should enforce these rules before writing onboarding UI/API code:

- Validate IANA timezones and consistently interpret schedule/appointment times using `clinic_profiles.timezone`.
- Normalize and validate public phone numbers and contact mobile numbers. Preserve the current generated normalized contact-phone behavior and account-scoped duplicate rule.
- Validate email addresses in the application until the schema deliberately adds a domain/type constraint.
- Reject overlapping recurring schedules for the same doctor/day and define exception/holiday precedence.
- Before a booking is accepted, verify active clinic, doctor, service, schedule, allowed booking window, buffers, capacity, and conflicts transactionally. Current database checks do not perform this work.
- Validate JSONB by a documented, versioned contract before depending on `working_days`, automation trigger configuration, flow configuration, fallback policy, buttons, or template sample values.
- Allow only approved WhatsApp templates for provider-backed outbound messages and do not send to contacts without the applicable consent/eligibility basis.
- Keep patient notes administrative. This specification intentionally adds no clinical/medical data model.

## 8. Onboarding state model

No current table or field persists the following state. It is a proposed future account-scoped workflow model, not a currently enforceable schema feature.

| State | Meaning | Typical entry condition | Typical exit condition |
| --- | --- | --- | --- |
| `LEAD` | Prospective clinic, not yet provisioned | Commercial/onboarding record created | Account creation approved |
| `REGISTERED` | Tenant/account and owner created | Account/owner established | Clinic profile completed |
| `PROFILE_COMPLETE` | Clinic identity and timezone confirmed | Required clinic profile fields present | Doctors configured, or mark blocked |
| `DOCTORS_CONFIGURED` | Required doctor records prepared | At least one suitable doctor exists | Services configured |
| `SERVICES_CONFIGURED` | Service catalogue prepared | At least one active relevant service exists | Schedules configured |
| `SCHEDULE_CONFIGURED` | Recurring schedules prepared | Required doctor schedules complete and validated | Patients imported or WhatsApp setup begins |
| `PATIENTS_IMPORTED` | Initial contacts/patients reviewed | Import/review completed, if applicable | WhatsApp or automation configuration |
| `WHATSAPP_CONNECTED` | Meta number/provider setup confirmed | `whatsapp_config` operational | Automations/templates configured |
| `AUTOMATIONS_CONFIGURED` | Required flows and automations tested | Required configs active only after tests | Testing |
| `TESTING` | End-to-end operational checks in progress | Test plan started | All required checks pass |
| `READY` | Approval pending or granted, launch conditions met | Checklist passes | Go-live action |
| `LIVE` | Clinic is operating in intended channels | Authorized go-live recorded | May return to `BLOCKED` if a critical incident occurs |
| `BLOCKED` | Progress cannot continue | A required dependency/check fails | Block is resolved and state returns to the appropriate prior step |

Future design requirements for this state model: an account-scoped onboarding entity, transition timestamp, actor, optional assigned onboarding employee, block reason/resolution, immutable audit history, and authorization limited to appropriate account roles/internal operational roles. The model must not allow a cross-account state reference.

## 9. WhatsApp requirements

The current WhatsApp configuration, templates, webhooks, conversations, flows, and automations establish a strong base for clinic messaging. A clinic onboarding workflow should:

1. Connect exactly the selected clinic account's Meta sender number and verify the stored account-scoped configuration is connected.
2. Keep access and verification tokens secret; never place them in templates, logs, or general onboarding exports.
3. Submit/synchronize account-specific templates and wait for required Meta approval before enabling proactive use cases.
4. Match patient preferred language with supported template languages where an automated message is sent.
5. Test inbound webhook handling, contact/conversation resolution, outbound webhook destinations, provider error handling, and opt-out/consent behavior.
6. Introduce a future contact-level consent/eligibility model before representing consent-sensitive outbound messaging as fully supported.

## 10. Automation requirements

Automations and flows should remain disabled by default until their triggers, content, tenant scope, and failure paths are tested. Templates may seed names, trigger configurations, fallback policies, and content patterns, but each clone must be reviewed in the target account.

Appointment confirmations and reminders are only partially supported today: `appointments` can record `confirmation_sent_at` and `reminder_sent_at`, while automations/flows offer general workflow primitives. A future implementation needs explicit appointment event triggers, timing rules in the clinic timezone, idempotency, template selection, consent checks, retry/failure behavior, and a way to prevent duplicate sends.

## 11. Security and tenancy requirements

- Every clinic entity and configuration must be created and queried in its own `account_id` scope.
- Continue relying on the existing `public.is_account_member(account_id)` RLS model and roles: `owner`, `admin`, `agent`, `viewer`. Do not create a parallel tenancy or authentication mechanism.
- Preserve composite foreign keys for account-scoped relationships; in particular, patient profiles must continue to reference contacts by `(account_id, contact_id)`.
- The authenticated client and publishable/anon key remain the appropriate path for tenant-security assertions. Do not use service-role credentials to assert RLS isolation.
- Any future template-clone implementation must assign new account-owned IDs and `account_id` values, and must never copy user sessions, provider secrets, contacts, patients, conversations, or other tenant data across accounts.
- Future onboarding state/checklist tables, if added, must be account-scoped and carry equivalent RLS/grant review before use.

## 12. Missing capabilities and future migration candidates

No migration is proposed or created in this phase. The following are candidates to design, review, and migrate only in a later phase:

1. An account-scoped clinic-onboarding state/checklist/audit model, including blockers and go-live approvals.
2. Structured clinic operating hours, breaks, holidays, and schedule exceptions/leave.
3. Appointment-rules configuration: same-day cutoff, advance booking window, cancellation/reschedule policy, buffers, capacity, and supported booking sources.
4. Transaction-safe appointment availability/conflict prevention, including doctor schedule compatibility and overlap prevention.
5. Contact address and WhatsApp consent/eligibility/audit fields, designed with data minimization and retention requirements.
6. A governed master-template/version/clone model for clinic profile defaults, services, schedules, WhatsApp template patterns, automations, flows, and checklists.
7. Structured validation vocabularies where product requires them (clinic type, specialization, patient language/gender, appointment source, automation trigger definitions), rather than unconstrained text/JSONB.
8. Go-live test evidence/approval records and explicit operational audit trails.

## 13. Recommended implementation order

1. Agree product/legal decisions: target jurisdictions, required registration data, consent policy, supported languages, booking rules, and who can approve go-live.
2. Design the missing account-scoped onboarding state/checklist model and structured operating-hours/booking-rules model; review tenant/RLS implications before any migration.
3. Design availability, exceptions, conflict prevention, and appointment lifecycle behavior before exposing automated booking.
4. Define template governance (source, version, cloning, customization, approval, rollback) without copying cross-account data or secrets.
5. Build owner/onboarding-employee UI and APIs against the approved schema, validating all structured JSON and controlled vocabularies.
6. Implement WhatsApp setup, provider-template approval handling, consent handling, and automation/flow test workflows using account-scoped records.
7. Add go-live checklist/approval, test evidence, and operational monitoring.
8. Extend authenticated local integration tests for every new account-scoped table/relationship; stop and investigate any RLS isolation failure rather than weakening RLS.

## 14. Go-live decision summary

A clinic is ready to move to `LIVE` only when the required elements for its enabled channels are validated: tenant/owner, clinic profile/timezone, booking readiness if bookings are enabled, provider/template readiness if WhatsApp is enabled, successful end-to-end tests, and an authorized approval. Current schema records several prerequisites but does not yet persist the complete decision, state history, or missing booking/consent rules. Those gaps must be addressed in a later reviewed phase before the corresponding functionality is represented as enforced.
