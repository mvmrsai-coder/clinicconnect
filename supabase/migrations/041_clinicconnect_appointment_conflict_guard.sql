-- ============================================================
-- 041_clinicconnect_appointment_conflict_guard.sql
--
-- Prevent overlapping active appointments for one doctor within one
-- account. Appointments use local appointment_date + time semantics,
-- so the exclusion expression intentionally uses tsrange rather than
-- converting values to timestamptz.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_overlapping_active_doctor_time
  EXCLUDE USING gist (
    account_id WITH =,
    doctor_id WITH =,
    tsrange(
      appointment_date + start_time,
      appointment_date + end_time,
      '[)'
    ) WITH &&
  )
  WHERE (status IN ('pending', 'confirmed', 'rescheduled'));
