import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentAccount, requireRole } from '@/lib/auth/account';
import { listClinicSchedules, saveClinicSchedule } from '@/lib/clinicconnect/clinic-schedules';
import { GET, POST } from './route';

vi.mock('@/lib/auth/account', () => ({ getCurrentAccount: vi.fn(), requireRole: vi.fn(), toErrorResponse: (error: unknown) => { const typed = error as { message?: string; status?: number }; return NextResponse.json({ error: typed.status === 403 ? typed.message : 'Internal server error' }, { status: typed.status ?? 500 }); } }));
vi.mock('@/lib/clinicconnect/clinic-schedules', async () => { const actual = await vi.importActual<typeof import('@/lib/clinicconnect/clinic-schedules')>('@/lib/clinicconnect/clinic-schedules'); return { ...actual, listClinicSchedules: vi.fn(), saveClinicSchedule: vi.fn() }; });

const context = { accountId: 'account-a', role: 'owner', userId: 'user-a', account: { id: 'account-a', name: 'A' }, supabase: {} };
const schedule = { id: 'schedule-a', account_id: 'account-a', doctor_id: 'doctor-a', day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', slot_duration_minutes: 30, is_active: true, created_at: '', updated_at: '' };

describe('ClinicConnect schedule route', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getCurrentAccount).mockResolvedValue(context as never); vi.mocked(requireRole).mockResolvedValue(context as never); vi.mocked(listClinicSchedules).mockResolvedValue([schedule] as never); vi.mocked(saveClinicSchedule).mockResolvedValue(schedule as never); });
  it('lists schedules using authenticated account scope even with a remote account_id filter', async () => { const response = await GET(new Request('http://localhost/api/clinicconnect/schedules?account_id=account-b')); expect(response.status).toBe(200); expect(await response.json()).toEqual({ schedules: [schedule] }); expect(listClinicSchedules).toHaveBeenCalledWith(context, undefined); });
  it('creates a valid schedule for an authorized admin', async () => { const response = await POST(new Request('http://localhost/api/clinicconnect/schedules', { method: 'POST', body: JSON.stringify({ doctor_id: 'doctor-a', day_of_week: 1, start_time: '09:00', end_time: '17:00', slot_duration_minutes: 30, is_active: true }) })); expect(response.status).toBe(200); expect(saveClinicSchedule).toHaveBeenCalledWith(context, expect.objectContaining({ doctor_id: 'doctor-a', day_of_week: 1 })); });
  it('rejects unauthorized mutation before database access', async () => { vi.mocked(requireRole).mockRejectedValueOnce(Object.assign(new Error('Insufficient role'), { status: 403 })); const response = await POST(new Request('http://localhost/api/clinicconnect/schedules', { method: 'POST', body: JSON.stringify({ doctor_id: 'doctor-a', day_of_week: 1, start_time: '09:00', end_time: '17:00', slot_duration_minutes: 30, is_active: true }) })); expect(response.status).toBe(403); expect(saveClinicSchedule).not.toHaveBeenCalled(); });
  it('rejects account_id tenancy override attempts', async () => { const response = await POST(new Request('http://localhost/api/clinicconnect/schedules', { method: 'POST', body: JSON.stringify({ account_id: 'account-b', doctor_id: 'doctor-b', day_of_week: 1, start_time: '09:00', end_time: '17:00', slot_duration_minutes: 30, is_active: true }) })); expect(response.status).toBe(400); expect(saveClinicSchedule).not.toHaveBeenCalled(); });
});
