-- ============================================================
-- 042_clinicconnect_whatsapp_consent.sql
-- ============================================================

SET search_path = public, extensions;

CREATE TABLE IF NOT EXISTS public.whatsapp_consent_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT whatsapp_consent_events_event_type_check
    CHECK (event_type IN ('OPT_IN', 'OPT_OUT')),

  CONSTRAINT whatsapp_consent_events_account_id_contact_id_fkey
    FOREIGN KEY (account_id, contact_id)
    REFERENCES public.contacts(account_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_consent_events_account_contact_occurred_at
  ON public.whatsapp_consent_events(account_id, contact_id, occurred_at DESC);

ALTER TABLE public.whatsapp_consent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_consent_events_select
  ON public.whatsapp_consent_events;

DROP POLICY IF EXISTS whatsapp_consent_events_insert
  ON public.whatsapp_consent_events;

CREATE POLICY whatsapp_consent_events_select
  ON public.whatsapp_consent_events
  FOR SELECT
  USING (public.is_account_member(account_id));

CREATE POLICY whatsapp_consent_events_insert
  ON public.whatsapp_consent_events
  FOR INSERT
  WITH CHECK (
    public.is_account_member(account_id, 'agent')
    AND recorded_by_user_id = auth.uid()
  );

GRANT SELECT, INSERT
ON TABLE public.whatsapp_consent_events
TO authenticated;
