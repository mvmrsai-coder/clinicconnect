import type { AccountContext } from '@/lib/auth/account';

export const CONSENT_EVENT_TYPES = ['OPT_IN', 'OPT_OUT'] as const;
export type ConsentEventType = (typeof CONSENT_EVENT_TYPES)[number];
export type ConsentState = ConsentEventType | 'UNKNOWN';

export interface WhatsappConsentEvent {
  id: string;
  eventType: ConsentEventType;
  source: string;
  occurredAt: string;
  recordedAt: string;
  recordedByName: string | null;
}

export interface WhatsappContactConsent {
  contactId: string;
  phone: string;
  name: string | null;
  email: string | null;
  isPatient: boolean;
  state: ConsentState;
  latest: WhatsappConsentEvent | null;
}

export interface WhatsappConsentSummary {
  totalContacts: number;
  optedIn: number;
  optedOut: number;
  unknown: number;
}

export interface WhatsappConsentDashboard {
  contacts: WhatsappContactConsent[];
  summary: WhatsappConsentSummary;
}

export interface WhatsappConsentHistory {
  contact: WhatsappContactConsent;
  events: WhatsappConsentEvent[];
}

interface RawEvent {
  id: string;
  event_type: ConsentEventType;
  source: string;
  occurred_at: string;
  recorded_at: string;
  recorded_by_user_id: string | null;
}

const CONTACT_COLUMNS = 'id, phone, name, email';
const EVENT_COLUMNS =
  'id, contact_id, event_type, source, occurred_at, recorded_at, recorded_by_user_id';

function eventSort(a: RawEvent, b: RawEvent): number {
  const occurred = b.occurred_at.localeCompare(a.occurred_at);
  if (occurred !== 0) return occurred;
  const recorded = b.recorded_at.localeCompare(a.recorded_at);
  if (recorded !== 0) return recorded;
  return b.id.localeCompare(a.id);
}

export function sortAndDeriveConsent(events: RawEvent[]): {
  latest: RawEvent | null;
  state: ConsentState;
} {
  const ordered = [...events].sort(eventSort);
  const latest = ordered[0] ?? null;
  return { latest, state: latest?.event_type ?? 'UNKNOWN' };
}

async function namesByUserId(
  context: AccountContext,
  userIds: string[]
): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const { data, error } = await context.supabase
    .from('profiles')
    .select('user_id, full_name')
    .in('user_id', userIds);
  if (error) {
    console.error('[clinicconnect/whatsapp] recorded-by lookup failed');
    return new Map();
  }
  const entries = (data ?? [])
    .filter((row) => typeof row.user_id === 'string')
    .map(
      (row) =>
        [row.user_id as string, (row.full_name as string | null) ?? ''] as [
          string,
          string,
        ]
    )
    .filter(([, name]) => name.length > 0);
  return new Map<string, string>(entries);
}

function toEvent(
  row: RawEvent,
  names: Map<string, string>
): WhatsappConsentEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    source: row.source,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    recordedByName: row.recorded_by_user_id
      ? (names.get(row.recorded_by_user_id) ?? null)
      : null,
  };
}

function summarize(contacts: WhatsappContactConsent[]): WhatsappConsentSummary {
  return contacts.reduce(
    (result, contact) => {
      result.totalContacts += 1;
      if (contact.state === 'OPT_IN') result.optedIn += 1;
      else if (contact.state === 'OPT_OUT') result.optedOut += 1;
      else result.unknown += 1;
      return result;
    },
    { totalContacts: 0, optedIn: 0, optedOut: 0, unknown: 0 }
  );
}

async function getContact(
  context: AccountContext,
  contactId: string
): Promise<WhatsappContactConsent | null> {
  const [
    { data: contact, error: contactError },
    { data: patient, error: patientError },
  ] = await Promise.all([
    context.supabase
      .from('contacts')
      .select(CONTACT_COLUMNS)
      .eq('account_id', context.accountId)
      .eq('id', contactId)
      .maybeSingle(),
    context.supabase
      .from('patient_profiles')
      .select('contact_id')
      .eq('account_id', context.accountId)
      .eq('contact_id', contactId)
      .maybeSingle(),
  ]);
  if (contactError || patientError) throw new Error('Contact lookup failed');
  if (!contact) return null;
  const { data: events, error: eventError } = await context.supabase
    .from('whatsapp_consent_events')
    .select(EVENT_COLUMNS)
    .eq('account_id', context.accountId)
    .eq('contact_id', contactId);
  if (eventError) throw new Error('Consent history lookup failed');
  const rows = (events ?? []) as RawEvent[];
  const names = await namesByUserId(
    context,
    rows.flatMap((row) =>
      row.recorded_by_user_id ? [row.recorded_by_user_id] : []
    )
  );
  const { latest, state } = sortAndDeriveConsent(rows);
  return {
    contactId: contact.id as string,
    phone: contact.phone as string,
    name: (contact.name as string | null) ?? null,
    email: (contact.email as string | null) ?? null,
    isPatient: Boolean(patient),
    state,
    latest: latest ? toEvent(latest, names) : null,
  };
}

export async function listWhatsappConsent(
  context: AccountContext
): Promise<WhatsappConsentDashboard> {
  const [
    { data: contacts, error: contactsError },
    { data: patients, error: patientsError },
    { data: events, error: eventsError },
  ] = await Promise.all([
    context.supabase
      .from('contacts')
      .select(CONTACT_COLUMNS)
      .eq('account_id', context.accountId)
      .order('name', { ascending: true }),
    context.supabase
      .from('patient_profiles')
      .select('contact_id')
      .eq('account_id', context.accountId),
    context.supabase
      .from('whatsapp_consent_events')
      .select(EVENT_COLUMNS)
      .eq('account_id', context.accountId),
  ]);
  if (contactsError || patientsError || eventsError) {
    console.error('[clinicconnect/whatsapp] consent dashboard lookup failed');
    throw new Error('Consent dashboard lookup failed');
  }
  const patientIds = new Set(
    (patients ?? []).map((row) => row.contact_id as string)
  );
  const byContact = new Map<string, RawEvent[]>();
  for (const row of (events ?? []) as RawEvent[]) {
    const list =
      byContact.get((row as RawEvent & { contact_id: string }).contact_id) ??
      [];
    list.push(row);
    byContact.set((row as RawEvent & { contact_id: string }).contact_id, list);
  }
  const names = await namesByUserId(context, [
    ...new Set(
      (events ?? []).flatMap((row) =>
        row.recorded_by_user_id ? [row.recorded_by_user_id as string] : []
      )
    ),
  ]);
  const result = (contacts ?? []).map((contact) => {
    const rows = byContact.get(contact.id as string) ?? [];
    const { latest, state } = sortAndDeriveConsent(rows);
    return {
      contactId: contact.id as string,
      phone: contact.phone as string,
      name: (contact.name as string | null) ?? null,
      email: (contact.email as string | null) ?? null,
      isPatient: patientIds.has(contact.id as string),
      state,
      latest: latest ? toEvent(latest, names) : null,
    } satisfies WhatsappContactConsent;
  });
  return { contacts: result, summary: summarize(result) };
}

export async function getWhatsappConsentHistory(
  context: AccountContext,
  contactId: string
): Promise<WhatsappConsentHistory | null> {
  const contact = await getContact(context, contactId);
  if (!contact) return null;
  const { data: events, error } = await context.supabase
    .from('whatsapp_consent_events')
    .select(EVENT_COLUMNS)
    .eq('account_id', context.accountId)
    .eq('contact_id', contactId);
  if (error) throw new Error('Consent history lookup failed');
  const rows = (events ?? []) as RawEvent[];
  const names = await namesByUserId(context, [
    ...new Set(
      rows.flatMap((row) =>
        row.recorded_by_user_id ? [row.recorded_by_user_id] : []
      )
    ),
  ]);
  return {
    contact,
    events: rows.sort(eventSort).map((row) => toEvent(row, names)),
  };
}
