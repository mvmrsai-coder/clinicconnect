import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { ClinicPatientError, getClinicPatient, updateClinicPatient, validateClinicPatientWrite } from '@/lib/clinicconnect/clinic-patients';

function errorResponse(error: unknown) {
  if (error instanceof ClinicPatientError) return NextResponse.json({ error: error.message }, { status: error.status });
  return toErrorResponse(error);
}
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const context = await getCurrentAccount();
    const patient = await getClinicPatient(context, (await params).id);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    return NextResponse.json({ patient });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const context = await requireRole('admin');
    const body = await request.json().catch(() => null);
    return NextResponse.json({ patient: await updateClinicPatient(context, (await params).id, validateClinicPatientWrite(body, true)) });
  } catch (error) { return errorResponse(error); }
}
