import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';

export async function GET() {
  try {
    const context = await getCurrentAccount();
    const [
      { data: config, error: configError },
      { data: templates, error: templateError },
    ] = await Promise.all([
      context.supabase
        .from('whatsapp_config')
        .select(
          'status, phone_number_id, connected_at, registered_at, subscribed_apps_at, last_registration_error'
        )
        .eq('account_id', context.accountId)
        .maybeSingle(),
      context.supabase
        .from('message_templates')
        .select('status')
        .eq('account_id', context.accountId),
    ]);
    if (configError || templateError) {
      console.error('[clinicconnect/whatsapp/readiness] lookup failed');
      return NextResponse.json(
        { error: 'WhatsApp readiness is unavailable' },
        { status: 500 }
      );
    }
    const rows = templates ?? [];
    const approved = rows.filter((row) => row.status === 'APPROVED').length;
    const pending = rows.filter(
      (row) => row.status === 'PENDING' || row.status === 'PENDING_REVIEW'
    ).length;
    return NextResponse.json({
      configuration: {
        exists: Boolean(config),
        status: config?.status ?? null,
        phoneConfigured: Boolean(config?.phone_number_id),
        connectedAt: config?.connected_at ?? null,
        registeredAt: config?.registered_at ?? null,
        subscribedAppsAt: config?.subscribed_apps_at ?? null,
        lastRegistrationError: config?.last_registration_error ?? null,
      },
      templates: {
        total: rows.length,
        approved,
        pending,
        usable: approved > 0,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
