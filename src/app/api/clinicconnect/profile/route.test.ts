import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireRole } from '@/lib/auth/account';
import {
  readClinicProfile,
  saveClinicProfile,
} from '@/lib/clinicconnect/clinic-profile';
import { GET, PUT } from './route';

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: vi.fn(),
  requireRole: vi.fn(),
  toErrorResponse: (error: unknown) => {
    const typed = error as { message?: string; status?: number };
    return NextResponse.json(
      { error: typed.status === 403 ? typed.message : 'Internal server error' },
      { status: typed.status ?? 500 },
    );
  },
}));

vi.mock('@/lib/clinicconnect/clinic-profile', async () => {
  const actual = await vi.importActual<typeof import('@/lib/clinicconnect/clinic-profile')>('@/lib/clinicconnect/clinic-profile');
  return {
    ...actual,
    readClinicProfile: vi.fn(),
    saveClinicProfile: vi.fn(),
  };
});

const context = { accountId: 'account-a', role: 'owner', userId: 'user-a', account: { id: 'account-a', name: 'A' }, supabase: {} };
const profile = { id: 'profile-a', clinic_name: 'Clinic A', clinic_type: null, phone: null, email: null, address: null, city: null, timezone: 'Asia/Kolkata', working_days: null, booking_enabled: true, onboarding_status: 'REGISTERED', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

describe('ClinicConnect clinic profile route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(context as never);
    vi.mocked(readClinicProfile).mockResolvedValue(profile as never);
    vi.mocked(saveClinicProfile).mockResolvedValue(profile as never);
  });

  it('returns profile data for the authenticated account', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profile });
  });

  it('saves an authorized profile update without accepting account scope', async () => {
    const response = await PUT(new Request('http://localhost/api/clinicconnect/profile', { method: 'PUT', body: JSON.stringify({ clinic_name: 'Clinic A', timezone: 'Asia/Kolkata', booking_enabled: true }) }));
    expect(response.status).toBe(200);
    expect(saveClinicProfile).toHaveBeenCalledWith(context, { clinic_name: 'Clinic A', clinic_type: null, phone: null, email: null, address: null, city: null, timezone: 'Asia/Kolkata', booking_enabled: true });
  });

  it('rejects non-admin callers through server authorization', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(Object.assign(new Error('This action requires the admin role or higher'), { status: 403 }));
    const response = await PUT(new Request('http://localhost/api/clinicconnect/profile', { method: 'PUT', body: JSON.stringify({ clinic_name: 'Clinic A', timezone: 'Asia/Kolkata', booking_enabled: true }) }));
    expect(response.status).toBe(403);
    expect(saveClinicProfile).not.toHaveBeenCalled();
  });

  it('rejects cross-account modification attempts from the browser', async () => {
    const response = await PUT(new Request('http://localhost/api/clinicconnect/profile', { method: 'PUT', body: JSON.stringify({ account_id: 'account-b', clinic_name: 'Clinic B', timezone: 'Asia/Kolkata', booking_enabled: true }) }));
    expect(response.status).toBe(400);
    expect(saveClinicProfile).not.toHaveBeenCalled();
    expect((await response.json()).error).not.toContain('SQL');
  });

  it('maps database failures to a controlled error', async () => {
    vi.mocked(saveClinicProfile).mockRejectedValueOnce(Object.assign(new Error('Clinic profile could not be saved'), { status: 500 }));
    const response = await PUT(new Request('http://localhost/api/clinicconnect/profile', { method: 'PUT', body: JSON.stringify({ clinic_name: 'Clinic A', timezone: 'Asia/Kolkata', booking_enabled: true }) }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('42501');
  });
});
