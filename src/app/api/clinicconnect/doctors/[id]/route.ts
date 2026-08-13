import { NextResponse } from 'next/server';

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  ClinicDoctorError,
  getClinicDoctor,
  saveClinicDoctor,
  validateClinicDoctorWrite,
} from '@/lib/clinicconnect/clinic-doctors';

function errorResponse(error: unknown) {
  if (error instanceof ClinicDoctorError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return toErrorResponse(error);
}

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const context = await getCurrentAccount();
    const doctor = await getClinicDoctor(context, (await params).id);
    if (!doctor) return NextResponse.json({ error: 'Doctor not found' }, { status: 404 });
    return NextResponse.json({ doctor });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const context = await requireRole('admin');
    const body = await request.json().catch(() => null);
    const doctor = await saveClinicDoctor(context, validateClinicDoctorWrite(body), (await params).id);
    return NextResponse.json({ doctor });
  } catch (error) {
    return errorResponse(error);
  }
}
