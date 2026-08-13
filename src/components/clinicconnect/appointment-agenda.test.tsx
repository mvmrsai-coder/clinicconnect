import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppointmentAgenda } from './appointment-agenda';

const appointment = { id: 'appointment-a', account_id: 'account-a', patient_profile_id: 'patient-a', doctor_id: 'doctor-a', service_id: 'service-a', appointment_date: '2099-01-15', start_time: '09:00:00', end_time: '09:30:00', status: 'confirmed', source: null, notes: 'Bring records', confirmation_sent_at: null, reminder_sent_at: null, completed_at: null, cancelled_at: null, created_at: '', updated_at: '' } as const;
const props = { doctorNames: new Map([['doctor-a', 'Dr. Ada']]), serviceNames: new Map([['service-a', 'Consultation']]), patientNames: new Map([['patient-a', 'Ada Patient']]), canEdit: true, onCreate: vi.fn(), onEdit: vi.fn() };
describe('AppointmentAgenda', () => {
  it('renders time, patient, doctor, service, and status', () => { const html = renderToStaticMarkup(<AppointmentAgenda {...props} appointments={[appointment]} />); expect(html).toContain('09:00'); expect(html).toContain('Ada Patient'); expect(html).toContain('Dr. Ada'); expect(html).toContain('Consultation'); expect(html).toContain('Confirmed'); });
  it('renders the selected-date empty state', () => expect(renderToStaticMarkup(<AppointmentAgenda {...props} appointments={[]} />)).toContain('No appointments on this date'));
  it('offers a gated create action to viewers', () => expect(renderToStaticMarkup(<AppointmentAgenda {...props} canEdit={false} appointments={[]} />)).toContain('disabled'));
  it('renders cancellation as a terminal status', () => expect(renderToStaticMarkup(<AppointmentAgenda {...props} appointments={[{ ...appointment, status: 'cancelled' }]} />)).toContain('Cancelled'));
});
