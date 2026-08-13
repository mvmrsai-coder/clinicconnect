-- ============================================================
-- 038_clinicconnect_foundation.sql
--
-- ClinicConnect foundation for the existing account-scoped wacrm
-- architecture. These tables extend wacrm; they do not introduce a
-- second CRM or a separate tenancy model. Existing public.contacts
-- remains the WhatsApp/CRM identity for every patient.
--
-- Account tenancy is enforced through public.is_account_member().
-- Composite foreign keys bind child records to their account so a
-- clinic record cannot reference another account's clinic data.
-- ============================================================

-- ============================================================
-- CLINIC PROFILE
--
-- One ClinicConnect configuration row per existing wacrm account.
-- ============================================================
SET search_path = public, extensions;

CREATE TABLE IF NOT EXISTS public.clinic_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  clinic_name TEXT NOT NULL,
  clinic_type TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  working_days JSONB,
  booking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clinic_profiles_account_id_key UNIQUE (account_id)
);

-- ============================================================
-- DOCTORS AND SERVICES
--
-- The (account_id, id) keys below are intentionally redundant with
-- each table's primary key: they are the parent keys for account-bound
-- composite foreign keys in schedules and appointments.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clinic_doctors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialization TEXT,
  qualification TEXT,
  display_name TEXT,
  phone TEXT,
  email TEXT,
  bio TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clinic_doctors_account_id_id_key UNIQUE (account_id, id)
);

CREATE TABLE IF NOT EXISTS public.clinic_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  price NUMERIC(12,2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clinic_services_duration_minutes_check CHECK (duration_minutes > 0),
  CONSTRAINT clinic_services_price_check CHECK (price IS NULL OR price >= 0),
  CONSTRAINT clinic_services_account_id_name_key UNIQUE (account_id, name),
  CONSTRAINT clinic_services_account_id_id_key UNIQUE (account_id, id)
);

-- ============================================================
-- RECURRING DOCTOR AVAILABILITY
--
-- The composite foreign key prevents an account from attaching a
-- schedule to a doctor owned by another account.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.doctor_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL,
  -- 0 = Sunday through 6 = Saturday.
  day_of_week SMALLINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT doctor_schedules_day_of_week_check CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT doctor_schedules_time_range_check CHECK (start_time < end_time),
  CONSTRAINT doctor_schedules_slot_duration_minutes_check CHECK (slot_duration_minutes > 0),
  CONSTRAINT doctor_schedules_account_id_doctor_id_fkey
    FOREIGN KEY (account_id, doctor_id)
    REFERENCES public.clinic_doctors(account_id, id)
);

-- ============================================================
-- PATIENT EXTENSION OF EXISTING WACRM CONTACTS
--
-- contacts.id is the existing CRM identity. Contacts cannot be
-- modified by this migration, so the account match is enforced by the
-- scoped trigger below in addition to the normal contact foreign key.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.patient_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  date_of_birth DATE,
  gender TEXT,
  preferred_language TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_profiles_account_id_contact_id_key UNIQUE (account_id, contact_id),
  CONSTRAINT patient_profiles_account_id_id_key UNIQUE (account_id, id)
);

CREATE OR REPLACE FUNCTION public.validate_patient_profile_contact_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  contact_account_id UUID;
BEGIN
  SELECT c.account_id
    INTO contact_account_id
    FROM public.contacts AS c
   WHERE c.id = NEW.contact_id;

  IF NOT FOUND OR contact_account_id IS DISTINCT FROM NEW.account_id THEN
    RAISE EXCEPTION 'patient_profiles.contact_id must belong to patient_profiles.account_id'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_patient_profile_contact_account ON public.patient_profiles;
CREATE TRIGGER validate_patient_profile_contact_account
  BEFORE INSERT OR UPDATE OF account_id, contact_id ON public.patient_profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_patient_profile_contact_account();

-- ============================================================
-- APPOINTMENTS
--
-- Each composite foreign key includes account_id. This makes an
-- appointment unable to point at another account's patient, doctor,
-- or service, even when IDs are supplied directly to the database.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  patient_profile_id UUID NOT NULL,
  doctor_id UUID NOT NULL,
  service_id UUID NOT NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT,
  notes TEXT,
  confirmation_sent_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appointments_time_range_check CHECK (start_time < end_time),
  CONSTRAINT appointments_status_check
    CHECK (status IN ('pending', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show')),
  CONSTRAINT appointments_account_id_patient_profile_id_fkey
    FOREIGN KEY (account_id, patient_profile_id)
    REFERENCES public.patient_profiles(account_id, id),
  CONSTRAINT appointments_account_id_doctor_id_fkey
    FOREIGN KEY (account_id, doctor_id)
    REFERENCES public.clinic_doctors(account_id, id),
  CONSTRAINT appointments_account_id_service_id_fkey
    FOREIGN KEY (account_id, service_id)
    REFERENCES public.clinic_services(account_id, id)
);

-- ============================================================
-- MVP LOOKUP INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_clinic_doctors_account
  ON public.clinic_doctors(account_id);
CREATE INDEX IF NOT EXISTS idx_clinic_doctors_account_active
  ON public.clinic_doctors(account_id, is_active);

CREATE INDEX IF NOT EXISTS idx_clinic_services_account
  ON public.clinic_services(account_id);
CREATE INDEX IF NOT EXISTS idx_clinic_services_account_active
  ON public.clinic_services(account_id, is_active);

CREATE INDEX IF NOT EXISTS idx_doctor_schedules_account
  ON public.doctor_schedules(account_id);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_account_doctor_day_active
  ON public.doctor_schedules(account_id, doctor_id, day_of_week, is_active);

CREATE INDEX IF NOT EXISTS idx_patient_profiles_account
  ON public.patient_profiles(account_id);

CREATE INDEX IF NOT EXISTS idx_appointments_account
  ON public.appointments(account_id);
CREATE INDEX IF NOT EXISTS idx_appointments_account_date
  ON public.appointments(account_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_account_doctor_date
  ON public.appointments(account_id, doctor_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_account_patient
  ON public.appointments(account_id, patient_profile_id);
CREATE INDEX IF NOT EXISTS idx_appointments_account_status
  ON public.appointments(account_id, status);

-- ============================================================
-- ACCOUNT-SCOPED RLS
--
-- Settings-class clinic configuration (profile, doctors, services,
-- schedules) is writable by admin+. Patient and appointment records
-- are operational data and follow wacrm contacts/conversations with
-- agent+ writes. Any account member (viewer+) may read.
-- ============================================================
ALTER TABLE public.clinic_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_profiles_select ON public.clinic_profiles;
DROP POLICY IF EXISTS clinic_profiles_insert ON public.clinic_profiles;
DROP POLICY IF EXISTS clinic_profiles_update ON public.clinic_profiles;
DROP POLICY IF EXISTS clinic_profiles_delete ON public.clinic_profiles;
CREATE POLICY clinic_profiles_select ON public.clinic_profiles FOR SELECT
  USING (public.is_account_member(account_id));
CREATE POLICY clinic_profiles_insert ON public.clinic_profiles FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin'));
CREATE POLICY clinic_profiles_update ON public.clinic_profiles FOR UPDATE
  USING (public.is_account_member(account_id, 'admin'));
CREATE POLICY clinic_profiles_delete ON public.clinic_profiles FOR DELETE
  USING (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS clinic_doctors_select ON public.clinic_doctors;
DROP POLICY IF EXISTS clinic_doctors_insert ON public.clinic_doctors;
DROP POLICY IF EXISTS clinic_doctors_update ON public.clinic_doctors;
DROP POLICY IF EXISTS clinic_doctors_delete ON public.clinic_doctors;
CREATE POLICY clinic_doctors_select ON public.clinic_doctors FOR SELECT
  USING (public.is_account_member(account_id));
CREATE POLICY clinic_doctors_insert ON public.clinic_doctors FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin'));
CREATE POLICY clinic_doctors_update ON public.clinic_doctors FOR UPDATE
  USING (public.is_account_member(account_id, 'admin'));
CREATE POLICY clinic_doctors_delete ON public.clinic_doctors FOR DELETE
  USING (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS clinic_services_select ON public.clinic_services;
DROP POLICY IF EXISTS clinic_services_insert ON public.clinic_services;
DROP POLICY IF EXISTS clinic_services_update ON public.clinic_services;
DROP POLICY IF EXISTS clinic_services_delete ON public.clinic_services;
CREATE POLICY clinic_services_select ON public.clinic_services FOR SELECT
  USING (public.is_account_member(account_id));
CREATE POLICY clinic_services_insert ON public.clinic_services FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin'));
CREATE POLICY clinic_services_update ON public.clinic_services FOR UPDATE
  USING (public.is_account_member(account_id, 'admin'));
CREATE POLICY clinic_services_delete ON public.clinic_services FOR DELETE
  USING (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS doctor_schedules_select ON public.doctor_schedules;
DROP POLICY IF EXISTS doctor_schedules_insert ON public.doctor_schedules;
DROP POLICY IF EXISTS doctor_schedules_update ON public.doctor_schedules;
DROP POLICY IF EXISTS doctor_schedules_delete ON public.doctor_schedules;
CREATE POLICY doctor_schedules_select ON public.doctor_schedules FOR SELECT
  USING (public.is_account_member(account_id));
CREATE POLICY doctor_schedules_insert ON public.doctor_schedules FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin'));
CREATE POLICY doctor_schedules_update ON public.doctor_schedules FOR UPDATE
  USING (public.is_account_member(account_id, 'admin'));
CREATE POLICY doctor_schedules_delete ON public.doctor_schedules FOR DELETE
  USING (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS patient_profiles_select ON public.patient_profiles;
DROP POLICY IF EXISTS patient_profiles_insert ON public.patient_profiles;
DROP POLICY IF EXISTS patient_profiles_update ON public.patient_profiles;
DROP POLICY IF EXISTS patient_profiles_delete ON public.patient_profiles;
CREATE POLICY patient_profiles_select ON public.patient_profiles FOR SELECT
  USING (public.is_account_member(account_id));
CREATE POLICY patient_profiles_insert ON public.patient_profiles FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent'));
CREATE POLICY patient_profiles_update ON public.patient_profiles FOR UPDATE
  USING (public.is_account_member(account_id, 'agent'));
CREATE POLICY patient_profiles_delete ON public.patient_profiles FOR DELETE
  USING (public.is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS appointments_select ON public.appointments;
DROP POLICY IF EXISTS appointments_insert ON public.appointments;
DROP POLICY IF EXISTS appointments_update ON public.appointments;
DROP POLICY IF EXISTS appointments_delete ON public.appointments;
CREATE POLICY appointments_select ON public.appointments FOR SELECT
  USING (public.is_account_member(account_id));
CREATE POLICY appointments_insert ON public.appointments FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent'));
CREATE POLICY appointments_update ON public.appointments FOR UPDATE
  USING (public.is_account_member(account_id, 'agent'));
CREATE POLICY appointments_delete ON public.appointments FOR DELETE
  USING (public.is_account_member(account_id, 'agent'));

-- Reuse wacrm's standard updated_at function; do not create another
-- generic timestamp-maintenance function.
DROP TRIGGER IF EXISTS set_updated_at ON public.clinic_profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.clinic_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.clinic_doctors;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.clinic_doctors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.clinic_services;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.clinic_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.doctor_schedules;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.doctor_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.patient_profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.patient_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.appointments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
