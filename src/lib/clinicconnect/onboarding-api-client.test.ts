import { describe, expect, it, vi } from 'vitest';

import {
  fetchOnboarding,
  onboardingErrorMessage,
  transitionOnboarding,
} from './onboarding-api-client';

const snapshot = {
  onboardingStatus: 'REGISTERED' as const,
  bookingEnabled: true,
  steps: [],
  completedRequiredSteps: 1,
  requiredSteps: 4,
  progressPercent: 25,
  nextStep: 'doctors' as const,
  readyToTest: false,
  canStartTesting: false,
  canMarkReady: false,
  canGoLive: false,
};

describe('ClinicConnect onboarding API client', () => {
  it('reads the account-scoped snapshot from the same-origin endpoint', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/clinicconnect/onboarding');
      expect(init?.cache).toBe('no-store');
      return new Response(JSON.stringify({ onboarding: snapshot }), { status: 200 });
    });

    await expect(fetchOnboarding(fetcher)).resolves.toEqual(snapshot);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('never adds an account selector to the GET request', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).not.toContain('account_id');
      return new Response(JSON.stringify({ onboarding: snapshot }), { status: 200 });
    });
    await fetchOnboarding(fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('posts exactly the requested status without account data', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/clinicconnect/onboarding/status');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({ 'content-type': 'application/json' });
      expect(init?.body).toBe(JSON.stringify({ status: 'TESTING' }));
      expect(String(init?.body)).not.toContain('account_id');
      return new Response(JSON.stringify({ onboarding: { ...snapshot, onboardingStatus: 'TESTING' } }), { status: 200 });
    });

    const result = await transitionOnboarding('TESTING', fetcher);
    expect(result.onboardingStatus).toBe('TESTING');
  });

  it.each([
    [400, 'The onboarding request was invalid. Please refresh and try again.'],
    [401, 'Your session has expired. Sign in again to view onboarding.'],
    [403, 'You do not have permission to change onboarding status.'],
    [409, 'Onboarding prerequisites changed. Review the checklist and try again.'],
    [500, 'Onboarding is temporarily unavailable. Please try again shortly.'],
  ])('maps HTTP %s to a safe user-facing message', (status, message) => {
    expect(onboardingErrorMessage(status)).toBe(message);
  });

  it('surfaces a typed error for a forbidden transition', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }));
    await expect(transitionOnboarding('READY', fetcher)).rejects.toMatchObject({ status: 403 });
  });
});
