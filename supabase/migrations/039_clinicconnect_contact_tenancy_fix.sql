-- ============================================================
-- 039_clinicconnect_contact_tenancy_fix.sql
--
-- Bind patient profiles to contacts within the same account.
-- ============================================================

-- PostgreSQL requires a unique referenced key for the composite
-- patient_profiles(account_id, contact_id) foreign key.
CREATE UNIQUE INDEX idx_contacts_account_id_id_unique
  ON public.contacts(account_id, id);

-- Replace the unscoped contact reference created by migration 038.
ALTER TABLE public.patient_profiles
  DROP CONSTRAINT patient_profiles_contact_id_fkey;

ALTER TABLE public.patient_profiles
  ADD CONSTRAINT patient_profiles_account_id_contact_id_fkey
  FOREIGN KEY (account_id, contact_id)
  REFERENCES public.contacts(account_id, id)
  ON DELETE CASCADE;
