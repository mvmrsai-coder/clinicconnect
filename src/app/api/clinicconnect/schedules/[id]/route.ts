import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { ClinicScheduleError, getClinicSchedule, saveClinicSchedule, validateClinicScheduleWrite } from '@/lib/clinicconnect/clinic-schedules';

function errorResponse(error: unknown) { if (error instanceof ClinicScheduleError) return NextResponse.json({ error: error.message }, { status: error.status }); return toErrorResponse(error); }
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) { try { const schedule = await getClinicSchedule(await getCurrentAccount(), (await params).id); if (!schedule) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 }); return NextResponse.json({ schedule }); } catch (error) { return errorResponse(error); } }
export async function PUT(request: Request, { params }: Params) { try { const context = await requireRole('admin'); const body = await request.json().catch(() => null); return NextResponse.json({ schedule: await saveClinicSchedule(context, validateClinicScheduleWrite(body), (await params).id) }); } catch (error) { return errorResponse(error); } }
