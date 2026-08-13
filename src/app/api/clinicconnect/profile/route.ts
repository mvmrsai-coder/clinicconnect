import { NextResponse } from 'next/server';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import {
  ClinicProfileError,
  readClinicProfile,
  saveClinicProfile,
  validateClinicProfileWrite,
} from '@/lib/clinicconnect/clinic-profile';

function errorResponse(error: unknown) {
  if (error instanceof ClinicProfileError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return toErrorResponse(error);
}

/** Read the current account's clinic profile. Account scope comes from session. */
export async function GET() {
  try {
    return NextResponse.json({ profile: await readClinicProfile(await getCurrentAccount()) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Create/update the current account's profile. Admin/owner only. */
export async function PUT(request: Request) {
  try {
    const context = await requireRole('admin');
    const body = await request.json().catch(() => null);
    const input = validateClinicProfileWrite(body);
    return NextResponse.json({ profile: await saveClinicProfile(context, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
