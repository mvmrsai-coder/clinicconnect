import { describe, expect, it } from 'vitest';

import {
  hasMinRole,
  type AccountRole,
} from './roles';

const roles: AccountRole[] = ['owner', 'admin', 'agent', 'viewer'];

const clinicconnectOperations = [
  ['ClinicConnect reads', 'viewer'],
  ['ClinicConnect profile/doctor/service/schedule writes', 'admin'],
  ['ClinicConnect patient writes (current API contract)', 'admin'],
  ['ClinicConnect appointment writes (current API contract)', 'admin'],
  ['ClinicConnect onboarding transitions', 'admin'],
  ['ClinicConnect WhatsApp consent writes', 'agent'],
] as const satisfies readonly [string, AccountRole][];

describe('ClinicConnect role permission contract', () => {
  it.each(roles)('%s is ordered consistently with the server hierarchy', (role) => {
    expect(hasMinRole(role, role)).toBe(true);
  });

  it.each(clinicconnectOperations)('%s uses its declared minimum role', (_name, minimum) => {
    const minimumRank = roles.indexOf(minimum);
    for (const role of roles) {
      expect(hasMinRole(role, minimum)).toBe(roles.indexOf(role) <= minimumRank);
    }
  });

  it('keeps the explicit agent write boundary for consent', () => {
    expect(hasMinRole('agent', 'agent')).toBe(true);
    expect(hasMinRole('viewer', 'agent')).toBe(false);
  });

  it('keeps admin-only onboarding transitions closed to agents and viewers', () => {
    expect(hasMinRole('owner', 'admin')).toBe(true);
    expect(hasMinRole('admin', 'admin')).toBe(true);
    expect(hasMinRole('agent', 'admin')).toBe(false);
    expect(hasMinRole('viewer', 'admin')).toBe(false);
  });
});
