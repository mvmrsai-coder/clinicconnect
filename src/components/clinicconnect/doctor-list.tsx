'use client';

import { Pencil, Plus, Power } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GatedButton } from '@/components/ui/gated-button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ClinicDoctor } from '@/lib/clinicconnect/clinic-doctors';

interface DoctorListProps {
  doctors: ClinicDoctor[];
  canEdit: boolean;
  onCreate: () => void;
  onEdit: (doctor: ClinicDoctor) => void;
  onToggle: (doctor: ClinicDoctor) => void;
}

export function DoctorList({ doctors, canEdit, onCreate, onEdit, onToggle }: DoctorListProps) {
  return (
    <Card>
      <CardHeader><CardTitle>Clinic doctors <Badge variant="outline">{doctors.length}</Badge></CardTitle><CardDescription>Deactivate a doctor to preserve operational history while removing them from active setup.</CardDescription></CardHeader>
      <CardContent>
        {doctors.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center"><p className="font-medium">No doctors yet</p><p className="mt-1 text-sm text-muted-foreground">Add the first doctor to continue the booking setup.</p><GatedButton className="mt-4" canAct={canEdit} gateReason="add doctors" onClick={onCreate}><Plus /> Add doctor</GatedButton></div>
        ) : (
          <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Specialization</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{doctors.map((doctor) => <TableRow key={doctor.id}><TableCell><button type="button" className="text-left font-medium hover:text-primary" onClick={() => onEdit(doctor)}>{doctor.display_name || doctor.name}</button>{doctor.display_name ? <p className="text-xs text-muted-foreground">{doctor.name}</p> : null}</TableCell><TableCell>{doctor.specialization || <span className="text-muted-foreground">—</span>}</TableCell><TableCell><Badge variant={doctor.is_active ? 'secondary' : 'outline'}>{doctor.is_active ? 'Active' : 'Inactive'}</Badge></TableCell><TableCell><div className="flex justify-end gap-2"><GatedButton canAct={canEdit} gateReason="edit doctors" variant="ghost" size="icon-sm" title="Edit doctor" onClick={() => onEdit(doctor)}><Pencil /></GatedButton><GatedButton canAct={canEdit} gateReason="activate or deactivate doctors" variant="ghost" size="sm" onClick={() => onToggle(doctor)}><Power />{doctor.is_active ? 'Deactivate' : 'Activate'}</GatedButton></div></TableCell></TableRow>)}</TableBody></Table>
        )}
      </CardContent>
    </Card>
  );
}
