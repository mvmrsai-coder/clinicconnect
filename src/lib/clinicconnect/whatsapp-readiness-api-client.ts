export const WHATSAPP_READINESS_ENDPOINT =
  '/api/clinicconnect/whatsapp/readiness';
export const WHATSAPP_DIAGNOSTIC_ENDPOINT =
  '/api/whatsapp/config/verify-registration';

export interface WhatsappReadiness {
  configuration: {
    exists: boolean;
    status: 'connected' | 'disconnected' | null;
    phoneConfigured: boolean;
    connectedAt: string | null;
    registeredAt: string | null;
    subscribedAppsAt: string | null;
    lastRegistrationError: string | null;
  };
  templates: {
    total: number;
    approved: number;
    pending: number;
    usable: boolean;
  };
}

export interface WhatsappDiagnostic {
  live: boolean;
  checks?: {
    config_exists?: boolean;
    token_decryptable?: boolean;
    phone_metadata_ok?: boolean;
    waba_subscribed_to_app?: boolean | null;
    locally_marked_registered?: boolean;
  };
  errors?: string[];
  message?: string;
  last_registration_error?: string | null;
}

async function parse(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function errorMessage(status: number): string {
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 403)
    return 'You do not have permission to view WhatsApp readiness.';
  return 'WhatsApp readiness is temporarily unavailable. Please try again.';
}

export class WhatsappReadinessClientError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'WhatsappReadinessClientError';
  }
}

export async function fetchWhatsappReadiness(
  fetcher: typeof fetch = fetch
): Promise<WhatsappReadiness> {
  const response = await fetcher(WHATSAPP_READINESS_ENDPOINT, {
    cache: 'no-store',
  });
  const body = await parse(response);
  if (!response.ok)
    throw new WhatsappReadinessClientError(
      errorMessage(response.status),
      response.status
    );
  return body as WhatsappReadiness;
}

export async function runWhatsappDiagnostic(
  fetcher: typeof fetch = fetch
): Promise<WhatsappDiagnostic> {
  const response = await fetcher(WHATSAPP_DIAGNOSTIC_ENDPOINT, {
    cache: 'no-store',
  });
  const body = await parse(response);
  if (!response.ok)
    throw new WhatsappReadinessClientError(
      errorMessage(response.status),
      response.status
    );
  return body as WhatsappDiagnostic;
}
