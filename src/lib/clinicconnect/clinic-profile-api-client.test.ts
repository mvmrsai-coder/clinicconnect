import { describe, expect, it, vi } from 'vitest';

import {
  fetchClinicProfile,
  saveClinicProfileRequest,
} from './clinic-profile-api-client';

const profile = {
  id: 'profile-a',
  clinic_name: 'Clinic A',
  clinic_type: null,
  phone: null,
  email: null,
  address: null,
  city: null,
  timezone: 'Asia/Kolkata',
  working_days: null,
  booking_enabled: true,
  onboarding_status: 'REGISTERED',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('clinic profile API client', () => {
  it('reads profile data without an account selector', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/clinicconnect/profile');
      expect(String(input)).not.toContain('account_id');
      expect(init?.cache).toBe('no-store');
      return new Response(JSON.stringify({ profile }), { status: 200 });
    });
    await expect(fetchClinicProfile(fetcher)).resolves.toEqual(profile);
  });

  it('sends only profile fields and never account_id or onboarding_status', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/clinicconnect/profile');
      expect(init?.method).toBe('PUT');
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ clinic_name: 'Clinic A', clinic_type: null, phone: null, email: null, address: null, city: null, timezone: 'Asia/Kolkata', booking_enabled: true });
      expect(body).not.toHaveProperty('account_id');
      expect(body).not.toHaveProperty('onboarding_status');
      return new Response(JSON.stringify({ profile }), { status: 200 });
    });
    await expect(saveClinicProfileRequest({ clinic_name: 'Clinic A', timezone: 'Asia/Kolkata', booking_enabled: true, clinic_type: null, phone: null, email: null, address: null, city: null }, fetcher)).resolves.toEqual(profile);
  });

  it('maps unauthorized responses to a safe client error', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }));
    await expect(saveClinicProfileRequest({ clinic_name: 'Clinic A', clinic_type: null, phone: null, email: null, address: null, city: null, timezone: 'Asia/Kolkata', booking_enabled: true }, fetcher)).rejects.toMatchObject({ status: 403, message: 'Only clinic administrators can edit this profile.' });
  });

  it('does not expose database error details', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: 'SQLSTATE 42501 details' }), { status: 500 }));
    await expect(fetchClinicProfile(fetcher)).rejects.toMatchObject({ status: 500, message: 'Clinic profile is temporarily unavailable. Please try again.' });
  });
});
