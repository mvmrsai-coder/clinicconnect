import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireRole } from '@/lib/auth/account';
import {
  getWhatsappConsentHistory,
  listWhatsappConsent,
} from '@/lib/clinicconnect/whatsapp-consent';
import { GET, POST } from './route';

vi.mock('@/lib/auth/account', () => ({
  requireRole: vi.fn(),
  toErrorResponse: (error: unknown) =>
    NextResponse.json(
      { error: (error as Error).message },
      { status: (error as { status?: number }).status ?? 500 }
    ),
}));
vi.mock('@/lib/clinicconnect/whatsapp-consent', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/clinicconnect/whatsapp-consent')
  >('@/lib/clinicconnect/whatsapp-consent');
  return {
    ...actual,
    listWhatsappConsent: vi.fn(),
    getWhatsappConsentHistory: vi.fn(),
  };
});

const insertedEvent = {
  id: 'event-a',
  contact_id: 'contact-a',
  event_type: 'OPT_IN',
  source: 'clinicconnect_ui',
  occurred_at: '2026-08-11T10:00:00.000Z',
  recorded_at: '2026-08-11T10:00:00.000Z',
};
const context = {
  accountId: 'account-a',
  userId: 'user-a',
  role: 'owner',
  account: { id: 'account-a', name: 'Clinic A' },
  supabase: {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () =>
          table === 'contacts'
            ? { data: { id: 'contact-a' }, error: null }
            : { data: null, error: null }
        ),
        insert: vi.fn(() => builder),
        single: vi.fn(async () => ({ data: insertedEvent, error: null })),
      };
      return builder;
    }),
  },
};

describe('ClinicConnect WhatsApp consent route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(context as never);
    vi.mocked(listWhatsappConsent).mockResolvedValue({
      contacts: [],
      summary: { totalContacts: 0, optedIn: 0, optedOut: 0, unknown: 0 },
    });
    vi.mocked(getWhatsappConsentHistory).mockResolvedValue(null);
  });

  it('lists only the authenticated account dashboard', async () => {
    const response = await GET(
      new Request('http://localhost/api/clinicconnect/whatsapp/consent')
    );
    expect(response.status).toBe(200);
    expect(listWhatsappConsent).toHaveBeenCalledWith(context);
  });

  it('returns a controlled 404 for a contact outside the account', async () => {
    const response = await GET(
      new Request(
        'http://localhost/api/clinicconnect/whatsapp/consent?contact_id=11111111-1111-4111-8111-111111111111'
      )
    );
    expect(response.status).toBe(404);
  });

  it('rejects account and recorder overrides before persistence', async () => {
    const response = await POST(
      new Request('http://localhost/api/clinicconnect/whatsapp/consent', {
        method: 'POST',
        body: JSON.stringify({
          account_id: 'account-b',
          recorded_by_user_id: 'user-b',
          contact_id: '11111111-1111-4111-8111-111111111111',
          event_type: 'OPT_IN',
          source: 'clinicconnect_ui',
        }),
      })
    );
    expect(response.status).toBe(400);
    expect(context.supabase.from).not.toHaveBeenCalled();
  });

  it('derives account and recorder identity on insert', async () => {
    const response = await POST(
      new Request('http://localhost/api/clinicconnect/whatsapp/consent', {
        method: 'POST',
        body: JSON.stringify({
          contact_id: '11111111-1111-4111-8111-111111111111',
          event_type: 'OPT_IN',
          source: 'clinicconnect_ui',
        }),
      })
    );
    expect(response.status).toBe(201);
    const eventsBuilder = vi.mocked(context.supabase.from).mock.results[1]
      ?.value;
    expect(eventsBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 'account-a',
        recorded_by_user_id: 'user-a',
        contact_id: '11111111-1111-4111-8111-111111111111',
      })
    );
  });

  it('requires an explicit meaningful source', async () => {
    const response = await POST(
      new Request('http://localhost/api/clinicconnect/whatsapp/consent', {
        method: 'POST',
        body: JSON.stringify({
          contact_id: '11111111-1111-4111-8111-111111111111',
          event_type: 'OPT_OUT',
          source: ' ',
        }),
      })
    );
    expect(response.status).toBe(400);
  });
});
