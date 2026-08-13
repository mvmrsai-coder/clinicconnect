import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PatientList } from './patient-list';
const patient = { id: 'p', account_id: 'a', contact_id: 'c', date_of_birth: '1980-01-02', gender: null, preferred_language: 'en', notes: null, created_at: '', updated_at: '', contact: { id: 'c', phone: '+14155550123', name: 'Ada', email: null, company: null } };
describe('PatientList', () => {
  it('renders patient identity and profile fields', () => expect(renderToStaticMarkup(<PatientList patients={[patient]} canEdit onCreate={vi.fn()} onEdit={vi.fn()} />)).toContain('Ada'));
  it('renders an empty state', () => expect(renderToStaticMarkup(<PatientList patients={[]} canEdit={false} onCreate={vi.fn()} onEdit={vi.fn()} />)).toContain('No patients yet'));
  it('gates editing for read-only members', () => expect(renderToStaticMarkup(<PatientList patients={[patient]} canEdit={false} onCreate={vi.fn()} onEdit={vi.fn()} />)).toContain('disabled'));
});
