import type { AccountContext } from '@/lib/auth/account';

export interface ClinicSchedule {
  id: string;
  account_id: string;
  doctor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClinicScheduleWrite {
  doctor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  is_active: boolean;
}

export class ClinicScheduleError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 500) {
    super(message);
    this.name = 'ClinicScheduleError';
  }
}

const WRITE_KEYS = new Set(['doctor_id', 'day_of_week', 'start_time', 'end_time', 'slot_duration_minutes', 'is_active']);
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const SCHEDULE_COLUMNS = 'id, account_id, doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, is_active, created_at, updated_at';
type ScheduleContext = Pick<AccountContext, 'accountId' | 'supabase'>;

function minutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function scheduleRangesOverlap(start: string, end: string, otherStart: string, otherEnd: string): boolean {
  return minutes(start) < minutes(otherEnd) && minutes(end) > minutes(otherStart);
}

export function validateClinicScheduleWrite(body: unknown): ClinicScheduleWrite {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ClinicScheduleError('Schedule body must be an object', 400);
  const input = body as Record<string, unknown>;
  if ('account_id' in input) throw new ClinicScheduleError('account_id is not accepted', 400);
  const unknownKey = Object.keys(input).find((key) => !WRITE_KEYS.has(key));
  if (unknownKey) throw new ClinicScheduleError(`Unsupported schedule field: ${unknownKey}`, 400);
  if (typeof input.doctor_id !== 'string' || !input.doctor_id.trim()) throw new ClinicScheduleError('doctor_id is required', 400);
  if (!Number.isInteger(input.day_of_week) || (input.day_of_week as number) < 0 || (input.day_of_week as number) > 6) throw new ClinicScheduleError('day_of_week must be between 0 (Sunday) and 6 (Saturday)', 400);
  if (typeof input.start_time !== 'string' || !TIME_RE.test(input.start_time)) throw new ClinicScheduleError('start_time must be a valid 24-hour time', 400);
  if (typeof input.end_time !== 'string' || !TIME_RE.test(input.end_time)) throw new ClinicScheduleError('end_time must be a valid 24-hour time', 400);
  if (minutes(input.end_time) <= minutes(input.start_time)) throw new ClinicScheduleError('end_time must be later than start_time', 400);
  if (!Number.isInteger(input.slot_duration_minutes) || (input.slot_duration_minutes as number) <= 0) throw new ClinicScheduleError('slot_duration_minutes must be a positive integer', 400);
  if ((input.slot_duration_minutes as number) > minutes(input.end_time) - minutes(input.start_time)) throw new ClinicScheduleError('slot duration cannot exceed the schedule interval', 400);
  if (typeof input.is_active !== 'boolean') throw new ClinicScheduleError('is_active must be a boolean', 400);
  return {
    doctor_id: input.doctor_id.trim(),
    day_of_week: input.day_of_week as number,
    start_time: input.start_time,
    end_time: input.end_time,
    slot_duration_minutes: input.slot_duration_minutes as number,
    is_active: input.is_active,
  };
}

async function assertDoctorBelongsToAccount(context: ScheduleContext, doctorId: string) {
  const { data, error } = await context.supabase.from('clinic_doctors').select('id').eq('account_id', context.accountId).eq('id', doctorId).maybeSingle();
  if (error) { console.error('[clinicconnect/schedules] doctor lookup failed'); throw new ClinicScheduleError('Doctor is temporarily unavailable', 500); }
  if (!data) throw new ClinicScheduleError('Doctor was not found in this clinic', 404);
}

async function assertNoActiveOverlap(context: ScheduleContext, input: ClinicScheduleWrite, scheduleId?: string) {
  if (!input.is_active) return;
  const { data, error } = await context.supabase.from('doctor_schedules').select('id, start_time, end_time').eq('account_id', context.accountId).eq('doctor_id', input.doctor_id).eq('day_of_week', input.day_of_week).eq('is_active', true);
  if (error) { console.error('[clinicconnect/schedules] overlap lookup failed'); throw new ClinicScheduleError('Schedule availability is temporarily unavailable', 500); }
  const overlap = (data ?? []).some((row) => row.id !== scheduleId && scheduleRangesOverlap(input.start_time, input.end_time, String(row.start_time), String(row.end_time)));
  if (overlap) throw new ClinicScheduleError('This schedule overlaps another active schedule for the doctor and day', 409);
}

export async function listClinicSchedules(context: ScheduleContext, doctorId?: string): Promise<ClinicSchedule[]> {
  let query = context.supabase.from('doctor_schedules').select(SCHEDULE_COLUMNS).eq('account_id', context.accountId).order('day_of_week').order('start_time');
  if (doctorId) query = query.eq('doctor_id', doctorId);
  const { data, error } = await query;
  if (error) { console.error('[clinicconnect/schedules] list failed'); throw new ClinicScheduleError('Schedules are temporarily unavailable', 500); }
  return (data ?? []) as ClinicSchedule[];
}

export async function getClinicSchedule(context: ScheduleContext, scheduleId: string): Promise<ClinicSchedule | null> {
  const { data, error } = await context.supabase.from('doctor_schedules').select(SCHEDULE_COLUMNS).eq('account_id', context.accountId).eq('id', scheduleId).maybeSingle();
  if (error) { console.error('[clinicconnect/schedules] read failed'); throw new ClinicScheduleError('Schedule is temporarily unavailable', 500); }
  return data as ClinicSchedule | null;
}

export async function saveClinicSchedule(context: ScheduleContext, input: ClinicScheduleWrite, scheduleId?: string): Promise<ClinicSchedule> {
  await assertDoctorBelongsToAccount(context, input.doctor_id);
  await assertNoActiveOverlap(context, input, scheduleId);
  const query = scheduleId
    ? context.supabase.from('doctor_schedules').update(input).eq('account_id', context.accountId).eq('id', scheduleId).select(SCHEDULE_COLUMNS).maybeSingle()
    : context.supabase.from('doctor_schedules').insert({ ...input, account_id: context.accountId }).select(SCHEDULE_COLUMNS).single();
  const { data, error } = await query;
  if (error || !data) {
    if (scheduleId && !error && !data) throw new ClinicScheduleError('Schedule not found', 404);
    console.error('[clinicconnect/schedules] save failed');
    throw new ClinicScheduleError('Schedule could not be saved', 500);
  }
  return data as ClinicSchedule;
}
