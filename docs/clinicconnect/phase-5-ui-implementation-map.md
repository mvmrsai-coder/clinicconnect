# Phase 5: ClinicConnect Operational UI Implementation Map

## 1. Current application architecture

The application is a Next.js App Router application with client-rendered dashboard pages under `src/app/(dashboard)`, cookie-based Supabase SSR support, and a shared authenticated dashboard shell. The root layout supplies Next Intl, theme state, Tailwind-based styling, and the shared Sonner toaster. The dashboard shell mounts `AuthProvider`, sidebar, header, account-context alert, and presence heartbeat.

ClinicConnect presently has a database foundation and an onboarding service/API, but no dashboard page, navigation item, UI component, or CRUD API route for clinic configuration, doctors, services, schedules, patients, or appointments.

The existing onboarding endpoints are:

- `GET /api/clinicconnect/onboarding` for the authenticated account's derived snapshot.
- `POST /api/clinicconnect/onboarding/status` for an admin-or-owner state transition.

The service derives account context server-side through `getCurrentAccount()`; it does not accept an account identifier from the client.

### Audit basis

This map was checked against the current App Router tree, dashboard shell,
auth/session helpers, shared components, API handlers, ClinicConnect service
and tests, `vitest.config.ts`, the local migration history through 045, and the
live local columns for `clinic_profiles`, `clinic_doctors`,
`clinic_services`, `doctor_schedules`, `patient_profiles`, `appointments`,
and `whatsapp_consent_events`. No application, migration, policy, grant, or
production file was changed for this audit.

## 2. Existing reusable UI components

The existing component library is sufficient for a focused operational MVP:

| Existing asset | Reuse in ClinicConnect |
| --- | --- |
| `components/ui/{button,input,label,textarea,select,switch}` | Clinic, doctor, service, schedule, patient, and appointment forms. |
| `components/ui/table`, checkbox, dropdown menu | Doctor/service/patient/appointment list tables, bulk actions only where product rules justify them. |
| `components/ui/dialog`, sheet, alert, popover, tabs, accordion | Create/edit dialogs, mobile detail views, confirmations, readiness explanations, and schedule editors. |
| `components/ui/gated-button.tsx` | Consistent disabled-with-reason mutations for viewer and under-privileged roles. |
| `components/dashboard/empty-state.tsx`, skeleton components | Empty lists, no appointment results, and loading placeholders. |
| `components/contacts/contact-form.tsx`, `contact-detail-view.tsx`, `import-modal.tsx` | Starting pattern for patient/contact association, patient details, CSV import UX, validation, duplicate handling, and toast feedback. They should be adapted, not coupled directly to clinical fields. |
| `components/settings/*` and settings rail | The clinic configuration information architecture: grouped sections, deep-linkable query tabs, responsive rail, cards, and form state patterns. |
| `components/settings/whatsapp-config.tsx` | WhatsApp readiness/status presentation and actionable diagnostic layout. Reuse its UI patterns, not its credential fields. |
| `components/dashboard/{metric-card,quick-actions}` | A compact ClinicConnect landing/onboarding summary. |

No calendar component, date-picker dependency, data-grid abstraction, or ClinicConnect-specific form/type module currently exists. Initial appointment views should use native date/time controls and a simple day list; a calendar library should be evaluated only after the workflow is proven.

## 3. Existing reusable API/server utilities

- `lib/supabase/server.ts`: creates a request-cookie-aware Supabase client for route handlers and server code.
- `lib/auth/account.ts`: `getCurrentAccount()`, `requireRole()`, typed `UnauthorizedError`/`ForbiddenError`, and `toErrorResponse()`.
- `lib/auth/roles.ts`: shared owner/admin/agent/viewer hierarchy and capability predicates.
- `lib/clinicconnect/onboarding.ts` and `onboarding-types.ts`: canonical snapshot derivation, allowed state transitions, and typed onboarding errors.
- Existing route-handler conventions: structured JSON responses, input validation, `requireRole()` on protected mutations, and explicit error mapping. The account route is the closest safe pattern.
- Existing client-side API conventions: `fetch()` to same-origin route handlers, loading state, response checking, and Sonner success/error feedback.

Some older application routes use direct browser Supabase CRUD and sometimes include an account ID obtained from `useAuth`. That is reusable as a UI/data-fetching reference, but it is not the preferred ClinicConnect mutation boundary because the browser must not select the authorized tenant.

## 4. Existing authentication/session architecture

The browser uses the singleton `createBrowserClient()` in `lib/supabase/client.ts`. `AuthProvider` calls `auth.getSession()`, subscribes to auth changes, and loads the signed-in user's profile and account summary. Middleware refreshes Supabase cookies and redirects unauthenticated visitors from dashboard paths.

For ClinicConnect pages, the dashboard shell already requires an authenticated user. For ClinicConnect API calls, browser `fetch()` must rely on the same session cookies; route handlers then use `createServerClient()` and `auth.getUser()` through `getCurrentAccount()` or `requireRole()`.

The browser may display the current account name and role, but it must not supply an authoritative `account_id` in URLs, request bodies, hidden fields, or local state for ClinicConnect writes.

## 5. Existing role/permission architecture

The four account roles are `owner`, `admin`, `agent`, and `viewer`.

- `RequireRole` and `useCan` provide fail-closed client visibility/gating while the profile is loading.
- `getCurrentAccount()` and `requireRole()` are the server enforcement mechanism.
- RLS remains the final database enforcement mechanism.

Recommended MVP role mapping mirrors current ClinicConnect RLS:

| Surface | Read | Mutate |
| --- | --- | --- |
| Clinic profile, doctors, services, recurring schedules, onboarding state | Any member | Admin+ |
| Patients and appointments | Any member | Agent+ |
| WhatsApp readiness display | Any member | Reuse existing WhatsApp configuration permissions; ClinicConnect should not expose credentials. |

Owner inherits admin capabilities. Client-side hiding or disabled controls improves clarity; it is never authorization.

## 6. Existing ClinicConnect-related routes

Only API routes exist today:

- `api/clinicconnect/onboarding/route.ts`
- `api/clinicconnect/onboarding/status/route.ts`

There are no pages under `src/app/(dashboard)/clinicconnect`, no ClinicConnect sidebar entry, and no API routes for its six operational tables. The onboarding API is already suitable for a read-only snapshot and explicit status-transition controls.

## 7. Existing WACRM routes/components that can be reused

- `/contacts`: list, search, tags, modal create/edit, duplicate-phone feedback, imports, and detail presentation.
- `/settings?tab=whatsapp`: configuration/readiness presentation, error explanation, and setup instructions.
- `/settings`: deep-linkable section pattern and responsive left rail.
- `/automations`, `/flows`, `/broadcasts`: existing route-handler plus client `fetch()` patterns for protected operational tools.
- `/dashboard`: metrics, skeletons, empty state, and quick-action patterns.
- `/inbox`: contact-oriented operational context; later patient details can link to an existing contact conversation without duplicating messaging UI.

## 8. Current gaps

1. No ClinicConnect dashboard routes, navigation, page titles, or translation keys.
2. No operational CRUD boundary for clinic profile, doctors, services, schedules, patient profiles, or appointments.
3. No shared ClinicConnect TypeScript data/input models outside the onboarding types.
4. No appointment calendar, availability calculation, schedule-overlap configuration guard, public booking flow, or appointment form.
5. No patient extension UI connecting `contacts` to `patient_profiles`.
6. No consent-event UI, despite the append-oriented `whatsapp_consent_events` schema.
7. No system-wide route-level `loading.tsx` or `error.tsx` boundaries for this future area; current pages mostly manage local loading/error state.
8. `clinic_profiles.working_days` is unstructured JSONB. It must not become the authoritative clinic-hours editor without a separately agreed JSON contract or schema change.

## 9. Proposed Phase 5 route structure

Use one grouped dashboard area:

```text
/clinicconnect                         ClinicConnect home / onboarding
/clinicconnect/profile                 Clinic identity and booking toggle
/clinicconnect/doctors                 Doctors list and create/edit dialog
/clinicconnect/services                Services list and create/edit dialog
/clinicconnect/schedules               Recurring doctor schedules
/clinicconnect/patients                Patient-enabled contacts list
/clinicconnect/patients/[contactId]    Patient/contact detail
/clinicconnect/appointments            Day-oriented appointment list
/clinicconnect/appointments/new        Appointment form (or dialog route)
/clinicconnect/whatsapp                Readiness and consent summary
```

The route group should remain inside `(dashboard)` so it receives the existing session shell. The first release can use list pages with dialogs instead of a nested settings rail everywhere. `profile`, `doctors`, `services`, and `schedules` can additionally be reachable from onboarding step CTAs.

## 10. Proposed navigation structure

Add one `ClinicConnect` sidebar entry after Contacts or before Automations. Its landing page should show onboarding progress, not a second generic dashboard.

Within the area, use a compact local navigation with:

- Overview
- Configure: Profile, Doctors, Services, Schedules
- Operate: Patients, Appointments
- Readiness: WhatsApp

Onboarding CTAs should link to these canonical routes. Do not create duplicate configuration screens embedded solely in the onboarding page.

## 11. Proposed page/component hierarchy

```text
ClinicConnectLayout (dashboard shell is inherited)
  ClinicConnectHomePage
    OnboardingSummaryCard
    OnboardingChecklist
    ReadinessActions
  ClinicProfilePage -> ClinicProfileForm
  DoctorsPage -> DoctorsTable + DoctorDialog
  ServicesPage -> ServicesTable + ServiceDialog
  SchedulesPage -> DoctorScheduleGrid + ScheduleDialog
  PatientsPage -> PatientContactsTable + PatientProfileDialog
  PatientDetailPage -> Existing contact context + PatientProfilePanel + ConsentTimeline
  AppointmentsPage -> AppointmentFilters + DayList + AppointmentDialog
  WhatsAppReadinessPage -> ReadinessCards + ConsentSummary + links to existing settings
```

Use a feature-local `components/clinicconnect` folder and feature-local request/type modules in a later implementation phase; avoid placing clinical UI in the generic component directory.

## 12. Clinic onboarding UI flow

The home page calls only `GET /api/clinicconnect/onboarding`. It renders the API's derived steps, counts, progress, `nextStep`, and state-transition capabilities.

1. Show a profile-required checklist item first.
2. If booking is enabled, direct the user to doctors, services, and schedules until all required items are complete.
3. Show patients, WhatsApp, automations, and operator testing as optional/readiness items exactly as returned by the snapshot.
4. Present `TESTING`, `READY`, and `LIVE` transition controls only when the snapshot permits them and the user is admin+.
5. Send only `{ status }` to the existing status endpoint; never send an account ID or client-calculated readiness result.

The server derives the account from session cookies, then its authenticated Supabase client is constrained by RLS/account membership.

## 13. Clinic profile UI

Implement an admin-gated form for the existing fields: clinic name, type, phone, email, address, city, timezone, and booking enabled. It should show an empty state with a create action when the account has no `clinic_profiles` row.

The form must not accept `account_id`. A future server route derives it with `requireRole('admin')` and inserts/updates the single account-scoped profile. Use `working_days` only as read-only legacy data or omit it from the initial editor because no canonical JSON contract exists.

## 14. Doctor management UI

Use a searchable table with active/inactive status and create/edit dialog for the current columns: name, specialization, qualification, display name, phone, email, bio, and active flag. Inactivation should be the default operational alternative to deletion when appointments exist.

Admin+ controls should be gated in the browser and rechecked server-side. The future route derives account scope and applies it to every query; RLS independently restricts the resulting database operation.

## 15. Service management UI

Use the same table/dialog pattern. Fields: name, description, duration minutes, price, and active state. Validate non-empty name, positive integer duration, and non-negative price before sending a request; surface uniqueness conflicts for `(account_id, name)` clearly.

Admin+ writes are server-derived and RLS-scoped. Service duration may be displayed in appointment UI, but should not claim to enforce appointment duration because the current schema does not bind them.

## 16. Schedule management UI

Use a doctor selector plus a weekly list/grid of recurring rows: weekday, start time, end time, slot duration, and active state. Start with native time controls and a weekday select. Provide a clear empty state for doctors without schedules; the onboarding snapshot already reports missing active-doctor schedule IDs.

Admin+ routes must derive the account and validate the selected doctor within that server-derived account. The composite foreign key and RLS remain the database backstop. The UI should warn about overlapping recurring rows, but it must not imply that the database currently prevents schedule-row overlap. Holidays, leave, and exceptions are deferred pending a future model.

## 17. Patient/contact UI

`contacts` remains the primary CRM identity. Reuse Contacts list/detail and add a patient-profile panel rather than copying contacts into a clinical table.

The initial patient workflow is: find or create an account-visible contact, then create or edit the account-scoped `patient_profiles` extension with date of birth, gender, preferred language, and notes. A server route must derive the current account, verify that the selected contact is readable within it, and write the patient extension with that derived account. The existing composite foreign key and RLS prevent cross-account association.

Agent+ can create/edit the extension; viewers see only read-only detail. CSV import can reuse the current contact import experience first; patient-field import should wait for an explicit mapping/error-reporting design.

## 18. Appointment/calendar UI

Begin with a day-oriented operational appointment list, date filter, doctor/status filters, and an agent+ create/edit dialog. It should select an existing patient, doctor, and service, show service duration as guidance, collect date/start/end/status/notes/source, and display a clear conflict message when the database exclusion constraint rejects an active overlap.

The creation route must derive account scope and resolve every selected ID under that account. It must not trust a browser `account_id`, patient account, doctor account, or service account. The database's composite foreign keys, RLS, and `appointments_no_overlapping_active_doctor_time` exclusion constraint remain authoritative.

Do not build a public slot finder or promise schedule coverage in this first UI: current schema lacks an availability engine, exceptions, booking-rule enforcement, and a service-duration binding.

## 19. WhatsApp readiness UI

Reuse the existing WhatsApp configuration panel as the configuration authority at `/settings?tab=whatsapp`; do not duplicate secret/token controls in ClinicConnect.

The ClinicConnect readiness page can fetch onboarding snapshot data and show non-secret indicators: configuration persisted, connection status, registration/connection evidence, and the optional completion state. Link privileged users to the existing settings page for repair.

For consent, add a patient-level event timeline and agent+ append action only after a dedicated server route exists. That route derives account and user IDs from the session; it must never accept `recorded_by_user_id` from the browser. Existing consent RLS requires the event actor to equal `auth.uid()`.

## 20. Onboarding state UI

Persisted states are only `REGISTERED`, `TESTING`, `READY`, `LIVE`, and `BLOCKED`. Checklist completion remains derived, not independently editable.

Show the current state as a badge and state-specific action. Use API-provided `canStartTesting`, `canMarkReady`, and `canGoLive`; never reproduce transition rules solely in the UI. `BLOCKED` requires a clear return-to-configuration action. The current data model has no persisted block reason, so the initial UI should not invent one.

## 21. Role-based visibility/enforcement

Client behavior:

- Use `RequireRole min="admin"` or `useCan('edit-settings')` for configuration/state controls.
- Use `RequireRole min="agent"` or `useCan('send-messages')` for patient/appointment mutations.
- Use `GatedButton` with an explanatory reason rather than silently hiding common operational actions for viewers.

Server behavior:

- Use `getCurrentAccount()` for reads.
- Use `requireRole('admin')` for clinic configuration and onboarding transitions.
- Use `requireRole('agent')` for patient/appointment actions.

All routes use the authenticated SSR Supabase client from that context. RLS remains the final authorization check.

## 22. Loading/error/empty states

Follow current page conventions:

- Per-panel skeletons for independently loaded dashboard/list content.
- Inline saving spinners and disabled duplicate submits in dialogs.
- Sonner toasts for successful writes and concise request failures.
- `Alert` for blocked onboarding, account-context failure, and appointment conflict remediation.
- Reusable empty cards with a single role-gated primary action.
- URL filter state for appointments/patients where it improves shareability, but never include tenant scope.

Add feature-level error/empty components during implementation. Decide separately whether App Router `loading.tsx`/`error.tsx` boundaries should be introduced for the new route segment.

## 23. API boundaries

The existing onboarding API is the model. Add future ClinicConnect route handlers only as needed for UI workflows:

- Clinic profile: authenticated read; admin+ create/update.
- Doctors, services, schedules: authenticated list; admin+ mutations.
- Patient extension and appointments: authenticated list/read; agent+ mutations.
- Consent events: authenticated read; agent+ append-only insert.

Each handler receives input describing the resource only. It derives `accountId`, `userId`, and role from the session via `getCurrentAccount()`/`requireRole()`, constructs database writes itself, validates input, maps database conflicts to safe responses, and returns shaped data. Browser code sends cookies automatically through same-origin `fetch()`; it uses neither service-role credentials nor an account selector.

## 24. RLS/security considerations

Every proposed UI interaction follows this chain:

```text
authenticated browser session
  -> same-origin API route
  -> getCurrentAccount()/requireRole()
  -> request-cookie authenticated Supabase client
  -> account-scoped RLS and composite foreign keys
```

- Do not accept or honor `account_id` query/body parameters for ClinicConnect browser APIs.
- Do not use a service-role client for dashboard ClinicConnect workflows.
- Preserve table-level grants as narrowly as existing migrations 040, 044, and 045 establish; grants allow RLS evaluation and are not an authorization substitute.
- Keep error messages free of another account's identifiers or existence details.
- Test own-account success and cross-account invisibility/denial for every new route and mutation.
- Treat `contacts` and patient data as sensitive operational/PII data; avoid adding clinical records beyond the current MVP fields without a separate privacy review.

## 25. Required future migrations, if any

No migration is required to build the configuration/onboarding UI, patient extension UI, or a basic authenticated appointment list/form against the already applied 038-045 schema.

Before public booking or advanced schedule operations, separately review and authorize:

- Schedule exceptions/holidays model.
- Per-clinic booking rules (same-day cutoff, advance window, cancellation/reschedule windows, buffers).
- Appointment reschedule lineage if replacement-history is required.
- A controlled availability validation boundary if appointment writes must guarantee schedule coverage and service-duration compatibility.

No migration should be created as part of the first UI implementation step without a new approved phase.

## 26. Testing strategy

Keep the present Vitest pattern:

- `vitest.config.ts` runs in the Node environment, includes
  `src/**/*.test.ts` and `src/**/*.test.tsx`, enables TypeScript path aliases,
  and clears mocks. Integration tests load local credentials through the test
  environment and explicitly reject remote Supabase URLs or secret/service
  keys.

- Pure unit tests for form validators, duration/time helpers, local view-state reducers, and onboarding presentation mapping.
- Route tests for malformed bodies, 401 unauthenticated requests, role failures, conflict responses, and server-derived account scope.
- Local authenticated two-account integration tests using the anon/publishable key only; verify User A cannot read or mutate User B clinic data.
- Extend the existing onboarding HTTP test only when API behavior changes, preserving its spawned-Next cookie/session transport and local-only guard.
- Add appointment tests for the exclusion-constraint conflict and consent tests for append-only actor/account behavior.

Browser component tests should emphasize role-gated controls, loading/empty/error states, and safe handling of rejected requests. No UI test should use a service-role key.

## 27. Recommended implementation order

1. Add ClinicConnect navigation, landing route, API client/types for the existing onboarding snapshot, and onboarding checklist/status UI.
2. Add clinic profile create/edit flow, then doctor and service CRUD.
3. Add recurring schedule CRUD and connect onboarding CTAs/counts.
4. Add patient extension panels to the reusable Contacts experience.
5. Add a day-list appointment workflow with conflict handling; defer calendar/availability promises.
6. Add non-secret WhatsApp readiness summary and links to existing configuration.
7. Add consent-event history/action UI only with a dedicated session-derived API boundary.
8. Add targeted unit, route, and two-account integration coverage at each slice before proceeding.

This order delivers the smallest useful path: configure a clinic, verify readiness, test, go live, then operate patients and appointments without expanding the schema or weakening the verified tenancy model.
