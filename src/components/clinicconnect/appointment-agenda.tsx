'use client';

import { CalendarPlus, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GatedButton } from '@/components/ui/gated-button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ClinicAppointment } from '@/lib/clinicconnect/clinic-appointments';

const statusLabels: Record<ClinicAppointment['status'], string> = { pending: 'Pending', confirmed: 'Confirmed', rescheduled: 'Rescheduled', cancelled: 'Cancelled', completed: 'Completed', no_show: 'No-show' };
function statusVariant(status: ClinicAppointment['status']): 'default' | 'secondary' | 'outline' | 'destructive' { if (status === 'cancelled' || status === 'no_show') return 'outline'; if (status === 'completed') return 'secondary'; if (status === 'confirmed') return 'default'; return 'secondary'; }

export function AppointmentAgenda({ appointments, doctorNames, serviceNames, patientNames, canEdit, onCreate, onEdit }: { appointments: ClinicAppointment[]; doctorNames: Map<string, string>; serviceNames: Map<string, string>; patientNames: Map<string, string>; canEdit: boolean; onCreate: () => void; onEdit: (appointment: ClinicAppointment) => void }) {
  return <Card><CardHeader><CardTitle>Appointments <Badge variant="outline">{appointments.length}</Badge></CardTitle><CardDescription>Times are shown in the clinic timezone. Select an appointment to view or edit its supported fields.</CardDescription></CardHeader><CardContent>{appointments.length === 0 ? <div className="rounded-lg border border-dashed border-border p-8 text-center"><p className="font-medium">No appointments on this date</p><p className="mt-1 text-sm text-muted-foreground">Choose another date or book the first appointment for this day.</p><GatedButton className="mt-4" canAct={canEdit} gateReason="book appointments" onClick={onCreate}><CalendarPlus /> New appointment</GatedButton></div> : <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Patient</TableHead><TableHead>Doctor</TableHead><TableHead>Service</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{appointments.map((appointment) => <TableRow key={appointment.id}><TableCell className="whitespace-nowrap font-medium">{appointment.start_time.slice(0, 5)}–{appointment.end_time.slice(0, 5)}</TableCell><TableCell>{patientNames.get(appointment.patient_profile_id) ?? 'Unknown patient'}</TableCell><TableCell>{doctorNames.get(appointment.doctor_id) ?? 'Unknown doctor'}</TableCell><TableCell>{serviceNames.get(appointment.service_id) ?? 'Unknown service'}</TableCell><TableCell><Badge variant={statusVariant(appointment.status)}>{statusLabels[appointment.status]}</Badge></TableCell><TableCell className="text-right"><GatedButton canAct={canEdit} gateReason="edit appointments" variant="ghost" size="icon-sm" title="View appointment" onClick={() => onEdit(appointment)}><Pencil /></GatedButton></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>;
}

export { statusLabels };
