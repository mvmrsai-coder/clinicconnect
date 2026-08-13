import { NextResponse } from 'next/server';

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  ClinicDoctorError,
  listClinicDoctors,
  saveClinicDoctor,
  validateClinicDoctorWrite,
} from '@/lib/clinicconnect/clinic-doctors';

function errorResponse(error: unknown) {
  if (error instanceof ClinicDoctorError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return toErrorResponse(error);
}

export async function GET() {
  try {
    return NextResponse.json({ doctors: await listClinicDoctors(await getCurrentAccount()) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireRole('admin');
    const body = await request.json().catch(() => null);
    return NextResponse.json({ doctor: await saveClinicDoctor(context, validateClinicDoctorWrite(body)) });
  } catch (error) {
    return errorResponse(error);
  }
}
