import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { ClinicAppointmentError, getClinicAppointment, updateClinicAppointment, validateAppointmentWrite } from '@/lib/clinicconnect/clinic-appointments';

function errorResponse(error: unknown) {
  if (error instanceof ClinicAppointmentError) {
    const body: Record<string, string> = { error: error.message };
    if (error.code) body.code = error.code;
    return NextResponse.json(body, { status: error.status });
  }
  return toErrorResponse(error);
}
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const context = await getCurrentAccount();
    const appointment = await getClinicAppointment(context, (await params).id);
    if (!appointment) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    return NextResponse.json({ appointment });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const context = await requireRole('admin');
    const body = await request.json().catch(() => null);
    return NextResponse.json({ appointment: await updateClinicAppointment(context, (await params).id, validateAppointmentWrite(body, true)) });
  } catch (error) { return errorResponse(error); }
}
