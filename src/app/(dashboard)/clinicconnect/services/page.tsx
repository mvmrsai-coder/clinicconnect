'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Plus } from 'lucide-react';
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
import { useAuth } from '@/hooks/use-auth';
import { hasMinRole } from '@/lib/auth/roles';
import { fetchOnboarding } from '@/lib/clinicconnect/onboarding-api-client';
import { ClinicServicesClientError, fetchServices, saveServiceRequest } from '@/lib/clinicconnect/clinic-services-api-client';
import type { ClinicService, ClinicServiceWrite } from '@/lib/clinicconnect/clinic-services';
import type { ClinicOnboardingSnapshot } from '@/lib/clinicconnect/onboarding-types';
import { ServiceList } from '@/components/clinicconnect/service-list';

const EMPTY_FORM: ClinicServiceWrite = { name: '', description: null, duration_minutes: 30, price: null, is_active: true };
function formFromService(service: ClinicService | null): ClinicServiceWrite { return service ? { name: service.name, description: service.description, duration_minutes: service.duration_minutes, price: service.price, is_active: service.is_active } : { ...EMPTY_FORM }; }
function validate(form: ClinicServiceWrite): string | null { if (!form.name.trim()) return 'Service name is required.'; if (!Number.isInteger(form.duration_minutes) || form.duration_minutes <= 0) return 'Duration must be a positive whole number of minutes.'; if (form.duration_minutes > 1440) return 'Duration cannot exceed 1,440 minutes.'; if (form.price !== null && (!Number.isFinite(form.price) || form.price < 0)) return 'Price must be zero or greater.'; return null; }

export default function ClinicServicesPage() {
  const { accountRole } = useAuth();
  const canEdit = accountRole !== null && hasMinRole(accountRole, 'admin');
  const [services, setServices] = useState<ClinicService[]>([]);
  const [onboarding, setOnboarding] = useState<ClinicOnboardingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<ClinicService | null>(null);
  const [form, setForm] = useState<ClinicServiceWrite>({ ...EMPTY_FORM });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => { setLoading(true); setError(null); try { const [nextServices, nextOnboarding] = await Promise.all([fetchServices(), fetchOnboarding()]); setServices(nextServices); setOnboarding(nextOnboarding); } catch (caught) { setError(caught instanceof ClinicServicesClientError ? caught.message : 'Unable to load services.'); } finally { setLoading(false); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const openCreate = () => { setSelected(null); setForm({ ...EMPTY_FORM }); setValidationError(null); setDialogOpen(true); };
  const openEdit = (service: ClinicService) => { setSelected(service); setForm(formFromService(service)); setValidationError(null); setDialogOpen(true); };
  const update = <K extends keyof ClinicServiceWrite>(key: K, value: ClinicServiceWrite[K]) => { setForm((current) => ({ ...current, [key]: value })); setValidationError(null); };
  const save = async (event: React.FormEvent) => { event.preventDefault(); const issue = validate(form); if (issue) { setValidationError(issue); return; } setSaving(true); try { await saveServiceRequest({ ...form, name: form.name.trim() }, selected?.id); setDialogOpen(false); await refresh(); toast.success(selected ? 'Service updated' : 'Service created'); } catch (caught) { toast.error(caught instanceof ClinicServicesClientError ? caught.message : 'Unable to save service.'); } finally { setSaving(false); } };
  const toggle = async (service: ClinicService) => { try { await saveServiceRequest({ ...formFromService(service), is_active: !service.is_active }, service.id); await refresh(); toast.success(service.is_active ? 'Service deactivated' : 'Service activated'); } catch (caught) { toast.error(caught instanceof ClinicServicesClientError ? caught.message : 'Unable to update service.'); } };

  if (loading) return <div className="space-y-4" role="status" aria-label="Loading services"><Skeleton className="h-8 w-64" /><Skeleton className="h-80" /></div>;
  if (error) return <div className="space-y-4" role="alert"><Alert variant="destructive"><AlertTitle>Unable to load services</AlertTitle><AlertDescription>{error}</AlertDescription></Alert><Button variant="outline" onClick={() => void refresh()}>Try again</Button></div>;
  return <section className="space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="flex items-start gap-3"><Button render={<Link href="/clinicconnect" />} variant="ghost" size="icon" aria-label="Back to ClinicConnect"><ArrowLeft /></Button><div><p className="text-sm font-medium text-primary">ClinicConnect</p><h1 className="text-2xl font-semibold tracking-tight">Services</h1><p className="mt-1 text-sm text-muted-foreground">Manage services offered by this clinic.</p></div></div><GatedButton canAct={canEdit} gateReason="add services" onClick={openCreate}><Plus /> Add service</GatedButton></div>{!canEdit ? <Alert><AlertTitle>Read-only access</AlertTitle><AlertDescription>Only clinic owners and administrators can manage services.</AlertDescription></Alert> : null}{onboarding ? <p className="text-xs text-muted-foreground" role="status">Onboarding snapshot refreshed: {onboarding.steps.find((step) => step.key === 'services')?.state ?? 'unavailable'}.</p> : null}<ServiceList services={services} canEdit={canEdit} onCreate={openCreate} onEdit={openEdit} onToggle={(service) => void toggle(service)} /><Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{selected ? 'Edit service' : 'Add service'}</DialogTitle><DialogDescription>Service data is scoped to the authenticated clinic account.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><div className="space-y-2"><Label htmlFor="service-name">Name *</Label><Input id="service-name" value={form.name} disabled={!canEdit || saving} onChange={(event) => update('name', event.target.value)} /></div><div className="space-y-2"><Label htmlFor="service-description">Description</Label><Textarea id="service-description" value={form.description ?? ''} disabled={!canEdit || saving} onChange={(event) => update('description', event.target.value || null)} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="service-duration">Duration (minutes) *</Label><Input id="service-duration" type="number" min="1" max="1440" step="1" value={form.duration_minutes} disabled={!canEdit || saving} onChange={(event) => update('duration_minutes', Number(event.target.value))} /></div><div className="space-y-2"><Label htmlFor="service-price">Price</Label><Input id="service-price" type="number" min="0" step="0.01" value={form.price ?? ''} disabled={!canEdit || saving} onChange={(event) => update('price', event.target.value === '' ? null : Number(event.target.value))} /></div></div><div className="flex items-center justify-between rounded-lg border border-border p-3"><Label htmlFor="service-active">Active service</Label><Switch id="service-active" checked={form.is_active} disabled={!canEdit || saving} onCheckedChange={(checked) => update('is_active', checked)} /></div>{validationError ? <Alert variant="destructive"><AlertTitle>Check service details</AlertTitle><AlertDescription>{validationError}</AlertDescription></Alert> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><GatedButton type="submit" canAct={canEdit} gateReason="save services" disabled={saving}>{saving ? <><Loader2 className="animate-spin" />Saving...</> : 'Save service'}</GatedButton></DialogFooter></form></DialogContent></Dialog></section>;
}
