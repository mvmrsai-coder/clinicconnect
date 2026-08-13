'use client';

import { Pencil, Plus, Power } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GatedButton } from '@/components/ui/gated-button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ClinicSchedule } from '@/lib/clinicconnect/clinic-schedules';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
interface ScheduleListProps { schedules: ClinicSchedule[]; doctorNames: Map<string, string>; canEdit: boolean; onCreate: () => void; onEdit: (schedule: ClinicSchedule) => void; onToggle: (schedule: ClinicSchedule) => void; }

export function ScheduleList({ schedules, doctorNames, canEdit, onCreate, onEdit, onToggle }: ScheduleListProps) {
  return <Card><CardHeader><CardTitle>Weekly schedules <Badge variant="outline">{schedules.length}</Badge></CardTitle><CardDescription>Recurring times are local to the clinic timezone. Date-specific exceptions are not part of this MVP.</CardDescription></CardHeader><CardContent>{schedules.length === 0 ? <div className="rounded-lg border border-dashed border-border p-8 text-center"><p className="font-medium">No schedules yet</p><p className="mt-1 text-sm text-muted-foreground">Add a recurring weekly schedule for an active doctor.</p><GatedButton className="mt-4" canAct={canEdit} gateReason="add schedules" onClick={onCreate}><Plus /> Add schedule</GatedButton></div> : <Table><TableHeader><TableRow><TableHead>Doctor</TableHead><TableHead>Day</TableHead><TableHead>Local time</TableHead><TableHead>Slot</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{schedules.map((schedule) => <TableRow key={schedule.id}><TableCell>{doctorNames.get(schedule.doctor_id) ?? 'Unknown doctor'}</TableCell><TableCell>{DAY_NAMES[schedule.day_of_week] ?? 'Unknown day'}</TableCell><TableCell>{schedule.start_time.slice(0, 5)}–{schedule.end_time.slice(0, 5)}</TableCell><TableCell>{schedule.slot_duration_minutes} min</TableCell><TableCell><Badge variant={schedule.is_active ? 'secondary' : 'outline'}>{schedule.is_active ? 'Active' : 'Inactive'}</Badge></TableCell><TableCell><div className="flex justify-end gap-2"><GatedButton canAct={canEdit} gateReason="edit schedules" variant="ghost" size="icon-sm" title="Edit schedule" onClick={() => onEdit(schedule)}><Pencil /></GatedButton><GatedButton canAct={canEdit} gateReason="activate or deactivate schedules" variant="ghost" size="sm" onClick={() => onToggle(schedule)}><Power />{schedule.is_active ? 'Deactivate' : 'Activate'}</GatedButton></div></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>;
}
