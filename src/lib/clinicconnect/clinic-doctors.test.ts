import { describe, expect, it } from 'vitest';

import { ClinicDoctorError, validateClinicDoctorWrite } from './clinic-doctors';

const valid = {
  name: '  Dr. Ada Lovelace  ',
  specialization: 'Cardiology',
  qualification: 'MD',
  display_name: '',
  phone: ' +91 90000 00000 ',
  email: 'ada@example.com',
  bio: 'Experienced clinician',
  is_active: true,
};

describe('clinic doctor validation', () => {
  it('normalizes supported fields and empty optional values', () => {
    expect(validateClinicDoctorWrite(valid)).toMatchObject({ name: 'Dr. Ada Lovelace', display_name: null, phone: '+91 90000 00000', is_active: true });
  });
  it('requires a non-empty name', () => {
    expect(() => validateClinicDoctorWrite({ ...valid, name: '  ' })).toThrow('name is required');
  });
  it('validates optional email format', () => {
    expect(() => validateClinicDoctorWrite({ ...valid, email: 'not-an-email' })).toThrow('email must be valid');
  });
  it('requires is_active to remain boolean', () => {
    expect(() => validateClinicDoctorWrite({ ...valid, is_active: 'false' })).toThrow('is_active must be a boolean');
  });
  it('rejects browser account selectors', () => {
    expect(() => validateClinicDoctorWrite({ ...valid, account_id: 'account-b' })).toThrow('account_id is not accepted');
  });
  it('returns controlled validation errors without SQL details', () => {
    try { validateClinicDoctorWrite({ ...valid, email: 'bad' }); } catch (error) {
      expect(error).toBeInstanceOf(ClinicDoctorError);
      expect((error as ClinicDoctorError).status).toBe(400);
      expect((error as Error).message).not.toContain('SQL');
    }
  });
});
