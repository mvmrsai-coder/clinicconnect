-- ============================================================
-- 043_clinicconnect_onboarding_state.sql
--
-- Store one coarse, account-owned onboarding state on the existing
-- one-to-one clinic profile. Detailed setup milestones remain derived
-- from the profile, doctor, service, schedule, patient, WhatsApp, and
-- automation records rather than duplicated as mutable state.
-- ============================================================

ALTER TABLE public.clinic_profiles
  ADD COLUMN onboarding_status TEXT NOT NULL DEFAULT 'REGISTERED',
  ADD CONSTRAINT clinic_profiles_onboarding_status_check
    CHECK (onboarding_status IN (
      'REGISTERED',
      'TESTING',
      'READY',
      'LIVE',
      'BLOCKED'
    ));
