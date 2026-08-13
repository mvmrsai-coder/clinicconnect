import type { AccountContext } from '@/lib/auth/account';

export const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show'] as const;
export const ACTIVE_APPOINTMENT_STATUSES = ['pending', 'confirmed', 'rescheduled'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export interface ClinicAppointment {
  id: string;
  account_id: string;
  patient_profile_id: string;
  doctor_id: string;
  service_id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  source: string | null;
  notes: string | null;
  confirmation_sent_at: string | null;
  reminder_sent_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClinicAppointmentWrite {
  patient_profile_id?: string;
  doctor_id?: string;
  service_id?: string;
  appointment_date?: string;
  start_time?: string;
  end_time?: string;
  status?: AppointmentStatus;
  source?: string | null;
  notes?: string | null;
}

export interface AppointmentAvailabilityRequest { doctor_id: string; service_id: string; date: string; }
export interface AppointmentSlot { start_time: string; end_time: string; }
export interface AppointmentAvailability { doctor_id: string; service_id: string; date: string; timezone: string; duration_minutes: number; slots: AppointmentSlot[]; }

export class ClinicAppointmentError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 500, readonly code?: string) { super(message); this.name = 'ClinicAppointmentError'; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const APPOINTMENT_COLUMNS = 'id, account_id, patient_profile_id, doctor_id, service_id, appointment_date, start_time, end_time, status, source, notes, confirmation_sent_at, reminder_sent_at, completed_at, cancelled_at, created_at, updated_at';
const WRITE_KEYS = new Set(['patient_profile_id', 'doctor_id', 'service_id', 'appointment_date', 'start_time', 'end_time', 'status', 'source', 'notes']);
const MAX_SOURCE = 80;
const MAX_NOTES = 4000;

function validDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  try { return date.toISOString().slice(0, 10) === value; } catch { return false; }
}

export function normalizeTime(value: string): string {
  if (!TIME.test(value)) throw new ClinicAppointmentError('Time must use HH:MM', 400);
  return value.slice(0, 5);
}

export function timeToMinutes(value: string): number {
  const normalized = normalizeTime(value);
  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 1439) throw new ClinicAppointmentError('Time is outside the supported day', 400);
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function intervalsOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(endA) > timeToMinutes(startB);
}

function optionalText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new ClinicAppointmentError(`${field} must be a string`, 400);
  const normalized = value.trim();
  if (normalized.length > max) throw new ClinicAppointmentError(`${field} must be ${max} characters or fewer`, 400);
  return normalized || null;
}

export function validateAppointmentWrite(body: unknown, partial = false): ClinicAppointmentWrite {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ClinicAppointmentError('Appointment body must be an object', 400);
  const input = body as Record<string, unknown>;
  if ('account_id' in input) throw new ClinicAppointmentError('account_id is not accepted', 400);
  const unknown = Object.keys(input).find((key) => !WRITE_KEYS.has(key));
  if (unknown) throw new ClinicAppointmentError(`Unsupported appointment field: ${unknown}`, 400);
  for (const field of ['patient_profile_id', 'doctor_id', 'service_id'] as const) {
    if (input[field] !== undefined && (typeof input[field] !== 'string' || !UUID.test(input[field]))) throw new ClinicAppointmentError(`${field} must be a valid identifier`, 400);
    if (!partial && input[field] === undefined) throw new ClinicAppointmentError(`${field} is required`, 400);
  }
  if (!partial && typeof input.appointment_date !== 'string') throw new ClinicAppointmentError('appointment_date is required', 400);
  if (input.appointment_date !== undefined && (typeof input.appointment_date !== 'string' || !validDate(input.appointment_date))) throw new ClinicAppointmentError('appointment_date must use YYYY-MM-DD', 400);
  if (!partial && typeof input.start_time !== 'string') throw new ClinicAppointmentError('start_time is required', 400);
  if (input.start_time !== undefined && typeof input.start_time === 'string') normalizeTime(input.start_time);
  if (input.end_time !== undefined && typeof input.end_time === 'string') normalizeTime(input.end_time);
  if (input.status !== undefined && (typeof input.status !== 'string' || !(APPOINTMENT_STATUSES as readonly string[]).includes(input.status))) throw new ClinicAppointmentError('status is invalid', 400);
  return {
    patient_profile_id: input.patient_profile_id as string | undefined,
    doctor_id: input.doctor_id as string | undefined,
    service_id: input.service_id as string | undefined,
    appointment_date: input.appointment_date as string | undefined,
    start_time: input.start_time === undefined ? undefined : normalizeTime(input.start_time as string),
    end_time: input.end_time === undefined ? undefined : normalizeTime(input.end_time as string),
    status: input.status as AppointmentStatus | undefined,
    source: optionalText(input.source, 'source', MAX_SOURCE),
    notes: optionalText(input.notes, 'notes', MAX_NOTES),
  };
}

type AppointmentContext = Pick<AccountContext, 'accountId' | 'supabase'>;
type SupabaseContext = Pick<AccountContext, 'accountId' | 'supabase'>;

function dbFailure(label: string): never { console.error(`[clinicconnect/appointments] ${label} failed`); throw new ClinicAppointmentError('Appointments are temporarily unavailable', 500); }

async function getDoctor(context: SupabaseContext, id: string) {
  const { data, error } = await context.supabase.from('clinic_doctors').select('id, is_active').eq('account_id', context.accountId).eq('id', id).maybeSingle();
  if (error) dbFailure('doctor lookup');
  if (!data) throw new ClinicAppointmentError('Doctor was not found in this clinic', 404);
  if (!data.is_active) throw new ClinicAppointmentError('Doctor is inactive', 409, 'doctor_inactive');
  return data as { id: string; is_active: boolean };
}

async function getService(context: SupabaseContext, id: string) {
  const { data, error } = await context.supabase.from('clinic_services').select('id, duration_minutes, is_active').eq('account_id', context.accountId).eq('id', id).maybeSingle();
  if (error) dbFailure('service lookup');
  if (!data) throw new ClinicAppointmentError('Service was not found in this clinic', 404);
  if (!data.is_active) throw new ClinicAppointmentError('Service is inactive', 409, 'service_inactive');
  return data as { id: string; duration_minutes: number; is_active: boolean };
}

async function getPatient(context: SupabaseContext, id: string) {
  const { data, error } = await context.supabase.from('patient_profiles').select('id, account_id, contact_id').eq('account_id', context.accountId).eq('id', id).maybeSingle();
  if (error) dbFailure('patient lookup');
  if (!data) throw new ClinicAppointmentError('Patient was not found in this clinic', 404);
  return data as { id: string; account_id: string; contact_id: string };
}

async function getTimezone(context: SupabaseContext): Promise<string> {
  const { data, error } = await context.supabase.from('clinic_profiles').select('timezone').eq('account_id', context.accountId).maybeSingle();
  if (error) dbFailure('clinic timezone lookup');
  const timezone = (data?.timezone as string | null | undefined) || 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch { throw new ClinicAppointmentError('Clinic timezone is invalid', 500); }
  return timezone;
}

function localDateTime(timezone: string, now = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

async function getSchedules(context: SupabaseContext, doctorId: string, date: string) {
  const { data, error } = await context.supabase.from('doctor_schedules').select('start_time, end_time').eq('account_id', context.accountId).eq('doctor_id', doctorId).eq('day_of_week', dayOfWeek(date)).eq('is_active', true).order('start_time');
  if (error) dbFailure('schedule lookup');
  return (data ?? []) as { start_time: string; end_time: string }[];
}

async function getBookedAppointments(context: SupabaseContext, doctorId: string, date: string, excludeId?: string) {
  let query = context.supabase.from('appointments').select('id, start_time, end_time, status').eq('account_id', context.accountId).eq('doctor_id', doctorId).eq('appointment_date', date).in('status', [...ACTIVE_APPOINTMENT_STATUSES]);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error) dbFailure('appointment lookup');
  return (data ?? []) as { id: string; start_time: string; end_time: string; status: AppointmentStatus }[];
}

export function generateAppointmentSlots(schedules: { start_time: string; end_time: string }[], durationMinutes: number): AppointmentSlot[] {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) throw new ClinicAppointmentError('Service duration is invalid', 500);
  const slots = new Map<string, AppointmentSlot>();
  for (const schedule of schedules) {
    const start = timeToMinutes(schedule.start_time); const end = timeToMinutes(schedule.end_time);
    for (let cursor = start; cursor + durationMinutes <= end; cursor += durationMinutes) {
      const slot = { start_time: minutesToTime(cursor), end_time: minutesToTime(cursor + durationMinutes) };
      slots.set(`${slot.start_time}-${slot.end_time}`, slot);
    }
  }
  return [...slots.values()].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
}

export async function getAvailableAppointmentSlots(context: AppointmentContext, request: AppointmentAvailabilityRequest, excludeAppointmentId?: string): Promise<AppointmentAvailability> {
  if (!UUID.test(request.doctor_id) || !UUID.test(request.service_id)) throw new ClinicAppointmentError('doctor_id and service_id must be valid identifiers', 400);
  if (!validDate(request.date)) throw new ClinicAppointmentError('date must use YYYY-MM-DD', 400);
  const [doctor, service, timezone] = await Promise.all([getDoctor(context, request.doctor_id), getService(context, request.service_id), getTimezone(context)]);
  const schedules = await getSchedules(context, doctor.id, request.date);
  if (!schedules.length) return { doctor_id: doctor.id, service_id: service.id, date: request.date, timezone, duration_minutes: service.duration_minutes, slots: [] };
  const local = localDateTime(timezone);
  if (request.date < local.date) return { doctor_id: doctor.id, service_id: service.id, date: request.date, timezone, duration_minutes: service.duration_minutes, slots: [] };
  const booked = await getBookedAppointments(context, doctor.id, request.date, excludeAppointmentId);
  const slots = generateAppointmentSlots(schedules, service.duration_minutes).filter((slot) => {
    if (request.date === local.date && timeToMinutes(slot.end_time) <= timeToMinutes(local.time)) return false;
    return !booked.some((appointment) => intervalsOverlap(slot.start_time, slot.end_time, appointment.start_time, appointment.end_time));
  });
  return { doctor_id: doctor.id, service_id: service.id, date: request.date, timezone, duration_minutes: service.duration_minutes, slots };
}

async function assertAppointmentSlot(context: AppointmentContext, input: ClinicAppointmentWrite, status: AppointmentStatus, excludeId?: string): Promise<void> {
  if (!input.doctor_id || !input.service_id || !input.appointment_date || !input.start_time) throw new ClinicAppointmentError('doctor_id, service_id, appointment_date, and start_time are required', 400);
  const service = await getService(context, input.service_id);
  const expectedEnd = minutesToTime(timeToMinutes(input.start_time) + service.duration_minutes);
  if (input.end_time && input.end_time !== expectedEnd) throw new ClinicAppointmentError('end_time must match the selected service duration', 400);
  if (status === 'cancelled' || status === 'completed' || status === 'no_show') return;
  const availability = await getAvailableAppointmentSlots(context, { doctor_id: input.doctor_id, service_id: input.service_id, date: input.appointment_date }, excludeId);
  if (!availability.slots.some((slot) => slot.start_time === input.start_time && slot.end_time === expectedEnd)) throw new ClinicAppointmentError('Appointment time is not available', 409, 'appointment_unavailable');
}

export async function listClinicAppointments(context: AppointmentContext, filters: { date?: string | null; doctorId?: string | null; patientId?: string | null; status?: string | null }): Promise<ClinicAppointment[]> {
  if (filters.date && !validDate(filters.date)) throw new ClinicAppointmentError('date must use YYYY-MM-DD', 400);
  if (filters.status && !(APPOINTMENT_STATUSES as readonly string[]).includes(filters.status)) throw new ClinicAppointmentError('status is invalid', 400);
  let query = context.supabase.from('appointments').select(APPOINTMENT_COLUMNS).eq('account_id', context.accountId).order('appointment_date').order('start_time');
  if (filters.date) query = query.eq('appointment_date', filters.date);
  if (filters.doctorId) query = query.eq('doctor_id', filters.doctorId);
  if (filters.patientId) query = query.eq('patient_profile_id', filters.patientId);
  if (filters.status) query = query.eq('status', filters.status);
  const { data, error } = await query;
  if (error) dbFailure('list');
  return (data ?? []) as ClinicAppointment[];
}

export async function getClinicAppointment(context: AppointmentContext, id: string): Promise<ClinicAppointment | null> {
  if (!UUID.test(id)) throw new ClinicAppointmentError('Appointment id must be a valid identifier', 400);
  const { data, error } = await context.supabase.from('appointments').select(APPOINTMENT_COLUMNS).eq('account_id', context.accountId).eq('id', id).maybeSingle();
  if (error) dbFailure('read');
  return data as ClinicAppointment | null;
}

export async function createClinicAppointment(context: AppointmentContext, input: ClinicAppointmentWrite): Promise<ClinicAppointment> {
  const doctorId = input.doctor_id!; const serviceId = input.service_id!; const patientId = input.patient_profile_id!; const date = input.appointment_date!; const status = input.status ?? 'pending';
  await Promise.all([getDoctor(context, doctorId), getService(context, serviceId), getPatient(context, patientId)]);
  await assertAppointmentSlot(context, input, status);
  const service = await getService(context, serviceId);
  const endTime = minutesToTime(timeToMinutes(input.start_time!) + service.duration_minutes);
  const { data, error } = await context.supabase.from('appointments').insert({ account_id: context.accountId, patient_profile_id: patientId, doctor_id: doctorId, service_id: serviceId, appointment_date: date, start_time: input.start_time, end_time: endTime, status, source: input.source ?? null, notes: input.notes ?? null }).select(APPOINTMENT_COLUMNS).single();
  if (error || !data) {
    if (error?.code === '23P01') throw new ClinicAppointmentError('Appointment time is no longer available', 409, 'appointment_conflict');
    if (error?.code === '23514') throw new ClinicAppointmentError('Appointment time is invalid', 400);
    dbFailure('create');
  }
  return data as ClinicAppointment;
}

export async function updateClinicAppointment(context: AppointmentContext, id: string, input: ClinicAppointmentWrite): Promise<ClinicAppointment> {
  const current = await getClinicAppointment(context, id);
  if (!current) throw new ClinicAppointmentError('Appointment not found', 404);
  const merged: ClinicAppointmentWrite = { patient_profile_id: input.patient_profile_id ?? current.patient_profile_id, doctor_id: input.doctor_id ?? current.doctor_id, service_id: input.service_id ?? current.service_id, appointment_date: input.appointment_date ?? current.appointment_date, start_time: input.start_time ?? current.start_time.slice(0, 5), end_time: input.end_time ?? current.end_time.slice(0, 5), status: input.status ?? current.status, source: input.source === undefined ? current.source : input.source, notes: input.notes === undefined ? current.notes : input.notes };
  await Promise.all([getDoctor(context, merged.doctor_id!), getService(context, merged.service_id!), getPatient(context, merged.patient_profile_id!)]);
  await assertAppointmentSlot(context, merged, merged.status!, id);
  const service = await getService(context, merged.service_id!);
  const endTime = minutesToTime(timeToMinutes(merged.start_time!) + service.duration_minutes);
  const { data, error } = await context.supabase.from('appointments').update({ patient_profile_id: merged.patient_profile_id, doctor_id: merged.doctor_id, service_id: merged.service_id, appointment_date: merged.appointment_date, start_time: merged.start_time, end_time: endTime, status: merged.status, source: merged.source ?? null, notes: merged.notes ?? null }).eq('account_id', context.accountId).eq('id', id).select(APPOINTMENT_COLUMNS).maybeSingle();
  if (error || !data) { if (error?.code === '23P01') throw new ClinicAppointmentError('Appointment time is no longer available', 409, 'appointment_conflict'); if (!error && !data) throw new ClinicAppointmentError('Appointment not found', 404); dbFailure('update'); }
  return data as ClinicAppointment;
}
