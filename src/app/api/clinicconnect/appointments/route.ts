import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { ClinicAppointmentError, createClinicAppointment, getAvailableAppointmentSlots, listClinicAppointments, validateAppointmentWrite } from '@/lib/clinicconnect/clinic-appointments';

function errorResponse(error: unknown) {
  if (error instanceof ClinicAppointmentError) {
    const body: Record<string, string> = { error: error.message };
    if (error.code) body.code = error.code;
    return NextResponse.json(body, { status: error.status });
  }
  return toErrorResponse(error);
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAccount();
    const params = new URL(request.url).searchParams;
    return NextResponse.json({ appointments: await listClinicAppointments(context, { date: params.get('date'), doctorId: params.get('doctor_id'), patientId: params.get('patient_profile_id') ?? params.get('patient_id'), status: params.get('status') }) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireRole('admin');
    const body = await request.json().catch(() => null);
    return NextResponse.json({ appointment: await createClinicAppointment(context, validateAppointmentWrite(body)) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
