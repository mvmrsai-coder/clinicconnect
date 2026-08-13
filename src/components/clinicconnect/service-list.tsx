'use client';

import { Pencil, Plus, Power } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GatedButton } from '@/components/ui/gated-button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ClinicService } from '@/lib/clinicconnect/clinic-services';

interface ServiceListProps {
  services: ClinicService[];
  canEdit: boolean;
  onCreate: () => void;
  onEdit: (service: ClinicService) => void;
  onToggle: (service: ClinicService) => void;
}

export function ServiceList({ services, canEdit, onCreate, onEdit, onToggle }: ServiceListProps) {
  return <Card><CardHeader><CardTitle>Clinic services <Badge variant="outline">{services.length}</Badge></CardTitle><CardDescription>Deactivate services to preserve appointment history while removing them from active booking setup.</CardDescription></CardHeader><CardContent>{services.length === 0 ? <div className="rounded-lg border border-dashed border-border p-8 text-center"><p className="font-medium">No services yet</p><p className="mt-1 text-sm text-muted-foreground">Add the first service to continue the booking setup.</p><GatedButton className="mt-4" canAct={canEdit} gateReason="add services" onClick={onCreate}><Plus /> Add service</GatedButton></div> : <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Duration</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{services.map((service) => <TableRow key={service.id}><TableCell><button type="button" className="text-left font-medium hover:text-primary" onClick={() => onEdit(service)}>{service.name}</button>{service.description ? <p className="max-w-xs truncate text-xs text-muted-foreground">{service.description}</p> : null}</TableCell><TableCell>{service.duration_minutes} min</TableCell><TableCell>{service.price === null ? <span className="text-muted-foreground">—</span> : service.price.toFixed(2)}</TableCell><TableCell><Badge variant={service.is_active ? 'secondary' : 'outline'}>{service.is_active ? 'Active' : 'Inactive'}</Badge></TableCell><TableCell><div className="flex justify-end gap-2"><GatedButton canAct={canEdit} gateReason="edit services" variant="ghost" size="icon-sm" title="Edit service" onClick={() => onEdit(service)}><Pencil /></GatedButton><GatedButton canAct={canEdit} gateReason="activate or deactivate services" variant="ghost" size="sm" onClick={() => onToggle(service)}><Power />{service.is_active ? 'Deactivate' : 'Activate'}</GatedButton></div></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>;
}
