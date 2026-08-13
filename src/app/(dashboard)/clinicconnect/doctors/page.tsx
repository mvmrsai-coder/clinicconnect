'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GatedButton } from '@/components/ui/gated-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/dashboard/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { DoctorList } from '@/components/clinicconnect/doctor-list';
import { useAuth } from '@/hooks/use-auth';
import { hasMinRole } from '@/lib/auth/roles';
import {
  ClinicDoctorsClientError,
  fetchDoctors,
  saveDoctorRequest,
} from '@/lib/clinicconnect/clinic-doctors-api-client';
import { fetchOnboarding } from '@/lib/clinicconnect/onboarding-api-client';
import type { ClinicDoctor, ClinicDoctorWrite } from '@/lib/clinicconnect/clinic-doctors';
import type { ClinicOnboardingSnapshot } from '@/lib/clinicconnect/onboarding-types';

const EMPTY_FORM: ClinicDoctorWrite = {
  name: '', specialization: null, qualification: null, display_name: null,
  phone: null, email: null, bio: null, is_active: true,
};

function formFromDoctor(doctor: ClinicDoctor | null): ClinicDoctorWrite {
  return doctor ? {
    name: doctor.name,
    specialization: doctor.specialization,
    qualification: doctor.qualification,
    display_name: doctor.display_name,
    phone: doctor.phone,
    email: doctor.email,
    bio: doctor.bio,
    is_active: doctor.is_active,
  } : { ...EMPTY_FORM };
}

function validate(form: ClinicDoctorWrite): string | null {
  if (!form.name.trim()) return 'Doctor name is required.';
  if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return 'Enter a valid email address.';
  return null;
}

export default function ClinicDoctorsPage() {
  const { accountRole } = useAuth();
  const canEdit = accountRole !== null && hasMinRole(accountRole, 'admin');
  const [doctors, setDoctors] = useState<ClinicDoctor[]>([]);
  const [onboarding, setOnboarding] = useState<ClinicOnboardingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<ClinicDoctor | null>(null);
  const [form, setForm] = useState<ClinicDoctorWrite>({ ...EMPTY_FORM });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDoctors, nextOnboarding] = await Promise.all([fetchDoctors(), fetchOnboarding()]);
      setDoctors(nextDoctors);
      setOnboarding(nextOnboarding);
    } catch (caught) {
      setError(caught instanceof ClinicDoctorsClientError ? caught.message : 'Unable to load doctors.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const openCreate = () => {
    setSelected(null);
    setForm({ ...EMPTY_FORM });
    setValidationError(null);
    setDialogOpen(true);
  };

  const openEdit = (doctor: ClinicDoctor) => {
    setSelected(doctor);
    setForm(formFromDoctor(doctor));
    setValidationError(null);
    setDialogOpen(true);
  };

  const update = <K extends keyof ClinicDoctorWrite>(key: K, value: ClinicDoctorWrite[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setValidationError(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const issue = validate(form);
    if (issue) { setValidationError(issue); return; }
    setSaving(true);
    try {
      await saveDoctorRequest({ ...form, name: form.name.trim() }, selected?.id);
      setDialogOpen(false);
      await refresh();
      toast.success(selected ? 'Doctor updated' : 'Doctor created');
    } catch (caught) {
      toast.error(caught instanceof ClinicDoctorsClientError ? caught.message : 'Unable to save doctor.');
    } finally { setSaving(false); }
  };

  const toggle = async (doctor: ClinicDoctor) => {
    try {
      await saveDoctorRequest({ ...formFromDoctor(doctor), is_active: !doctor.is_active }, doctor.id);
      await refresh();
      toast.success(doctor.is_active ? 'Doctor deactivated' : 'Doctor activated');
    } catch (caught) {
      toast.error(caught instanceof ClinicDoctorsClientError ? caught.message : 'Unable to update doctor.');
    }
  };

  if (loading) return <div className="space-y-4" role="status" aria-label="Loading doctors"><Skeleton className="h-8 w-64" /><Skeleton className="h-80" /></div>;
  if (error) return <div className="space-y-4" role="alert"><Alert variant="destructive"><AlertTitle>Unable to load doctors</AlertTitle><AlertDescription>{error}</AlertDescription></Alert><Button variant="outline" onClick={() => void refresh()}>Try again</Button></div>;

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3"><Button render={<Link href="/clinicconnect" />} variant="ghost" size="icon" aria-label="Back to ClinicConnect"><ArrowLeft /></Button><div><p className="text-sm font-medium text-primary">ClinicConnect</p><h1 className="text-2xl font-semibold tracking-tight">Doctors</h1><p className="mt-1 text-sm text-muted-foreground">Manage the active doctors available to this clinic.</p></div></div>
        <GatedButton canAct={canEdit} gateReason="add doctors" onClick={openCreate}><Plus /> Add doctor</GatedButton>
      </div>
      {!canEdit ? <Alert><AlertTitle>Read-only access</AlertTitle><AlertDescription>Only clinic owners and administrators can manage doctors.</AlertDescription></Alert> : null}
      {onboarding ? <p className="text-xs text-muted-foreground" role="status">Onboarding snapshot refreshed: {onboarding.steps.find((step) => step.key === 'doctors')?.state ?? 'unavailable'}.</p> : null}

      <DoctorList doctors={doctors} canEdit={canEdit} onCreate={openCreate} onEdit={openEdit} onToggle={(doctor) => void toggle(doctor)} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{selected ? 'Edit doctor' : 'Add doctor'}</DialogTitle><DialogDescription>Doctor data is scoped to the authenticated clinic account.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><DoctorField label="Name" value={form.name} required disabled={!canEdit || saving} onChange={(value) => update('name', value)} /><DoctorField label="Display name" value={form.display_name ?? ''} disabled={!canEdit || saving} onChange={(value) => update('display_name', value)} /><DoctorField label="Specialization" value={form.specialization ?? ''} disabled={!canEdit || saving} onChange={(value) => update('specialization', value)} /><DoctorField label="Qualification" value={form.qualification ?? ''} disabled={!canEdit || saving} onChange={(value) => update('qualification', value)} /><div className="grid gap-4 sm:grid-cols-2"><DoctorField label="Phone" value={form.phone ?? ''} disabled={!canEdit || saving} onChange={(value) => update('phone', value)} /><DoctorField label="Email" type="email" value={form.email ?? ''} disabled={!canEdit || saving} onChange={(value) => update('email', value)} /></div><div className="space-y-2"><Label htmlFor="doctor-bio">Bio</Label><Textarea id="doctor-bio" value={form.bio ?? ''} disabled={!canEdit || saving} onChange={(event) => update('bio', event.target.value || null)} /></div><div className="flex items-center justify-between rounded-lg border border-border p-3"><Label htmlFor="doctor-active">Active doctor</Label><Switch id="doctor-active" checked={form.is_active} disabled={!canEdit || saving} onCheckedChange={(checked) => update('is_active', checked)} /></div>{validationError ? <Alert variant="destructive"><AlertTitle>Check doctor details</AlertTitle><AlertDescription>{validationError}</AlertDescription></Alert> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><GatedButton type="submit" canAct={canEdit} gateReason="save doctors" disabled={saving}>{saving ? <><Loader2 className="animate-spin" />Saving...</> : 'Save doctor'}</GatedButton></DialogFooter></form></DialogContent></Dialog>
    </section>
  );
}

function DoctorField({ label, value, onChange, type = 'text', required = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; disabled?: boolean }) {
  const id = `doctor-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return <div className="space-y-2"><Label htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}</Label><Input id={id} type={type} value={value} required={required} disabled={disabled} onChange={(event) => onChange(event.target.value || '')} /></div>;
}
