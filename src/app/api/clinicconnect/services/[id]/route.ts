import { NextResponse } from 'next/server';

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { ClinicServiceError, getClinicService, saveClinicService, validateClinicServiceWrite } from '@/lib/clinicconnect/clinic-services';

function errorResponse(error: unknown) {
  if (error instanceof ClinicServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
  return toErrorResponse(error);
}

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const service = await getClinicService(await getCurrentAccount(), (await params).id);
    if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    return NextResponse.json({ service });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const context = await requireRole('admin');
    const body = await request.json().catch(() => null);
    return NextResponse.json({ service: await saveClinicService(context, validateClinicServiceWrite(body), (await params).id) });
  } catch (error) { return errorResponse(error); }
}
