import type { AccountContext } from '@/lib/auth/account';
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe';
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils';

export interface PatientContact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
}

export interface ClinicPatient {
  id: string;
  account_id: string;
  contact_id: string;
  date_of_birth: string | null;
  gender: string | null;
  preferred_language: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contact: PatientContact;
}

export interface PatientContactInput {
  phone: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
}

export interface ClinicPatientWrite {
  contact_id?: string;
  contact?: PatientContactInput;
  date_of_birth?: string | null;
  gender?: string | null;
  preferred_language?: string | null;
  notes?: string | null;
}

export class ClinicPatientError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 500) {
    super(message);
    this.name = 'ClinicPatientError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATIENT_KEYS = new Set(['contact_id', 'contact', 'date_of_birth', 'gender', 'preferred_language', 'notes']);
const CONTACT_KEYS = new Set(['phone', 'name', 'email', 'company']);

function optionalText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new ClinicPatientError(`${field} must be a string`, 400);
  const normalized = value.trim();
  if (normalized.length > max) throw new ClinicPatientError(`${field} must be ${max} characters or fewer`, 400);
  return normalized || null;
}

function contactInput(value: unknown): PatientContactInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ClinicPatientError('contact must be an object', 400);
  const input = value as Record<string, unknown>;
  const unknown = Object.keys(input).find((key) => !CONTACT_KEYS.has(key));
  if (unknown) throw new ClinicPatientError(`Unsupported contact field: ${unknown}`, 400);
  if (typeof input.phone !== 'string' || !input.phone.trim()) throw new ClinicPatientError('contact.phone is required', 400);
  const phone = sanitizePhoneForMeta(input.phone.trim());
  if (!isValidE164(phone)) throw new ClinicPatientError('contact.phone must be a valid E.164 phone number', 400);
  const email = optionalText(input.email, 'contact.email', 254);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new ClinicPatientError('contact.email must be valid', 400);
  return {
    phone,
    name: optionalText(input.name, 'contact.name', 160),
    email,
    company: optionalText(input.company, 'contact.company', 160),
  };
}

export function validateClinicPatientWrite(body: unknown, partial = false): ClinicPatientWrite {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ClinicPatientError('Patient body must be an object', 400);
  const input = body as Record<string, unknown>;
  if ('account_id' in input) throw new ClinicPatientError('account_id is not accepted', 400);
  const unknown = Object.keys(input).find((key) => !PATIENT_KEYS.has(key));
  if (unknown) throw new ClinicPatientError(`Unsupported patient field: ${unknown}`, 400);
  if (!partial && !input.contact_id && !input.contact) throw new ClinicPatientError('contact_id or contact is required', 400);
  if (input.contact_id !== undefined && (typeof input.contact_id !== 'string' || !UUID.test(input.contact_id))) throw new ClinicPatientError('contact_id must be a valid identifier', 400);
  if (input.contact_id && input.contact) throw new ClinicPatientError('Provide either contact_id or contact, not both', 400);
  const date = optionalText(input.date_of_birth, 'date_of_birth', 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ClinicPatientError('date_of_birth must use YYYY-MM-DD', 400);
  return {
    contact_id: input.contact_id as string | undefined,
    contact: input.contact === undefined ? undefined : contactInput(input.contact),
    date_of_birth: date,
    gender: optionalText(input.gender, 'gender', 80),
    preferred_language: optionalText(input.preferred_language, 'preferred_language', 80),
    notes: optionalText(input.notes, 'notes', 4000),
  };
}

type PatientContext = Pick<AccountContext, 'accountId' | 'userId' | 'supabase'>;
const PATIENT_COLUMNS = 'id, account_id, contact_id, date_of_birth, gender, preferred_language, notes, created_at, updated_at';
const CONTACT_COLUMNS = 'id, phone, name, email, company';

async function attachContacts(context: PatientContext, rows: Record<string, unknown>[]): Promise<ClinicPatient[]> {
  const ids = rows.map((row) => row.contact_id as string);
  if (!ids.length) return [];
  const { data: contacts, error } = await context.supabase.from('contacts').select(CONTACT_COLUMNS).eq('account_id', context.accountId).in('id', ids);
  if (error) { console.error('[clinicconnect/patients] contacts list failed'); throw new ClinicPatientError('Patients are temporarily unavailable', 500); }
  const byId = new Map((contacts ?? []).map((contact) => [contact.id as string, contact as PatientContact]));
  return rows.flatMap((row) => {
    const contact = byId.get(row.contact_id as string);
    return contact ? [{ ...row, contact } as ClinicPatient] : [];
  });
}

export async function listClinicPatients(context: PatientContext): Promise<ClinicPatient[]> {
  const { data, error } = await context.supabase.from('patient_profiles').select(PATIENT_COLUMNS).eq('account_id', context.accountId).order('created_at', { ascending: false });
  if (error) { console.error('[clinicconnect/patients] list failed'); throw new ClinicPatientError('Patients are temporarily unavailable', 500); }
  return attachContacts(context, (data ?? []) as Record<string, unknown>[]);
}

export async function getClinicPatient(context: PatientContext, id: string): Promise<ClinicPatient | null> {
  if (!UUID.test(id)) throw new ClinicPatientError('Patient id must be a valid identifier', 400);
  const { data, error } = await context.supabase.from('patient_profiles').select(PATIENT_COLUMNS).eq('account_id', context.accountId).eq('id', id).maybeSingle();
  if (error) { console.error('[clinicconnect/patients] read failed'); throw new ClinicPatientError('Patient is temporarily unavailable', 500); }
  if (!data) return null;
  const attached = await attachContacts(context, [data as Record<string, unknown>]);
  return attached[0] ?? null;
}

export async function searchClinicContacts(context: PatientContext, query: string): Promise<PatientContact[]> {
  const q = query.trim();
  if (q.length < 2) throw new ClinicPatientError('Search must contain at least two characters', 400);
  const { data, error } = await context.supabase.from('contacts').select(CONTACT_COLUMNS).eq('account_id', context.accountId).or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`).order('name').limit(25);
  if (error) { console.error('[clinicconnect/patients] contact search failed'); throw new ClinicPatientError('Contacts are temporarily unavailable', 500); }
  return (data ?? []) as PatientContact[];
}

function patientFields(input: ClinicPatientWrite, partial = false): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const key of ['date_of_birth', 'gender', 'preferred_language', 'notes'] as const) {
    if (!partial || input[key] !== undefined) fields[key] = input[key] ?? null;
  }
  return fields;
}

export async function createClinicPatient(context: PatientContext, input: ClinicPatientWrite): Promise<ClinicPatient> {
  let contactId = input.contact_id;
  let createdContact = false;
  if (input.contact) {
    const existing = await findExistingContact(context.supabase, context.accountId, input.contact.phone);
    if (existing) throw new ClinicPatientError('A contact with that phone already exists; select the existing contact', 409);
    const { data: contact, error } = await context.supabase.from('contacts').insert({ account_id: context.accountId, user_id: context.userId, phone: input.contact.phone, name: input.contact.name ?? input.contact.phone, email: input.contact.email ?? null, company: input.contact.company ?? null }).select('id').single();
    if (error || !contact) { if (isUniqueViolation(error)) throw new ClinicPatientError('A contact with that phone already exists', 409); console.error('[clinicconnect/patients] contact create failed'); throw new ClinicPatientError('Contact could not be created', 500); }
    contactId = contact.id as string; createdContact = true;
  }
  if (!contactId) throw new ClinicPatientError('contact_id or contact is required', 400);
  const { data: ownedContact, error: contactError } = await context.supabase.from('contacts').select('id').eq('account_id', context.accountId).eq('id', contactId).maybeSingle();
  if (contactError || !ownedContact) throw new ClinicPatientError('Contact was not found in this clinic', 404);
  const { data, error } = await context.supabase.from('patient_profiles').insert({ ...patientFields(input), account_id: context.accountId, contact_id: contactId }).select(PATIENT_COLUMNS).single();
  if (error || !data) {
    if (error?.code === '23505') throw new ClinicPatientError('That contact is already a patient', 409);
    if (createdContact) await context.supabase.from('contacts').delete().eq('account_id', context.accountId).eq('id', contactId);
    console.error('[clinicconnect/patients] patient create failed'); throw new ClinicPatientError('Patient could not be created', 500);
  }
  const attached = await attachContacts(context, [data as Record<string, unknown>]);
  if (!attached[0]) throw new ClinicPatientError('Patient was created but could not be loaded', 500);
  return attached[0];
}

export async function updateClinicPatient(context: PatientContext, id: string, input: ClinicPatientWrite): Promise<ClinicPatient> {
  const current = await getClinicPatient(context, id);
  if (!current) throw new ClinicPatientError('Patient not found', 404);
  if (input.contact_id !== undefined && input.contact_id !== current.contact_id) throw new ClinicPatientError('Patient contact cannot be changed', 400);
  const { data, error } = await context.supabase.from('patient_profiles').update(patientFields(input, true)).eq('account_id', context.accountId).eq('id', id).select(PATIENT_COLUMNS).maybeSingle();
  if (error || !data) { console.error('[clinicconnect/patients] patient update failed'); throw new ClinicPatientError('Patient could not be updated', 500); }
  if (input.contact) {
    const { error: contactError } = await context.supabase.from('contacts').update({ phone: input.contact.phone, name: input.contact.name ?? input.contact.phone, email: input.contact.email ?? null, company: input.contact.company ?? null }).eq('account_id', context.accountId).eq('id', current.contact_id);
    if (contactError?.code === '23505') throw new ClinicPatientError('A contact with that phone already exists', 409);
    if (contactError) { console.error('[clinicconnect/patients] contact update failed'); throw new ClinicPatientError('Patient contact could not be updated', 500); }
  }
  const updated = await getClinicPatient(context, id);
  if (!updated) throw new ClinicPatientError('Patient could not be loaded after update', 500);
  return updated;
}
