import type {
  ConsentEventType,
  WhatsappConsentDashboard,
  WhatsappConsentHistory,
} from './whatsapp-consent';

export const WHATSAPP_CONSENT_ENDPOINT = '/api/clinicconnect/whatsapp/consent';

async function parse(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export class WhatsappConsentClientError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'WhatsappConsentClientError';
  }
}

function errorMessage(status: number): string {
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 403) return 'Your role cannot record consent.';
  if (status === 404) return 'That contact is not available in this clinic.';
  if (status === 400) return 'Choose a valid consent state and source.';
  return 'Consent data is temporarily unavailable. Please try again.';
}

export async function fetchWhatsappConsent(
  fetcher: typeof fetch = fetch,
  contactId?: string
): Promise<WhatsappConsentDashboard | WhatsappConsentHistory> {
  const suffix = contactId
    ? `?contact_id=${encodeURIComponent(contactId)}`
    : '';
  const response = await fetcher(`${WHATSAPP_CONSENT_ENDPOINT}${suffix}`, {
    cache: 'no-store',
  });
  const body = await parse(response);
  if (!response.ok)
    throw new WhatsappConsentClientError(
      errorMessage(response.status),
      response.status
    );
  return body as WhatsappConsentDashboard | WhatsappConsentHistory;
}

export async function recordWhatsappConsent(
  input: { contactId: string; eventType: ConsentEventType; source: string },
  fetcher: typeof fetch = fetch
): Promise<{ event: unknown }> {
  const response = await fetcher(WHATSAPP_CONSENT_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contact_id: input.contactId,
      event_type: input.eventType,
      source: input.source,
    }),
  });
  const body = await parse(response);
  if (!response.ok)
    throw new WhatsappConsentClientError(
      errorMessage(response.status),
      response.status
    );
  return body as { event: unknown };
}
