-- ============================================================
-- 040_clinicconnect_authenticated_privileges.sql
--
-- Allow authenticated application clients to reach ClinicConnect's
-- account-scoped tables. Row-level security remains the authorization
-- boundary for every row and write.
-- ============================================================

-- Each listed table already has account-scoped SELECT, INSERT, UPDATE,
-- and DELETE policies. These table privileges let PostgreSQL evaluate
-- those policies for authenticated Supabase clients.
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.clinic_profiles,
         public.clinic_doctors,
         public.clinic_services,
         public.doctor_schedules,
         public.patient_profiles,
         public.appointments
TO authenticated;

-- Contacts is the existing WACRM identity used by patient_profiles and
-- remains directly managed by authenticated application clients under
-- its existing account-scoped RLS policies.
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.contacts
TO authenticated;
