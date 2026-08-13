import { NextResponse } from 'next/server';

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { ClinicServiceError, listClinicServices, saveClinicService, validateClinicServiceWrite } from '@/lib/clinicconnect/clinic-services';

function errorResponse(error: unknown) {
  if (error instanceof ClinicServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
  return toErrorResponse(error);
}

export async function GET() {
  try { return NextResponse.json({ services: await listClinicServices(await getCurrentAccount()) }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireRole('admin');
    const body = await request.json().catch(() => null);
    return NextResponse.json({ service: await saveClinicService(context, validateClinicServiceWrite(body)) });
  } catch (error) { return errorResponse(error); }
}
