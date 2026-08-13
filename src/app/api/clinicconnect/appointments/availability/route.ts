import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { ClinicAppointmentError, getAvailableAppointmentSlots } from '@/lib/clinicconnect/clinic-appointments';

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
    const doctor_id = params.get('doctor_id');
    const service_id = params.get('service_id');
    const date = params.get('date');
    if (!doctor_id || !service_id || !date) throw new ClinicAppointmentError('doctor_id, service_id, and date are required', 400);
    return NextResponse.json({ availability: await getAvailableAppointmentSlots(context, { doctor_id, service_id, date }) });
  } catch (error) { return errorResponse(error); }
}
