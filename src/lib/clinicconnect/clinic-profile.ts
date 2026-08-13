import type { AccountContext } from '@/lib/auth/account';

export interface ClinicProfile {
  id: string;
  clinic_name: string;
  clinic_type: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  timezone: string;
  working_days: unknown;
  booking_enabled: boolean;
  onboarding_status: string;
  created_at: string;
  updated_at: string;
}

export interface ClinicProfileWrite {
  clinic_name: string;
  clinic_type: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  timezone: string;
  booking_enabled: boolean;
}

export class ClinicProfileError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 500,
  ) {
    super(message);
    this.name = 'ClinicProfileError';
  }
}

const MAX_LENGTHS = {
  clinic_name: 160,
  clinic_type: 80,
  phone: 40,
  email: 254,
  address: 240,
  city: 120,
} as const;

const WRITE_KEYS = new Set([
  'clinic_name',
  'clinic_type',
  'phone',
  'email',
  'address',
  'city',
  'timezone',
  'booking_enabled',
]);

function optionalText(
  value: unknown,
  field: keyof typeof MAX_LENGTHS,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new ClinicProfileError(`${field} must be a string`, 400);
  }
  const normalized = value.trim();
  if (normalized.length > MAX_LENGTHS[field]) {
    throw new ClinicProfileError(
      `${field} must be ${MAX_LENGTHS[field]} characters or fewer`,
      400,
    );
  }
  return normalized || null;
}

export function isValidTimezone(value: string): boolean {
  if (!value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate the browser payload. Account identity and onboarding state are
 * deliberately absent: the server supplies account_id from the session and
 * the onboarding status endpoint owns state transitions.
 */
export function validateClinicProfileWrite(body: unknown): ClinicProfileWrite {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ClinicProfileError('Profile body must be an object', 400);
  }

  const input = body as Record<string, unknown>;
  if ('account_id' in input) {
    throw new ClinicProfileError('account_id is not accepted', 400);
  }
  if ('onboarding_status' in input) {
    throw new ClinicProfileError('onboarding_status is read-only', 400);
  }
  if ('working_days' in input) {
    throw new ClinicProfileError(
      'working_days is read-only until its JSON contract is defined',
      400,
    );
  }

  const unknownKey = Object.keys(input).find((key) => !WRITE_KEYS.has(key));
  if (unknownKey) {
    throw new ClinicProfileError(`Unsupported profile field: ${unknownKey}`, 400);
  }

  if (typeof input.clinic_name !== 'string' || !input.clinic_name.trim()) {
    throw new ClinicProfileError('clinic_name is required', 400);
  }
  const clinicName = input.clinic_name.trim();
  if (clinicName.length > MAX_LENGTHS.clinic_name) {
    throw new ClinicProfileError(
      `clinic_name must be ${MAX_LENGTHS.clinic_name} characters or fewer`,
      400,
    );
  }

  if (typeof input.timezone !== 'string' || !input.timezone.trim()) {
    throw new ClinicProfileError('timezone is required', 400);
  }
  const timezone = input.timezone.trim();
  if (!isValidTimezone(timezone)) {
    throw new ClinicProfileError('timezone must be a valid IANA timezone', 400);
  }

  const email = optionalText(input.email, 'email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ClinicProfileError('email must be valid', 400);
  }

  if (
    input.booking_enabled !== undefined &&
    typeof input.booking_enabled !== 'boolean'
  ) {
    throw new ClinicProfileError('booking_enabled must be a boolean', 400);
  }

  return {
    clinic_name: clinicName,
    clinic_type: optionalText(input.clinic_type, 'clinic_type'),
    phone: optionalText(input.phone, 'phone'),
    email,
    address: optionalText(input.address, 'address'),
    city: optionalText(input.city, 'city'),
    timezone,
    booking_enabled: input.booking_enabled ?? true,
  };
}

const PROFILE_COLUMNS =
  'id, clinic_name, clinic_type, phone, email, address, city, timezone, working_days, booking_enabled, onboarding_status, created_at, updated_at';

export async function readClinicProfile(
  context: Pick<AccountContext, 'accountId' | 'supabase'>,
): Promise<ClinicProfile | null> {
  const { data, error } = await context.supabase
    .from('clinic_profiles')
    .select(PROFILE_COLUMNS)
    .eq('account_id', context.accountId)
    .maybeSingle();
  if (error) {
    console.error('[clinicconnect/profile] read failed');
    throw new ClinicProfileError('Clinic profile is temporarily unavailable', 500);
  }
  return data as ClinicProfile | null;
}

export async function saveClinicProfile(
  context: Pick<AccountContext, 'accountId' | 'supabase'>,
  input: ClinicProfileWrite,
): Promise<ClinicProfile> {
  const existing = await readClinicProfile(context);
  const query = existing
    ? context.supabase
        .from('clinic_profiles')
        .update(input)
        .eq('account_id', context.accountId)
        .select(PROFILE_COLUMNS)
        .single()
    : context.supabase
        .from('clinic_profiles')
        .insert({ ...input, account_id: context.accountId })
        .select(PROFILE_COLUMNS)
        .single();

  const { data, error } = await query;
  if (error || !data) {
    if (error?.code === '23505') {
      throw new ClinicProfileError(
        'A clinic profile already exists for this account. Refresh and try again.',
        409,
      );
    }
    console.error('[clinicconnect/profile] save failed');
    throw new ClinicProfileError('Clinic profile could not be saved', 500);
  }
  return data as ClinicProfile;
}
