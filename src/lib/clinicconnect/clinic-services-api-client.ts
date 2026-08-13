import type { ClinicService, ClinicServiceWrite } from './clinic-services';

export const SERVICES_ENDPOINT = '/api/clinicconnect/services';

export class ClinicServicesClientError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ClinicServicesClientError'; }
}

function message(status: number): string {
  if (status === 400) return 'Check the highlighted service fields.';
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 403) return 'Only clinic administrators can manage services.';
  if (status === 404) return 'That service could not be found in this clinic.';
  if (status === 409) return 'A service with this name already exists.';
  return 'Services are temporarily unavailable. Please try again.';
}

type FetchLike = typeof fetch;
async function parse(response: Response): Promise<unknown> { return response.json().catch(() => null); }
async function check<T>(response: Response, body: unknown): Promise<T> {
  if (!response.ok) throw new ClinicServicesClientError(message(response.status), response.status);
  return body as T;
}

export async function fetchServices(fetcher: FetchLike = fetch): Promise<ClinicService[]> {
  const response = await fetcher(SERVICES_ENDPOINT, { cache: 'no-store' });
  const result = await check<{ services?: ClinicService[] }>(response, await parse(response));
  return result.services ?? [];
}

export async function saveServiceRequest(input: ClinicServiceWrite, serviceId?: string, fetcher: FetchLike = fetch): Promise<ClinicService> {
  const response = await fetcher(serviceId ? `${SERVICES_ENDPOINT}/${encodeURIComponent(serviceId)}` : SERVICES_ENDPOINT, {
    method: serviceId ? 'PUT' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = await check<{ service?: ClinicService }>(response, await parse(response));
  if (!result.service) throw new ClinicServicesClientError('Service returned an unexpected response.', 500);
  return result.service;
}
