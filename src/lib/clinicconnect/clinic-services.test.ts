import { describe, expect, it } from 'vitest';
import { ClinicServiceError, validateClinicServiceWrite } from './clinic-services';

const valid = { name: '  Consultation  ', description: 'General visit', duration_minutes: 30, price: '1250.50', is_active: true };

describe('clinic service validation', () => {
  it('normalizes supported fields', () => expect(validateClinicServiceWrite(valid)).toEqual({ name: 'Consultation', description: 'General visit', duration_minutes: 30, price: 1250.5, is_active: true }));
  it('requires a non-empty name', () => expect(() => validateClinicServiceWrite({ ...valid, name: ' ' })).toThrow('name is required'));
  it('rejects invalid durations', () => {
    expect(() => validateClinicServiceWrite({ ...valid, duration_minutes: 0 })).toThrow('positive integer');
    expect(() => validateClinicServiceWrite({ ...valid, duration_minutes: 30.5 })).toThrow('positive integer');
    expect(() => validateClinicServiceWrite({ ...valid, duration_minutes: 1441 })).toThrow('1440');
  });
  it('rejects invalid and negative prices', () => {
    expect(() => validateClinicServiceWrite({ ...valid, price: -1 })).toThrow('non-negative');
    expect(() => validateClinicServiceWrite({ ...valid, price: '12.345' })).toThrow('non-negative');
  });
  it('preserves empty price as null', () => expect(validateClinicServiceWrite({ ...valid, price: '' }).price).toBeNull());
  it('requires is_active to remain boolean', () => expect(() => validateClinicServiceWrite({ ...valid, is_active: 'false' })).toThrow('is_active must be a boolean'));
  it('rejects browser account selectors', () => expect(() => validateClinicServiceWrite({ ...valid, account_id: 'account-b' })).toThrow('account_id is not accepted'));
  it('returns controlled validation errors', () => { try { validateClinicServiceWrite({ ...valid, price: -1 }); } catch (error) { expect(error).toBeInstanceOf(ClinicServiceError); expect((error as ClinicServiceError).status).toBe(400); expect((error as Error).message).not.toContain('SQL'); } });
});
