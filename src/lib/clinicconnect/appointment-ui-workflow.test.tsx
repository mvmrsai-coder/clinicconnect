import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppointmentAgenda } from '@/components/clinicconnect/appointment-agenda';
import { ClinicAppointmentsClientError, fetchAppointments, fetchAvailability, saveAppointmentRequest } from './clinic-appointments-api-client';
import type { ClinicAppointment } from './clinic-appointments';

const appointment = { id: 'a', account_id: 'x', patient_profile_id: 'p', doctor_id: 'd', service_id: 's', appointment_date: '2099-01-15', start_time: '09:00', end_time: '09:30', status: 'pending', source: null, notes: null, confirmation_sent_at: null, reminder_sent_at: null, completed_at: null, cancelled_at: null, created_at: '', updated_at: '' }  as ClinicAppointment;;
const input = { patient_profile_id: '33333333-3333-4333-8333-333333333333', doctor_id: '11111111-1111-4111-8111-111111111111', service_id: '22222222-2222-4222-8222-222222222222', appointment_date: '2099-01-15', start_time: '09:00' };
const agendaProps = { doctorNames: new Map([['d', 'Doctor']]), serviceNames: new Map([['s', 'Service']]), patientNames: new Map([['p', 'Patient']]), canEdit: true, onCreate: vi.fn(), onEdit: vi.fn() };
function response(body: unknown, ok = true, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }

describe('appointment UI workflow boundary', () => {
  it('requests the selected date', async () => { const fetcher = vi.fn().mockResolvedValue(response({ appointments: [] })); await fetchAppointments({ date: '2099-01-15' }, fetcher); expect(fetcher.mock.calls[0][0]).toContain('date=2099-01-15'); });
  it('requests the selected doctor filter', async () => { const fetcher = vi.fn().mockResolvedValue(response({ appointments: [] })); await fetchAppointments({ doctor_id: 'd' }, fetcher); expect(fetcher.mock.calls[0][0]).toContain('doctor_id=d'); });
  it('requests the selected patient filter', async () => { const fetcher = vi.fn().mockResolvedValue(response({ appointments: [] })); await fetchAppointments({ patient_profile_id: 'p' }, fetcher); expect(fetcher.mock.calls[0][0]).toContain('patient_profile_id=p'); });
  it('requests the selected status filter', async () => { const fetcher = vi.fn().mockResolvedValue(response({ appointments: [] })); await fetchAppointments({ status: 'confirmed' }, fetcher); expect(fetcher.mock.calls[0][0]).toContain('status=confirmed'); });
  it('treats no appointments as an empty list', async () => { expect(await fetchAppointments({}, vi.fn().mockResolvedValue(response({ appointments: [] })))).toEqual([]); });
  it('renders the no-appointments next action', () => expect(renderToStaticMarkup(<AppointmentAgenda {...agendaProps} appointments={[]} />)).toContain('New appointment'));
  it('renders pending status', () => expect(renderToStaticMarkup(<AppointmentAgenda {...agendaProps} appointments={[appointment]} />)).toContain('Pending'));
  it('renders confirmed status', () => expect(renderToStaticMarkup(<AppointmentAgenda {...agendaProps} appointments={[{ ...appointment, status: 'confirmed' }]} />)).toContain('Confirmed'));
  it('renders rescheduled status', () => expect(renderToStaticMarkup(<AppointmentAgenda {...agendaProps} appointments={[{ ...appointment, status: 'rescheduled' }]} />)).toContain('Rescheduled'));
  it('renders completed status', () => expect(renderToStaticMarkup(<AppointmentAgenda {...agendaProps} appointments={[{ ...appointment, status: 'completed' }]} />)).toContain('Completed'));
  it('renders no-show status', () => expect(renderToStaticMarkup(<AppointmentAgenda {...agendaProps} appointments={[{ ...appointment, status: 'no_show' }]} />)).toContain('No-show'));
  it('renders patient, doctor, and service labels', () => { const html = renderToStaticMarkup(<AppointmentAgenda {...agendaProps} appointments={[appointment]} />); expect(html).toContain('Patient'); expect(html).toContain('Doctor'); expect(html).toContain('Service'); });
  it('loads an empty availability response without treating it as an error', async () => { expect(await fetchAvailability({ doctor_id: 'd', service_id: 's', date: '2099-01-15' }, vi.fn().mockResolvedValue(response({ availability: { slots: [] } })))).toMatchObject({ slots: [] }); });
  it('does not send account_id to availability', async () => { const fetcher = vi.fn().mockResolvedValue(response({ availability: { slots: [] } })); await fetchAvailability({ doctor_id: 'd', service_id: 's', date: '2099-01-15' }, fetcher); expect(fetcher.mock.calls[0][0]).not.toContain('account_id'); });
  it('surfaces availability authorization errors safely', async () => { await expect(fetchAvailability(input as never, vi.fn().mockResolvedValue(response({ error: 'forbidden' }, false, 403)))).rejects.toMatchObject({ status: 403 }); });
  it('surfaces availability validation errors safely', async () => { await expect(fetchAvailability(input as never, vi.fn().mockResolvedValue(response({ error: 'bad request' }, false, 400)))).rejects.toMatchObject({ status: 400 }); });
  it('posts a new appointment through the API', async () => { const fetcher = vi.fn().mockResolvedValue(response({ appointment })); await saveAppointmentRequest(input, undefined, fetcher); expect(fetcher.mock.calls[0][1].method).toBe('POST'); });
  it('puts an edited appointment through the API', async () => { const fetcher = vi.fn().mockResolvedValue(response({ appointment })); await saveAppointmentRequest({ status: 'cancelled' }, 'a', fetcher); expect(fetcher.mock.calls[0][1].method).toBe('PUT'); });
  it('maps conflict to the controlled client error', async () => { await expect(saveAppointmentRequest(input, undefined, vi.fn().mockResolvedValue(response({ code: 'appointment_conflict' }, false, 409)))).rejects.toMatchObject({ status: 409, code: 'appointment_conflict' }); });
  it('maps unauthorized mutation to the controlled client error', async () => { try { await saveAppointmentRequest(input, undefined, vi.fn().mockResolvedValue(response({ error: 'forbidden' }, false, 403))); } catch (error) { expect(error).toBeInstanceOf(ClinicAppointmentsClientError); expect((error as ClinicAppointmentsClientError).status).toBe(403); } });
  it('does not expose database text in client errors', async () => { try { await saveAppointmentRequest(input, undefined, vi.fn().mockResolvedValue(response({ error: 'constraint appointments_no_overlapping_active_doctor_time' }, false, 409))); } catch (error) { expect((error as Error).message).not.toContain('appointments_no_overlapping'); } });
});
