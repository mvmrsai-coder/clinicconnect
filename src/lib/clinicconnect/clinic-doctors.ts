import type { AccountContext } from '@/lib/auth/account';

export interface ClinicDoctor {
  id: string;
  account_id: string;
  name: string;
  specialization: string | null;
  qualification: string | null;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  bio: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClinicDoctorWrite {
  name: string;
  specialization: string | null;
  qualification: string | null;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  bio: string | null;
  is_active: boolean;
}

export class ClinicDoctorError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 500,
  ) {
    super(message);
    this.name = 'ClinicDoctorError';
  }
}

const MAX_LENGTHS = {
  name: 160,
  specialization: 120,
  qualification: 160,
  display_name: 120,
  phone: 40,
  email: 254,
  bio: 2000,
} as const;

const WRITE_KEYS = new Set([
  'name',
  'specialization',
  'qualification',
  'display_name',
  'phone',
  'email',
  'bio',
  'is_active',
]);

function optionalText(
  value: unknown,
  field: keyof typeof MAX_LENGTHS,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new ClinicDoctorError(`${field} must be a string`, 400);
  }
  const normalized = value.trim();
  if (normalized.length > MAX_LENGTHS[field]) {
    throw new ClinicDoctorError(
      `${field} must be ${MAX_LENGTHS[field]} characters or fewer`,
      400,
    );
  }
  return normalized || null;
}

export function validateClinicDoctorWrite(body: unknown): ClinicDoctorWrite {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ClinicDoctorError('Doctor body must be an object', 400);
  }
  const input = body as Record<string, unknown>;
  if ('account_id' in input) {
    throw new ClinicDoctorError('account_id is not accepted', 400);
  }
  const unknownKey = Object.keys(input).find((key) => !WRITE_KEYS.has(key));
  if (unknownKey) {
    throw new ClinicDoctorError(`Unsupported doctor field: ${unknownKey}`, 400);
  }
  if (typeof input.name !== 'string' || !input.name.trim()) {
    throw new ClinicDoctorError('name is required', 400);
  }
  const name = input.name.trim();
  if (name.length > MAX_LENGTHS.name) {
    throw new ClinicDoctorError(`name must be ${MAX_LENGTHS.name} characters or fewer`, 400);
  }
  const email = optionalText(input.email, 'email');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    throw new ClinicDoctorError('email must be valid', 400);
  }
  if (input.is_active !== undefined && typeof input.is_active !== 'boolean') {
    throw new ClinicDoctorError('is_active must be a boolean', 400);
  }
  return {
    name,
    specialization: optionalText(input.specialization, 'specialization'),
    qualification: optionalText(input.qualification, 'qualification'),
    display_name: optionalText(input.display_name, 'display_name'),
    phone: optionalText(input.phone, 'phone'),
    email,
    bio: optionalText(input.bio, 'bio'),
    is_active: input.is_active ?? true,
  };
}

const DOCTOR_COLUMNS =
  'id, account_id, name, specialization, qualification, display_name, phone, email, bio, is_active, created_at, updated_at';

type DoctorContext = Pick<AccountContext, 'accountId' | 'supabase'>;

export async function listClinicDoctors(context: DoctorContext): Promise<ClinicDoctor[]> {
  const { data, error } = await context.supabase
    .from('clinic_doctors')
    .select(DOCTOR_COLUMNS)
    .eq('account_id', context.accountId)
    .order('name');
  if (error) {
    console.error('[clinicconnect/doctors] list failed');
    throw new ClinicDoctorError('Doctors are temporarily unavailable', 500);
  }
  return (data ?? []) as ClinicDoctor[];
}

export async function getClinicDoctor(
  context: DoctorContext,
  doctorId: string,
): Promise<ClinicDoctor | null> {
  const { data, error } = await context.supabase
    .from('clinic_doctors')
    .select(DOCTOR_COLUMNS)
    .eq('account_id', context.accountId)
    .eq('id', doctorId)
    .maybeSingle();
  if (error) {
    console.error('[clinicconnect/doctors] read failed');
    throw new ClinicDoctorError('Doctor is temporarily unavailable', 500);
  }
  return data as ClinicDoctor | null;
}

export async function saveClinicDoctor(
  context: DoctorContext,
  input: ClinicDoctorWrite,
  doctorId?: string,
): Promise<ClinicDoctor> {
  const query = doctorId
    ? context.supabase
        .from('clinic_doctors')
        .update(input)
        .eq('account_id', context.accountId)
        .eq('id', doctorId)
        .select(DOCTOR_COLUMNS)
        .maybeSingle()
    : context.supabase
        .from('clinic_doctors')
        .insert({ ...input, account_id: context.accountId })
        .select(DOCTOR_COLUMNS)
        .single();
  const { data, error } = await query;
  if (error || !data) {
    if (error?.code === '23505') {
      throw new ClinicDoctorError('That doctor could not be saved because it conflicts with existing data', 409);
    }
    if (doctorId && !error && !data) {
      throw new ClinicDoctorError('Doctor not found', 404);
    }
    console.error('[clinicconnect/doctors] save failed');
    throw new ClinicDoctorError('Doctor could not be saved', 500);
  }
  return data as ClinicDoctor;
}
