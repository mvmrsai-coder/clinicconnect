import { describe, expect, it, vi } from 'vitest';
import { fetchSchedules, saveScheduleRequest } from './clinic-schedules-api-client';

const schedule = { id: 'schedule-a', account_id: 'account-a', doctor_id: 'doctor-a', day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', slot_duration_minutes: 30, is_active: true, created_at: '', updated_at: '' };
const write = { doctor_id: 'doctor-a', day_of_week: 1, start_time: '09:00', end_time: '17:00', slot_duration_minutes: 30, is_active: true };

describe('clinic schedule API client', () => {
  it('loads schedules and ignores account_id as an authorization filter', async () => { const fetcher = vi.fn(async (input: RequestInfo | URL) => { expect(String(input)).toBe('/api/clinicconnect/schedules?doctor_id=doctor-a'); expect(String(input)).not.toContain('account_id'); return new Response(JSON.stringify({ schedules: [schedule] }), { status: 200 }); }); await expect(fetchSchedules('doctor-a', fetcher)).resolves.toEqual([schedule]); });
  it('renders an empty schedule state', async () => { const fetcher = vi.fn(async () => new Response(JSON.stringify({ schedules: [] }), { status: 200 })); await expect(fetchSchedules(undefined, fetcher)).resolves.toEqual([]); });
  it('creates and updates schedules', async () => { const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { expect(String(input)).toBe('/api/clinicconnect/schedules/schedule-a'); expect(init?.method).toBe('PUT'); return new Response(JSON.stringify({ schedule: { ...schedule, is_active: false } }), { status: 200 }); }); await expect(saveScheduleRequest({ ...write, is_active: false }, 'schedule-a', fetcher)).resolves.toMatchObject({ is_active: false }); });
  it('maps overlap and authorization errors safely', async () => { const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: 'overlap' }), { status: 409 })); await expect(saveScheduleRequest(write, undefined, fetcher)).rejects.toMatchObject({ status: 409 }); });
});
