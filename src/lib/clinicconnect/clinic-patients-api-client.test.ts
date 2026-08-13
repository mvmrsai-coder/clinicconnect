import { describe, expect, it, vi } from 'vitest';
import { ClinicPatientsClientError, fetchPatient, fetchPatients, savePatientRequest, searchPatientContacts } from './clinic-patients-api-client';
const patient = { id: 'p' } as never;
function response(body: unknown, ok = true, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }
describe('clinic patient API client', () => {
  it('lists patients', async () => expect(await fetchPatients(vi.fn().mockResolvedValue(response({ patients: [patient] })))).toEqual([patient]));
  it('loads patient detail', async () => expect(await fetchPatient('p', vi.fn().mockResolvedValue(response({ patient })))).toEqual(patient));
  it('searches contacts through the scoped endpoint', async () => { const fetcher = vi.fn().mockResolvedValue(response({ contacts: [] })); await searchPatientContacts('Ada', fetcher); expect(fetcher.mock.calls[0][0]).toContain('contacts_query=Ada'); });
  it('saves a patient', async () => expect(await savePatientRequest({ contact_id: 'c' }, undefined, vi.fn().mockResolvedValue(response({ patient })))).toEqual(patient));
  it('maps conflict status to a typed error', async () => await expect(fetchPatients(vi.fn().mockResolvedValue(response({ error: 'conflict' }, false, 409)))).rejects.toMatchObject({ status: 409 }));
  it('does not leak response internals', async () => { try { await fetchPatients(vi.fn().mockResolvedValue(response({}, false, 500))); } catch (error) { expect(error).toBeInstanceOf(ClinicPatientsClientError); expect((error as Error).message).not.toContain('Postgres'); } });
});
