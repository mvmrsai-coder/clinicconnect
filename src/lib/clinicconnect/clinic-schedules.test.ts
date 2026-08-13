import { describe, expect, it } from 'vitest';
import { ClinicScheduleError, scheduleRangesOverlap, validateClinicScheduleWrite } from './clinic-schedules';

const valid = { doctor_id: 'doctor-a', day_of_week: 1, start_time: '09:00', end_time: '17:00', slot_duration_minutes: 30, is_active: true };

describe('clinic schedule validation', () => {
  it('accepts the Sunday=0 through Saturday=6 convention', () => expect(validateClinicScheduleWrite({ ...valid, day_of_week: 0 })).toEqual({ ...valid, day_of_week: 0 }));
  it('rejects invalid days', () => { expect(() => validateClinicScheduleWrite({ ...valid, day_of_week: -1 })).toThrow('between 0'); expect(() => validateClinicScheduleWrite({ ...valid, day_of_week: 7 })).toThrow('between 0'); });
  it('rejects invalid times and reversed ranges', () => { expect(() => validateClinicScheduleWrite({ ...valid, start_time: '25:00' })).toThrow('valid 24-hour time'); expect(() => validateClinicScheduleWrite({ ...valid, start_time: '10:00', end_time: '10:00' })).toThrow('later than'); expect(() => validateClinicScheduleWrite({ ...valid, start_time: '17:00', end_time: '09:00' })).toThrow('later than'); });
  it('rejects a slot longer than the schedule interval', () => expect(() => validateClinicScheduleWrite({ ...valid, slot_duration_minutes: 481 })).toThrow('cannot exceed'));
  it('requires a positive integer slot duration', () => { expect(() => validateClinicScheduleWrite({ ...valid, slot_duration_minutes: 0 })).toThrow('positive integer'); expect(() => validateClinicScheduleWrite({ ...valid, slot_duration_minutes: 30.5 })).toThrow('positive integer'); });
  it('detects overlap while allowing touching ranges', () => { expect(scheduleRangesOverlap('09:00', '12:00', '11:00', '13:00')).toBe(true); expect(scheduleRangesOverlap('09:00', '12:00', '12:00', '13:00')).toBe(false); expect(scheduleRangesOverlap('09:00', '12:00', '13:00', '14:00')).toBe(false); });
  it('rejects browser account selectors and non-boolean activity', () => { expect(() => validateClinicScheduleWrite({ ...valid, account_id: 'account-b' })).toThrow('account_id is not accepted'); expect(() => validateClinicScheduleWrite({ ...valid, is_active: 'false' })).toThrow('is_active must be a boolean'); });
  it('returns controlled validation errors', () => { try { validateClinicScheduleWrite({ ...valid, day_of_week: 9 }); } catch (error) { expect(error).toBeInstanceOf(ClinicScheduleError); expect((error as ClinicScheduleError).status).toBe(400); expect((error as Error).message).not.toContain('SQL'); } });
});
