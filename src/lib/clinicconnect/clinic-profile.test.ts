import { describe, expect, it } from 'vitest';

import {
  ClinicProfileError,
  isValidTimezone,
  validateClinicProfileWrite,
} from './clinic-profile';

const valid = {
  clinic_name: '  North Star Clinic  ',
  clinic_type: '',
  phone: ' +91 99999 11111 ',
  email: 'hello@example.com',
  address: null,
  city: 'Bengaluru',
  timezone: 'Asia/Kolkata',
  booking_enabled: false,
};

describe('clinic profile validation', () => {
  it('trims required and optional text while preserving null semantics', () => {
    expect(validateClinicProfileWrite(valid)).toMatchObject({
      clinic_name: 'North Star Clinic',
      clinic_type: null,
      phone: '+91 99999 11111',
      address: null,
      booking_enabled: false,
    });
  });

  it('rejects an empty clinic name', () => {
    expect(() => validateClinicProfileWrite({ ...valid, clinic_name: '  ' })).toThrow('clinic_name is required');
  });

  it('rejects an empty or invalid timezone', () => {
    expect(() => validateClinicProfileWrite({ ...valid, timezone: '' })).toThrow('timezone is required');
    expect(() => validateClinicProfileWrite({ ...valid, timezone: 'Mars/Olympus' })).toThrow('valid IANA timezone');
  });

  it('accepts a valid IANA timezone', () => {
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('not/a-timezone')).toBe(false);
  });

  it('requires booking_enabled to remain boolean', () => {
    expect(() => validateClinicProfileWrite({ ...valid, booking_enabled: 'true' })).toThrow('booking_enabled must be a boolean');
  });

  it('rejects account selectors so tenancy stays server-derived', () => {
    expect(() => validateClinicProfileWrite({ ...valid, account_id: 'other-account' })).toThrow('account_id is not accepted');
  });

  it('rejects browser attempts to edit onboarding state', () => {
    expect(() => validateClinicProfileWrite({ ...valid, onboarding_status: 'LIVE' })).toThrow('onboarding_status is read-only');
  });

  it('keeps working_days read-only until a JSON contract exists', () => {
    expect(() => validateClinicProfileWrite({ ...valid, working_days: { monday: true } })).toThrow('working_days is read-only');
  });

  it('returns controlled validation errors', () => {
    try {
      validateClinicProfileWrite({ ...valid, email: 'not-an-email' });
    } catch (error) {
      expect(error).toBeInstanceOf(ClinicProfileError);
      expect((error as ClinicProfileError).status).toBe(400);
      expect((error as Error).message).not.toContain('postgres');
    }
  });
});
