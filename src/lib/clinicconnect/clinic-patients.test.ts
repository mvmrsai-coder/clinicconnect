import { describe, expect, it } from 'vitest';
import { ClinicPatientError, validateClinicPatientWrite } from './clinic-patients';

const existing = { contact_id: '11111111-1111-4111-8111-111111111111', date_of_birth: '1980-01-02', gender: 'female', preferred_language: 'en', notes: 'note' };
describe('clinic patient validation', () => {
  it('accepts an existing contact path', () => expect(validateClinicPatientWrite(existing)).toMatchObject(existing));
  it('accepts a new contact path', () => expect(validateClinicPatientWrite({ contact: { phone: '+14155550123', name: 'Ada' } })).toMatchObject({ contact: { phone: '14155550123' } }));
  it('trims optional patient fields', () => expect(validateClinicPatientWrite({ ...existing, gender: ' female ' }).gender).toBe('female'));
  it('rejects missing contact selection', () => expect(() => validateClinicPatientWrite({ notes: 'x' })).toThrow('contact_id or contact is required'));
  it('rejects account overrides', () => expect(() => validateClinicPatientWrite({ ...existing, account_id: 'account-b' })).toThrow('account_id is not accepted'));
  it('rejects malformed contact ids', () => expect(() => validateClinicPatientWrite({ contact_id: 'not-an-id' })).toThrow('valid identifier'));
  it('rejects both contact paths together', () => expect(() => validateClinicPatientWrite({ contact_id: existing.contact_id, contact: { phone: '+14155550123' } })).toThrow('either contact_id or contact'));
  it('validates E.164 phone numbers', () => expect(() => validateClinicPatientWrite({ contact: { phone: '555' } })).toThrow('valid E.164'));
  it('validates email', () => expect(() => validateClinicPatientWrite({ contact: { phone: '+14155550123', email: 'bad' } })).toThrow('email must be valid'));
  it('validates dates', () => expect(() => validateClinicPatientWrite({ ...existing, date_of_birth: '02/01/1980' })).toThrow('YYYY-MM-DD'));
  it('rejects unsupported fields', () => expect(() => validateClinicPatientWrite({ ...existing, is_active: true })).toThrow('Unsupported patient field'));
  it('returns typed errors', () => { try { validateClinicPatientWrite({}); } catch (error) { expect(error).toBeInstanceOf(ClinicPatientError); expect((error as ClinicPatientError).status).toBe(400); } });
  it('allows partial updates without a contact', () => expect(validateClinicPatientWrite({ notes: 'updated' }, true)).toMatchObject({ notes: 'updated' }));
  it('rejects contact account fields', () => expect(() => validateClinicPatientWrite({ contact: { phone: '+14155550123', account_id: 'b' } })).toThrow('Unsupported contact field'));
});
