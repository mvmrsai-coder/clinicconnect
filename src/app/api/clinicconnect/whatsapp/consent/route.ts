import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  CONSENT_EVENT_TYPES,
  getWhatsappConsentHistory,
  listWhatsappConsent,
} from '@/lib/clinicconnect/whatsapp-consent';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const context = await requireRole('viewer');
    const contactId = new URL(request.url).searchParams.get('contact_id');
    if (contactId !== null && !UUID.test(contactId)) {
      return NextResponse.json(
        { error: 'Invalid contact id' },
        { status: 400 }
      );
    }
    if (contactId) {
      const history = await getWhatsappConsentHistory(context, contactId);
      if (!history)
        return NextResponse.json(
          { error: 'Contact not found' },
          { status: 404 }
        );
      return NextResponse.json(history);
    }
    return NextResponse.json(await listWhatsappConsent(context));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireRole('agent');
    const body = (await request.json()) as Record<string, unknown>;
    if (
      'account_id' in body ||
      'recorded_by_user_id' in body ||
      'metadata' in body
    ) {
      return NextResponse.json(
        { error: 'Unsupported authorization field' },
        { status: 400 }
      );
    }
    const contactId = body.contact_id;
    const eventType = body.event_type;
    const source = typeof body.source === 'string' ? body.source.trim() : '';
    if (typeof contactId !== 'string' || !UUID.test(contactId)) {
      return NextResponse.json(
        { error: 'contact_id must be a valid identifier' },
        { status: 400 }
      );
    }
    if (
      !CONSENT_EVENT_TYPES.includes(
        eventType as (typeof CONSENT_EVENT_TYPES)[number]
      )
    ) {
      return NextResponse.json(
        { error: 'event_type must be OPT_IN or OPT_OUT' },
        { status: 400 }
      );
    }
    if (!source || source.length > 120) {
      return NextResponse.json(
        { error: 'source must be non-empty and at most 120 characters' },
        { status: 400 }
      );
    }
    const { data: contact, error: contactError } = await context.supabase
      .from('contacts')
      .select('id')
      .eq('account_id', context.accountId)
      .eq('id', contactId)
      .maybeSingle();
    if (contactError) {
      console.error(
        '[clinicconnect/whatsapp/consent] contact validation failed'
      );
      return NextResponse.json(
        { error: 'Consent is unavailable' },
        { status: 500 }
      );
    }
    if (!contact)
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    const { data: event, error } = await context.supabase
      .from('whatsapp_consent_events')
      .insert({
        account_id: context.accountId,
        contact_id: contactId,
        event_type: eventType,
        source,
        recorded_by_user_id: context.userId,
      })
      .select('id, contact_id, event_type, source, occurred_at, recorded_at')
      .single();
    if (error || !event) {
      console.error('[clinicconnect/whatsapp/consent] insert failed');
      return NextResponse.json(
        { error: 'Consent could not be recorded' },
        { status: 500 }
      );
    }
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
