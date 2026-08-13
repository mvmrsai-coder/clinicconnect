import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { ClinicPatientError, createClinicPatient, listClinicPatients, searchClinicContacts, validateClinicPatientWrite } from '@/lib/clinicconnect/clinic-patients';

function errorResponse(error: unknown) {
  if (error instanceof ClinicPatientError) return NextResponse.json({ error: error.message }, { status: error.status });
  return toErrorResponse(error);
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAccount();
    const params = new URL(request.url).searchParams;
    const query = params.get('contacts_query') ?? params.get('q');
    if (query !== null) return NextResponse.json({ contacts: await searchClinicContacts(context, query) });
    return NextResponse.json({ patients: await listClinicPatients(context) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireRole('admin');
    const body = await request.json().catch(() => null);
    return NextResponse.json({ patient: await createClinicPatient(context, validateClinicPatientWrite(body)) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
