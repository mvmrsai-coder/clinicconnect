import { describe, expect, it } from 'vitest';
import { sortAndDeriveConsent } from './whatsapp-consent';

const event = (overrides: Record<string, unknown> = {}) => ({
  id: 'event-a',
  event_type: 'OPT_IN' as const,
  source: 'clinicconnect_ui',
  occurred_at: '2026-08-10T10:00:00.000Z',
  recorded_at: '2026-08-10T10:00:01.000Z',
  recorded_by_user_id: null,
  ...overrides,
});

describe('WhatsApp consent derivation', () => {
  it('returns UNKNOWN when a contact has no events', () => {
    expect(sortAndDeriveConsent([]).state).toBe('UNKNOWN');
  });

  it('uses the latest occurred event as current state', () => {
    expect(
      sortAndDeriveConsent([
        event(),
        event({
          id: 'event-b',
          event_type: 'OPT_OUT',
          occurred_at: '2026-08-11T10:00:00.000Z',
        }),
      ]).state
    ).toBe('OPT_OUT');
  });

  it('uses recorded_at then id to deterministically break ties', () => {
    expect(
      sortAndDeriveConsent([
        event({ id: 'a', recorded_at: '2026-08-10T10:00:01.000Z' }),
        event({
          id: 'b',
          event_type: 'OPT_OUT',
          recorded_at: '2026-08-10T10:00:02.000Z',
        }),
      ]).state
    ).toBe('OPT_OUT');
    expect(
      sortAndDeriveConsent([
        event({ id: 'a', recorded_at: '2026-08-10T10:00:02.000Z' }),
        event({
          id: 'b',
          event_type: 'OPT_OUT',
          recorded_at: '2026-08-10T10:00:02.000Z',
        }),
      ]).latest?.id
    ).toBe('b');
  });
});
