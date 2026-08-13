import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCurrentAccount, requireRole } from '@/lib/auth/account';
import { listClinicDoctors, saveClinicDoctor } from '@/lib/clinicconnect/clinic-doctors';
import { GET, POST } from './route';

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: vi.fn(),
  requireRole: vi.fn(),
  toErrorResponse: (error: unknown) => {
    const typed = error as { message?: string; status?: number };
    return NextResponse.json({ error: typed.status === 403 ? typed.message : 'Internal server error' }, { status: typed.status ?? 500 });
  },
}));

vi.mock('@/lib/clinicconnect/clinic-doctors', async () => {
  const actual = await vi.importActual<typeof import('@/lib/clinicconnect/clinic-doctors')>('@/lib/clinicconnect/clinic-doctors');
  return { ...actual, listClinicDoctors: vi.fn(), saveClinicDoctor: vi.fn() };
});

const context = { accountId: 'account-a', role: 'owner', userId: 'user-a', account: { id: 'account-a', name: 'A' }, supabase: {} };
const doctor = { id: 'doctor-a', account_id: 'account-a', name: 'Dr. Ada', specialization: null, qualification: null, display_name: null, phone: null, email: null, bio: null, is_active: true, created_at: '', updated_at: '' };

describe('ClinicConnect doctor route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentAccount).mockResolvedValue(context as never);
    vi.mocked(requireRole).mockResolvedValue(context as never);
    vi.mocked(listClinicDoctors).mockResolvedValue([doctor] as never);
    vi.mocked(saveClinicDoctor).mockResolvedValue(doctor as never);
  });
  it('lists doctors from the authenticated account context', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ doctors: [doctor] });
  });
  it('creates a valid doctor for an authorized admin', async () => {
    const response = await POST(new Request('http://localhost/api/clinicconnect/doctors', { method: 'POST', body: JSON.stringify({ name: 'Dr. Ada', is_active: true }) }));
    expect(response.status).toBe(200);
    expect(saveClinicDoctor).toHaveBeenCalledWith(context, expect.objectContaining({ name: 'Dr. Ada', is_active: true }));
  });
  it('rejects non-admin modification before database access', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(Object.assign(new Error('Insufficient role'), { status: 403 }));
    const response = await POST(new Request('http://localhost/api/clinicconnect/doctors', { method: 'POST', body: JSON.stringify({ name: 'Dr. Ada' }) }));
    expect(response.status).toBe(403);
    expect(saveClinicDoctor).not.toHaveBeenCalled();
  });
  it('rejects account_id tenancy override attempts', async () => {
    const response = await POST(new Request('http://localhost/api/clinicconnect/doctors', { method: 'POST', body: JSON.stringify({ account_id: 'account-b', name: 'Dr. B' }) }));
    expect(response.status).toBe(400);
    expect(saveClinicDoctor).not.toHaveBeenCalled();
  });
});
