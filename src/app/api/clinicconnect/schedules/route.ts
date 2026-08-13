import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { ClinicScheduleError, listClinicSchedules, saveClinicSchedule, validateClinicScheduleWrite } from '@/lib/clinicconnect/clinic-schedules';

function errorResponse(error: unknown) { if (error instanceof ClinicScheduleError) return NextResponse.json({ error: error.message }, { status: error.status }); return toErrorResponse(error); }

export async function GET(request: Request) {
  try {
    const context = await getCurrentAccount();
    const url = new URL(request.url);
    return NextResponse.json({ schedules: await listClinicSchedules(context, url.searchParams.get('doctor_id') ?? undefined) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try { const context = await requireRole('admin'); const body = await request.json().catch(() => null); return NextResponse.json({ schedule: await saveClinicSchedule(context, validateClinicScheduleWrite(body)) }); }
  catch (error) { return errorResponse(error); }
}
