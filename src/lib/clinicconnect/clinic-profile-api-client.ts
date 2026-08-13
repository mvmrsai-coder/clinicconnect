import type { ClinicProfile, ClinicProfileWrite } from './clinic-profile';

export const CLINIC_PROFILE_ENDPOINT = '/api/clinicconnect/profile';

export class ClinicProfileClientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ClinicProfileClientError';
  }
}

function errorMessage(status: number): string {
  if (status === 400) return 'Check the highlighted clinic profile fields.';
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 403) return 'Only clinic administrators can edit this profile.';
  if (status === 409) return 'The profile changed elsewhere. Refresh and try again.';
  return 'Clinic profile is temporarily unavailable. Please try again.';
}

type FetchLike = typeof fetch;

async function bodyOf(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function fetchClinicProfile(
  fetcher: FetchLike = fetch,
): Promise<ClinicProfile | null> {
  const response = await fetcher(CLINIC_PROFILE_ENDPOINT, { cache: 'no-store' });
  const body = await bodyOf(response);
  if (!response.ok) throw new ClinicProfileClientError(errorMessage(response.status), response.status);
  return (body && typeof body === 'object' && 'profile' in body
    ? body.profile
    : null) as ClinicProfile | null;
}

export async function saveClinicProfileRequest(
  input: ClinicProfileWrite,
  fetcher: FetchLike = fetch,
): Promise<ClinicProfile> {
  const response = await fetcher(CLINIC_PROFILE_ENDPOINT, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await bodyOf(response);
  if (!response.ok) throw new ClinicProfileClientError(errorMessage(response.status), response.status);
  const profile = body && typeof body === 'object' && 'profile' in body ? body.profile : null;
  if (!profile || typeof profile !== 'object') {
    throw new ClinicProfileClientError('Clinic profile returned an unexpected response.', 500);
  }
  return profile as ClinicProfile;
}
