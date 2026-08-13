import { describe, expect, it, vi } from 'vitest';
import {
  fetchWhatsappConsent,
  recordWhatsappConsent,
  WhatsappConsentClientError,
} from './whatsapp-consent-api-client';

const response = (body: unknown, ok = true, status = 200) =>
  new Response(JSON.stringify(body), {
    status: ok ? status : status || 500,
    headers: { 'content-type': 'application/json' },
  });

describe('WhatsApp consent API client', () => {
  it('loads the account-scoped dashboard without an account parameter', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        contacts: [],
        summary: { totalContacts: 0, optedIn: 0, optedOut: 0, unknown: 0 },
      })
    );
    await fetchWhatsappConsent(fetcher);
    expect(fetcher.mock.calls[0][0]).toBe(
      '/api/clinicconnect/whatsapp/consent'
    );
  });

  it('loads one contact history by encoded contact id', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response({ contact: {}, events: [] }));
    await fetchWhatsappConsent(fetcher, 'contact id');
    expect(fetcher.mock.calls[0][0]).toContain('contact_id=contact%20id');
  });

  it('records only the consent contract fields', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response({ event: { id: 'event-a' } }, true, 201));
    await recordWhatsappConsent(
      {
        contactId: 'contact-a',
        eventType: 'OPT_IN',
        source: 'clinicconnect_ui',
      },
      fetcher
    );
    const request = fetcher.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      contact_id: 'contact-a',
      event_type: 'OPT_IN',
      source: 'clinicconnect_ui',
    });
  });

  it('maps unauthorized responses without exposing server details', async () => {
    await expect(
      fetchWhatsappConsent(
        vi
          .fn()
          .mockResolvedValue(
            response({ error: 'secret postgres detail' }, false, 401)
          )
      )
    ).rejects.toMatchObject({
      status: 401,
      message: 'Your session has expired. Sign in again.',
    } satisfies Partial<WhatsappConsentClientError>);
  });
});
