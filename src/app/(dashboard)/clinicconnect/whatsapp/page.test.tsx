import { describe, expect, it } from 'vitest';
import { getWhatsappReadinessState } from './page';

const configuration = {
  exists: true,
  status: 'connected' as const,
  phoneConfigured: true,
  connectedAt: null,
  registeredAt: null,
  subscribedAppsAt: null,
  lastRegistrationError: null,
};

describe('ClinicConnect WhatsApp readiness page state', () => {
  it.each([
    [undefined, null, 'notConfigured'],
    [{ ...configuration, exists: false }, null, 'notConfigured'],
    [{ ...configuration, status: 'disconnected' as const }, null, 'incomplete'],
    [configuration, null, 'verificationRequired'],
    [configuration, { live: false }, 'connectionIncomplete'],
    [configuration, { live: true }, 'ready'],
  ])('maps readiness evidence to %s', (input, diagnostic, expected) => {
    expect(getWhatsappReadinessState(input, diagnostic)).toBe(expected);
  });
});
