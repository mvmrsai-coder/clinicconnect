import type { ClinicDoctor, ClinicDoctorWrite } from './clinic-doctors';

export const DOCTORS_ENDPOINT = '/api/clinicconnect/doctors';

export class ClinicDoctorsClientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ClinicDoctorsClientError';
  }
}

function message(status: number): string {
  if (status === 400) return 'Check the highlighted doctor fields.';
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 403) return 'Only clinic administrators can manage doctors.';
  if (status === 404) return 'That doctor could not be found in this clinic.';
  if (status === 409) return 'The doctor could not be saved because of a conflict.';
  return 'Doctors are temporarily unavailable. Please try again.';
}

type FetchLike = typeof fetch;

async function parse(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function request<T>(response: Response, body: unknown): Promise<T> {
  if (!response.ok) throw new ClinicDoctorsClientError(message(response.status), response.status);
  return body as T;
}

export async function fetchDoctors(fetcher: FetchLike = fetch): Promise<ClinicDoctor[]> {
  const response = await fetcher(DOCTORS_ENDPOINT, { cache: 'no-store' });
  const body = await parse(response);
  const result = await request<{ doctors?: ClinicDoctor[] }>(response, body);
  return result.doctors ?? [];
}

export async function saveDoctorRequest(
  input: ClinicDoctorWrite,
  doctorId?: string,
  fetcher: FetchLike = fetch,
): Promise<ClinicDoctor> {
  const response = await fetcher(doctorId ? `${DOCTORS_ENDPOINT}/${encodeURIComponent(doctorId)}` : DOCTORS_ENDPOINT, {
    method: doctorId ? 'PUT' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await parse(response);
  const result = await request<{ doctor?: ClinicDoctor }>(response, body);
  if (!result.doctor) throw new ClinicDoctorsClientError('Doctor returned an unexpected response.', 500);
  return result.doctor;
}
