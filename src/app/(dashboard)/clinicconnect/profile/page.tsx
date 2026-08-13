'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GatedButton } from '@/components/ui/gated-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/dashboard/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { hasMinRole } from '@/lib/auth/roles';
import {
  fetchClinicProfile,
  ClinicProfileClientError,
  saveClinicProfileRequest,
} from '@/lib/clinicconnect/clinic-profile-api-client';
import { fetchOnboarding } from '@/lib/clinicconnect/onboarding-api-client';
import type { ClinicProfile } from '@/lib/clinicconnect/clinic-profile';
import type { ClinicOnboardingSnapshot } from '@/lib/clinicconnect/onboarding-types';

interface FormState {
  clinic_name: string;
  clinic_type: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  timezone: string;
  booking_enabled: boolean;
}

const DEFAULT_FORM: FormState = {
  clinic_name: '',
  clinic_type: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  timezone: 'Asia/Kolkata',
  booking_enabled: true,
};

function formFromProfile(profile: ClinicProfile | null): FormState {
  return profile
    ? {
        clinic_name: profile.clinic_name,
        clinic_type: profile.clinic_type ?? '',
        phone: profile.phone ?? '',
        email: profile.email ?? '',
        address: profile.address ?? '',
        city: profile.city ?? '',
        timezone: profile.timezone,
        booking_enabled: profile.booking_enabled,
      }
    : DEFAULT_FORM;
}

function validateForm(form: FormState): string | null {
  if (!form.clinic_name.trim()) return 'Clinic name is required.';
  if (!form.timezone.trim()) return 'Timezone is required.';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: form.timezone.trim() }).format();
  } catch {
    return 'Enter a valid IANA timezone, such as Asia/Kolkata.';
  }
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return 'Enter a valid public email address.';
  }
  return null;
}

export default function ClinicProfilePage() {
  const { accountRole } = useAuth();
  const canEdit = accountRole !== null && hasMinRole(accountRole, 'admin');
  const [profile, setProfile] = useState<ClinicProfile | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [onboarding, setOnboarding] = useState<ClinicOnboardingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextProfile, nextOnboarding] = await Promise.all([
        fetchClinicProfile(),
        fetchOnboarding(),
      ]);
      setProfile(nextProfile);
      setForm(formFromProfile(nextProfile));
      setOnboarding(nextOnboarding);
    } catch (caught) {
      setError(caught instanceof ClinicProfileClientError ? caught.message : 'Unable to load clinic profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setValidationError(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateForm(form);
    if (validation) {
      setValidationError(validation);
      return;
    }
    setSaving(true);
    setValidationError(null);
    try {
      await saveClinicProfileRequest({
        clinic_name: form.clinic_name,
        clinic_type: form.clinic_type,
        phone: form.phone,
        email: form.email,
        address: form.address,
        city: form.city,
        timezone: form.timezone,
        booking_enabled: form.booking_enabled,
      });
      const [nextProfile, nextOnboarding] = await Promise.all([
        fetchClinicProfile(),
        fetchOnboarding(),
      ]);
      setProfile(nextProfile);
      setForm(formFromProfile(nextProfile));
      setOnboarding(nextOnboarding);
      toast.success('Clinic profile saved');
    } catch (caught) {
      toast.error(caught instanceof ClinicProfileClientError ? caught.message : 'Unable to save clinic profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="space-y-4" role="status" aria-label="Loading clinic profile"><Skeleton className="h-8 w-64" /><Skeleton className="h-96" /></div>;
  }

  if (error) {
    return <div className="space-y-4" role="alert"><Alert variant="destructive"><AlertTitle>Unable to load clinic profile</AlertTitle><AlertDescription>{error}</AlertDescription></Alert><Button variant="outline" onClick={() => void load()}>Try again</Button></div>;
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button render={<Link href="/clinicconnect" />} variant="ghost" size="icon" aria-label="Back to ClinicConnect"><ArrowLeft /></Button>
        <div>
          <p className="text-sm font-medium text-primary">ClinicConnect</p>
          <h1 className="text-2xl font-semibold tracking-tight">Clinic profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage the identity and booking settings for this clinic.</p>
        </div>
      </div>

      {validationError ? <Alert variant="destructive"><AlertTitle>Check your profile</AlertTitle><AlertDescription>{validationError}</AlertDescription></Alert> : null}
      {!canEdit ? <Alert><AlertTitle>Read-only access</AlertTitle><AlertDescription>Only clinic owners and administrators can edit this profile.</AlertDescription></Alert> : null}

      <form onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Clinic identity</CardTitle><CardDescription>Required identity and public contact details.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Clinic name" id="clinic-name" value={form.clinic_name} required disabled={!canEdit || saving} onChange={(value) => update('clinic_name', value)} />
            <Field label="Clinic type" id="clinic-type" value={form.clinic_type} disabled={!canEdit || saving} onChange={(value) => update('clinic_type', value)} />
            <Field label="Phone" id="clinic-phone" value={form.phone} disabled={!canEdit || saving} onChange={(value) => update('phone', value)} />
            <Field label="Public email" id="clinic-email" type="email" value={form.email} disabled={!canEdit || saving} onChange={(value) => update('email', value)} />
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="clinic-address">Address</Label><Textarea id="clinic-address" value={form.address} disabled={!canEdit || saving} onChange={(event) => update('address', event.target.value)} /></div>
            <Field label="City" id="clinic-city" value={form.city} disabled={!canEdit || saving} onChange={(value) => update('city', value)} />
            <Field label="Timezone (IANA)" id="clinic-timezone" value={form.timezone} required disabled={!canEdit || saving} onChange={(value) => update('timezone', value)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Booking settings</CardTitle><CardDescription>Turning booking on does not replace doctor schedules or readiness checks.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4"><div><Label htmlFor="booking-enabled">Booking enabled</Label><p className="mt-1 text-xs text-muted-foreground">Use the onboarding checklist to complete booking setup.</p></div><Switch id="booking-enabled" checked={form.booking_enabled} disabled={!canEdit || saving} onCheckedChange={(checked) => update('booking_enabled', checked)} /></div>
            <div className="rounded-lg border border-border bg-muted/40 p-4"><p className="text-sm font-medium">Working days</p><p className="mt-1 text-xs text-muted-foreground">Legacy metadata is shown read-only because the current schema has no agreed JSON contract. Doctor schedules remain the authoritative availability source.</p><pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{profile?.working_days ? JSON.stringify(profile.working_days, null, 2) : 'No working-days metadata saved.'}</pre></div>
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle>Onboarding status</CardTitle><CardDescription>Status is controlled by the onboarding workflow, not this profile form.</CardDescription></CardHeader><CardContent><p className="text-sm font-semibold">{profile?.onboarding_status ?? onboarding?.onboardingStatus ?? 'REGISTERED'}</p></CardContent></Card>
        <div className="flex justify-end"><GatedButton type="submit" canAct={canEdit} gateReason="edit the clinic profile" disabled={saving}>{saving ? <><Loader2 className="animate-spin" />Saving...</> : 'Save clinic profile'}</GatedButton></div>
      </form>
    </section>
  );
}

function Field({ label, id, value, onChange, type = 'text', required = false, disabled = false }: { label: string; id: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; disabled?: boolean }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}</Label><Input id={id} type={type} value={value} required={required} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
}
