import { describe, expect, it, vi } from 'vitest';
import {
  fetchWhatsappReadiness,
  runWhatsappDiagnostic,
} from './whatsapp-readiness-api-client';

const response = (body: unknown, ok = true, status = 200) =>
  new Response(JSON.stringify(body), {
    status: ok ? status : status || 500,
    headers: { 'content-type': 'application/json' },
  });

describe('WhatsApp readiness API client', () => {
  it('loads non-secret readiness fields', async () => {
    const payload = {
      configuration: {
        exists: true,
        status: 'connected',
        phoneConfigured: true,
      },
      templates: { total: 1, approved: 1, pending: 0, usable: true },
    };
    expect(
      await fetchWhatsappReadiness(vi.fn().mockResolvedValue(response(payload)))
    ).toEqual(payload);
  });

  it('runs the existing diagnostic endpoint on demand', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        live: false,
        checks: { config_exists: true },
        errors: ['registration incomplete'],
      })
    );
    await runWhatsappDiagnostic(fetcher);
    expect(fetcher.mock.calls[0][0]).toBe(
      '/api/whatsapp/config/verify-registration'
    );
  });
});
