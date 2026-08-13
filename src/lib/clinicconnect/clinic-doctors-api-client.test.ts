import { describe, expect, it, vi } from 'vitest';

import { fetchDoctors, saveDoctorRequest } from './clinic-doctors-api-client';

const doctor = { id: 'doctor-a', account_id: 'account-a', name: 'Dr. Ada', specialization: null, qualification: null, display_name: null, phone: null, email: null, bio: null, is_active: true, created_at: '', updated_at: '' };
const write = { name: 'Dr. Ada', specialization: null, qualification: null, display_name: null, phone: null, email: null, bio: null, is_active: true };

describe('clinic doctor API client', () => {
  it('renders/list-loads account-scoped doctors without account_id in the URL', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/clinicconnect/doctors');
      expect(String(input)).not.toContain('account_id');
      return new Response(JSON.stringify({ doctors: [doctor] }), { status: 200 });
    });
    await expect(fetchDoctors(fetcher)).resolves.toEqual([doctor]);
  });
  it('returns an empty list for an empty clinic', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ doctors: [] }), { status: 200 }));
    await expect(fetchDoctors(fetcher)).resolves.toEqual([]);
  });
  it('creates a doctor with the supported write fields only', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual(write);
      return new Response(JSON.stringify({ doctor }), { status: 200 });
    });
    await expect(saveDoctorRequest(write, undefined, fetcher)).resolves.toEqual(doctor);
  });
  it('updates and deactivates a doctor through the same non-destructive route', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/clinicconnect/doctors/doctor-a');
      expect(init?.method).toBe('PUT');
      expect(JSON.parse(String(init?.body))).toEqual({ ...write, is_active: false });
      return new Response(JSON.stringify({ doctor: { ...doctor, is_active: false } }), { status: 200 });
    });
    await expect(saveDoctorRequest({ ...write, is_active: false }, 'doctor-a', fetcher)).resolves.toMatchObject({ is_active: false });
  });
  it('maps unauthorized modifications to a safe error', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }));
    await expect(saveDoctorRequest(write, undefined, fetcher)).rejects.toMatchObject({ status: 403 });
  });
});
