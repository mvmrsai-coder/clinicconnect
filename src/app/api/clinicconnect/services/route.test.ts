import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentAccount, requireRole } from '@/lib/auth/account';
import { listClinicServices, saveClinicService } from '@/lib/clinicconnect/clinic-services';
import { GET, POST } from './route';

vi.mock('@/lib/auth/account', () => ({ getCurrentAccount: vi.fn(), requireRole: vi.fn(), toErrorResponse: (error: unknown) => { const typed = error as { message?: string; status?: number }; return NextResponse.json({ error: typed.status === 403 ? typed.message : 'Internal server error' }, { status: typed.status ?? 500 }); } }));
vi.mock('@/lib/clinicconnect/clinic-services', async () => { const actual = await vi.importActual<typeof import('@/lib/clinicconnect/clinic-services')>('@/lib/clinicconnect/clinic-services'); return { ...actual, listClinicServices: vi.fn(), saveClinicService: vi.fn() }; });

const context = { accountId: 'account-a', role: 'owner', userId: 'user-a', account: { id: 'account-a', name: 'A' }, supabase: {} };
const service = { id: 'service-a', account_id: 'account-a', name: 'Consultation', description: null, duration_minutes: 30, price: null, is_active: true, created_at: '', updated_at: '' };

describe('ClinicConnect service route', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getCurrentAccount).mockResolvedValue(context as never); vi.mocked(requireRole).mockResolvedValue(context as never); vi.mocked(listClinicServices).mockResolvedValue([service] as never); vi.mocked(saveClinicService).mockResolvedValue(service as never); });
  it('lists services from the authenticated account context', async () => { const response = await GET(); expect(response.status).toBe(200); expect(await response.json()).toEqual({ services: [service] }); });
  it('creates a valid service for an authorized admin', async () => { const response = await POST(new Request('http://localhost/api/clinicconnect/services', { method: 'POST', body: JSON.stringify({ name: 'Consultation', duration_minutes: 30, price: null, is_active: true }) })); expect(response.status).toBe(200); expect(saveClinicService).toHaveBeenCalledWith(context, expect.objectContaining({ name: 'Consultation', duration_minutes: 30 })); });
  it('rejects unauthorized mutation before database access', async () => { vi.mocked(requireRole).mockRejectedValueOnce(Object.assign(new Error('Insufficient role'), { status: 403 })); const response = await POST(new Request('http://localhost/api/clinicconnect/services', { method: 'POST', body: JSON.stringify({ name: 'Consultation', duration_minutes: 30 }) })); expect(response.status).toBe(403); expect(saveClinicService).not.toHaveBeenCalled(); });
  it('rejects account_id tenancy override attempts', async () => { const response = await POST(new Request('http://localhost/api/clinicconnect/services', { method: 'POST', body: JSON.stringify({ account_id: 'account-b', name: 'Other', duration_minutes: 30 }) })); expect(response.status).toBe(400); expect(saveClinicService).not.toHaveBeenCalled(); });
});
