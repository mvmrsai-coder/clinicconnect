'use client';

import { Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GatedButton } from '@/components/ui/gated-button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ClinicPatient } from '@/lib/clinicconnect/clinic-patients';

export function PatientList({ patients, canEdit, onCreate, onEdit }: { patients: ClinicPatient[]; canEdit: boolean; onCreate: () => void; onEdit: (patient: ClinicPatient) => void }) {
  return <Card><CardHeader><CardTitle>Patients <Badge variant="outline">{patients.length}</Badge></CardTitle><CardDescription>Patient profiles are account-scoped relationships attached to CRM contacts.</CardDescription></CardHeader><CardContent>{patients.length === 0 ? <div className="rounded-lg border border-dashed border-border p-8 text-center"><p className="font-medium">No patients yet</p><p className="mt-1 text-sm text-muted-foreground">Select an existing contact or create a new contact to add the first patient.</p><GatedButton className="mt-4" canAct={canEdit} gateReason="add patients" onClick={onCreate}><Plus /> Add patient</GatedButton></div> : <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Date of birth</TableHead><TableHead>Language</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{patients.map((patient) => <TableRow key={patient.id}><TableCell className="font-medium">{patient.contact.name || 'Unnamed contact'}</TableCell><TableCell>{patient.contact.phone}</TableCell><TableCell>{patient.date_of_birth || '—'}</TableCell><TableCell>{patient.preferred_language || '—'}</TableCell><TableCell className="text-right"><GatedButton canAct={canEdit} gateReason="edit patients" variant="ghost" size="icon-sm" title="Edit patient" onClick={() => onEdit(patient)}><Pencil /></GatedButton></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>;
}
