import type { AccountContext } from '@/lib/auth/account';

export interface ClinicService {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClinicServiceWrite {
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  is_active: boolean;
}

export class ClinicServiceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 500,
  ) {
    super(message);
    this.name = 'ClinicServiceError';
  }
}

const MAX_NAME_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_DURATION_MINUTES = 24 * 60;
const MAX_PRICE = 9_999_999_999.99;
const WRITE_KEYS = new Set(['name', 'description', 'duration_minutes', 'price', 'is_active']);

function optionalDescription(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new ClinicServiceError('description must be a string', 400);
  const normalized = value.trim();
  if (normalized.length > MAX_DESCRIPTION_LENGTH) {
    throw new ClinicServiceError(`description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`, 400);
  }
  return normalized || null;
}

function parsePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new ClinicServiceError('price must be numeric', 400);
  }
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new ClinicServiceError('price must be a non-negative number with up to two decimals', 400);
  }
  const price = Number(raw);
  if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
    throw new ClinicServiceError('price is outside the supported range', 400);
  }
  return price;
}

export function validateClinicServiceWrite(body: unknown): ClinicServiceWrite {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ClinicServiceError('Service body must be an object', 400);
  }
  const input = body as Record<string, unknown>;
  if ('account_id' in input) throw new ClinicServiceError('account_id is not accepted', 400);
  const unknownKey = Object.keys(input).find((key) => !WRITE_KEYS.has(key));
  if (unknownKey) throw new ClinicServiceError(`Unsupported service field: ${unknownKey}`, 400);

  if (typeof input.name !== 'string' || !input.name.trim()) {
    throw new ClinicServiceError('name is required', 400);
  }
  const name = input.name.trim();
  if (name.length > MAX_NAME_LENGTH) {
    throw new ClinicServiceError(`name must be ${MAX_NAME_LENGTH} characters or fewer`, 400);
  }

  if (!Number.isInteger(input.duration_minutes) || (input.duration_minutes as number) <= 0) {
    throw new ClinicServiceError('duration_minutes must be a positive integer', 400);
  }
  if ((input.duration_minutes as number) > MAX_DURATION_MINUTES) {
    throw new ClinicServiceError(`duration_minutes must be ${MAX_DURATION_MINUTES} or fewer`, 400);
  }
  if (input.is_active !== undefined && typeof input.is_active !== 'boolean') {
    throw new ClinicServiceError('is_active must be a boolean', 400);
  }

  return {
    name,
    description: optionalDescription(input.description),
    duration_minutes: input.duration_minutes as number,
    price: parsePrice(input.price),
    is_active: input.is_active ?? true,
  };
}

const SERVICE_COLUMNS =
  'id, account_id, name, description, duration_minutes, price, is_active, created_at, updated_at';
type ServiceContext = Pick<AccountContext, 'accountId' | 'supabase'>;

export async function listClinicServices(context: ServiceContext): Promise<ClinicService[]> {
  const { data, error } = await context.supabase
    .from('clinic_services')
    .select(SERVICE_COLUMNS)
    .eq('account_id', context.accountId)
    .order('name');
  if (error) {
    console.error('[clinicconnect/services] list failed');
    throw new ClinicServiceError('Services are temporarily unavailable', 500);
  }
  return (data ?? []) as ClinicService[];
}

export async function getClinicService(context: ServiceContext, serviceId: string): Promise<ClinicService | null> {
  const { data, error } = await context.supabase
    .from('clinic_services')
    .select(SERVICE_COLUMNS)
    .eq('account_id', context.accountId)
    .eq('id', serviceId)
    .maybeSingle();
  if (error) {
    console.error('[clinicconnect/services] read failed');
    throw new ClinicServiceError('Service is temporarily unavailable', 500);
  }
  return data as ClinicService | null;
}

export async function saveClinicService(
  context: ServiceContext,
  input: ClinicServiceWrite,
  serviceId?: string,
): Promise<ClinicService> {
  const query = serviceId
    ? context.supabase.from('clinic_services').update(input).eq('account_id', context.accountId).eq('id', serviceId).select(SERVICE_COLUMNS).maybeSingle()
    : context.supabase.from('clinic_services').insert({ ...input, account_id: context.accountId }).select(SERVICE_COLUMNS).single();
  const { data, error } = await query;
  if (error || !data) {
    if (error?.code === '23505') throw new ClinicServiceError('A service with this name already exists', 409);
    if (serviceId && !error && !data) throw new ClinicServiceError('Service not found', 404);
    console.error('[clinicconnect/services] save failed');
    throw new ClinicServiceError('Service could not be saved', 500);
  }
  return data as ClinicService;
}
