import {
  isClinicOnboardingStatus,
  type ClinicOnboardingSnapshot,
  type ClinicOnboardingStatus,
} from '@/lib/clinicconnect/onboarding-types';

export const ONBOARDING_ENDPOINT = '/api/clinicconnect/onboarding';
export const ONBOARDING_STATUS_ENDPOINT =
  '/api/clinicconnect/onboarding/status';

export class OnboardingClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'OnboardingClientError';
  }
}

export function onboardingErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return 'The onboarding request was invalid. Please refresh and try again.';
    case 401:
      return 'Your session has expired. Sign in again to view onboarding.';
    case 403:
      return 'You do not have permission to change onboarding status.';
    case 409:
      return 'Onboarding prerequisites changed. Review the checklist and try again.';
    case 500:
      return 'Onboarding is temporarily unavailable. Please try again shortly.';
    default:
      return 'We could not complete that onboarding request. Please try again.';
  }
}

type FetchLike = typeof fetch;

async function parseResponse(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function fetchOnboarding(
  fetcher: FetchLike = fetch,
): Promise<ClinicOnboardingSnapshot> {
  const response = await fetcher(ONBOARDING_ENDPOINT, { cache: 'no-store' });
  const body = await parseResponse(response);
  if (!response.ok) {
    throw new OnboardingClientError(
      onboardingErrorMessage(response.status),
      response.status,
    );
  }

  const snapshot =
    typeof body === 'object' && body !== null && 'onboarding' in body
      ? body.onboarding
      : null;
  if (!snapshot || typeof snapshot !== 'object') {
    throw new OnboardingClientError(
      'Onboarding returned an unexpected response.',
      500,
    );
  }
  return snapshot as ClinicOnboardingSnapshot;
}

export async function transitionOnboarding(
  status: ClinicOnboardingStatus,
  fetcher: FetchLike = fetch,
): Promise<ClinicOnboardingSnapshot> {
  if (!isClinicOnboardingStatus(status)) {
    throw new OnboardingClientError('Invalid onboarding status.', 400);
  }

  const response = await fetcher(ONBOARDING_STATUS_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const body = await parseResponse(response);
  if (!response.ok) {
    throw new OnboardingClientError(
      onboardingErrorMessage(response.status),
      response.status,
    );
  }

  const snapshot =
    typeof body === 'object' && body !== null && 'onboarding' in body
      ? body.onboarding
      : null;
  if (!snapshot || typeof snapshot !== 'object') {
    throw new OnboardingClientError(
      'Onboarding returned an unexpected response.',
      500,
    );
  }
  return snapshot as ClinicOnboardingSnapshot;
}
