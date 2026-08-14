-- ============================================================
-- 047_clinicconnect_appointment_lifecycle.sql
--
-- Phase 6A.2
-- Appointment lifecycle and audit foundation.
--
-- Keep the existing appointment status model:
--   pending
--   confirmed
--   rescheduled
--   cancelled
--   no_show
--   completed
--
-- Operational events such as check-in and consultation start
-- are recorded separately from appointment status.
-- ============================================================


-- ============================================================
-- APPOINTMENT LIFECYCLE METADATA
-- ============================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS consultation_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consultation_started_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_marked_by UUID REFERENCES auth.users(id);


-- ============================================================
-- APPOINTMENT EVENTS
--
-- This is an immutable operational history of important
-- appointment lifecycle actions.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.appointment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES public.accounts(id)
    ON DELETE CASCADE,

  appointment_id UUID NOT NULL
    REFERENCES public.appointments(id)
    ON DELETE CASCADE,

  event_type TEXT NOT NULL
    CHECK (
      event_type IN (
        'booked',
        'confirmed',
        'rescheduled',
        'cancelled',
        'checked_in',
        'consultation_started',
        'completed',
        'no_show'
      )
    ),

  previous_status TEXT
    CHECK (
      previous_status IS NULL
      OR previous_status IN (
        'pending',
        'confirmed',
        'rescheduled',
        'cancelled',
        'no_show',
        'completed'
      )
    ),

  new_status TEXT
    CHECK (
      new_status IS NULL
      OR new_status IN (
        'pending',
        'confirmed',
        'rescheduled',
        'cancelled',
        'no_show',
        'completed'
      )
    ),

  old_appointment_date DATE,
  old_start_time TIME,
  old_end_time TIME,

  new_appointment_date DATE,
  new_start_time TIME,
  new_end_time TIME,

  reason TEXT,
  notes TEXT,

  performed_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_appointment_events_account
  ON public.appointment_events(account_id);

CREATE INDEX IF NOT EXISTS idx_appointment_events_appointment
  ON public.appointment_events(appointment_id);

CREATE INDEX IF NOT EXISTS idx_appointment_events_account_created
  ON public.appointment_events(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_events_appointment_created
  ON public.appointment_events(appointment_id, created_at ASC);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.appointment_events ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SELECT
--
-- Any account member may view appointment history.
-- ============================================================

DROP POLICY IF EXISTS appointment_events_select
  ON public.appointment_events;

CREATE POLICY appointment_events_select
  ON public.appointment_events
  FOR SELECT
  USING (
    public.is_account_member(account_id)
  );


-- ============================================================
-- INSERT
--
-- Lifecycle actions are operational data and therefore require
-- agent-level access, consistent with appointment writes.
-- ============================================================

DROP POLICY IF EXISTS appointment_events_insert
  ON public.appointment_events;

CREATE POLICY appointment_events_insert
  ON public.appointment_events
  FOR INSERT
  WITH CHECK (
    public.is_account_member(account_id, 'agent')
  );


-- ============================================================
-- IMMUTABLE AUDIT HISTORY
--
-- Events should not be edited or deleted through normal client
-- operations.
-- ============================================================

DROP POLICY IF EXISTS appointment_events_update
  ON public.appointment_events;

CREATE POLICY appointment_events_update
  ON public.appointment_events
  FOR UPDATE
  USING (FALSE);


DROP POLICY IF EXISTS appointment_events_delete
  ON public.appointment_events;

CREATE POLICY appointment_events_delete
  ON public.appointment_events
  FOR DELETE
  USING (FALSE);


-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE public.appointment_events IS
  'Immutable operational history for ClinicConnect appointments.';

COMMENT ON COLUMN public.appointment_events.event_type IS
  'Lifecycle event such as booked, confirmed, rescheduled, checked_in, consultation_started, completed, cancelled, or no_show.';

COMMENT ON COLUMN public.appointment_events.previous_status IS
  'Appointment status immediately before the lifecycle event.';

COMMENT ON COLUMN public.appointment_events.new_status IS
  'Appointment status immediately after the lifecycle event.';

COMMENT ON COLUMN public.appointment_events.performed_by IS
  'Authenticated user who performed the lifecycle action.';