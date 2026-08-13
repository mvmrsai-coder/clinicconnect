import { describe, expect, it, vi } from 'vitest';
import { ClinicAppointmentsClientError, fetchAppointments, fetchAvailability, fetchAppointment, saveAppointmentRequest } from './clinic-appointments-api-client';
const appointment = { id: 'appointment-a' } as never;
function response(body: unknown, ok = true, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }
describe('appointment API client', () => {
  it('lists appointments with filters', async () => { const fetcher = vi.fn().mockResolvedValue(response({ appointments: [appointment] })); expect(await fetchAppointments({ date: '2099-01-15', status: 'confirmed' }, fetcher)).toEqual([appointment]); expect(fetcher.mock.calls[0][0]).toContain('status=confirmed'); });
  it('loads appointment detail', async () => expect(await fetchAppointment('appointment-a', vi.fn().mockResolvedValue(response({ appointment })))).toEqual(appointment));
  it('loads availability', async () => expect(await fetchAvailability({ doctor_id: 'd', service_id: 's', date: '2099-01-15' }, vi.fn().mockResolvedValue(response({ availability: { slots: [] } })))).toMatchObject({ slots: [] }));
  it('saves an appointment', async () => expect(await saveAppointmentRequest({ status: 'cancelled' }, 'appointment-a', vi.fn().mockResolvedValue(response({ appointment })))).toEqual(appointment));
  it('maps database conflict responses safely', async () => { try { await saveAppointmentRequest({}, undefined, vi.fn().mockResolvedValue(response({ error: 'conflict', code: 'appointment_conflict' }, false, 409))); } catch (error) { expect(error).toBeInstanceOf(ClinicAppointmentsClientError); expect(error).toMatchObject({ status: 409, code: 'appointment_conflict' }); expect((error as Error).message).not.toContain('constraint'); } });
});
