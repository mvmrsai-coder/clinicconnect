'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GatedButton } from '@/components/ui/gated-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/dashboard/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { AppointmentAgenda } from '@/components/clinicconnect/appointment-agenda';
import { useAuth } from '@/hooks/use-auth';
import { hasMinRole } from '@/lib/auth/roles';
import { fetchDoctors } from '@/lib/clinicconnect/clinic-doctors-api-client';
import { fetchServices } from '@/lib/clinicconnect/clinic-services-api-client';
import { fetchPatients } from '@/lib/clinicconnect/clinic-patients-api-client';
import { fetchClinicProfile } from '@/lib/clinicconnect/clinic-profile-api-client';
import {
  ClinicAppointmentsClientError,
  fetchAppointments,
  fetchAvailability,
  saveAppointmentRequest,
} from '@/lib/clinicconnect/clinic-appointments-api-client';
import type {
  AppointmentAvailability,
  AppointmentSlot,
  ClinicAppointment,
  ClinicAppointmentWrite,
} from '@/lib/clinicconnect/clinic-appointments';
import type { ClinicDoctor } from '@/lib/clinicconnect/clinic-doctors';
import type { ClinicService } from '@/lib/clinicconnect/clinic-services';
import type { ClinicPatient } from '@/lib/clinicconnect/clinic-patients';

const EMPTY_FORM: ClinicAppointmentWrite = {
  patient_profile_id: '',
  doctor_id: '',
  service_id: '',
  appointment_date: '',
  start_time: '',
  end_time: '',
  status: 'pending',
  source: null,
  notes: null,
};
const statuses: ClinicAppointment['status'][] = [
  'pending',
  'confirmed',
  'rescheduled',
  'cancelled',
  'completed',
  'no_show',
];

function todayInTimezone(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
function shiftDate(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
function formatDate(date: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(`${date}T12:00:00Z`));
  } catch {
    return date;
  }
}
function patientDisplay(patient: ClinicPatient): string {
  return `${patient.contact.name || 'Unnamed contact'} · ${patient.contact.phone}`;
}

export default function ClinicAppointmentsPage() {
  const { accountRole } = useAuth();
  const canEdit = accountRole !== null && hasMinRole(accountRole, 'admin');
  const [timezone, setTimezone] = useState('UTC');
  const [date, setDate] = useState('');
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [doctors, setDoctors] = useState<ClinicDoctor[]>([]);
  const [services, setServices] = useState<ClinicService[]>([]);
  const [patients, setPatients] = useState<ClinicPatient[]>([]);
  const [doctorFilter, setDoctorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<ClinicAppointment | null>(null);
  const [form, setForm] = useState<ClinicAppointmentWrite>({ ...EMPTY_FORM });
  const [patientQuery, setPatientQuery] = useState('');
  const [availability, setAvailability] =
    useState<AppointmentAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const availabilitySequence = useRef(0);
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0);

  useEffect(() => {
    void fetchClinicProfile()
      .then((profile) => {
        const nextTimezone = profile?.timezone || 'UTC';
        setTimezone(nextTimezone);
        setDate((current) => current || todayInTimezone(nextTimezone));
      })
      .catch(() => {
        setDate((current) => current || todayInTimezone('UTC'));
      });
  }, []);

  const refresh = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    setError(null);
    try {
      const [nextAppointments, nextDoctors, nextServices, nextPatients] =
        await Promise.all([
          fetchAppointments({
            date,
            doctor_id: doctorFilter || undefined,
            status: statusFilter || undefined,
          }),
          fetchDoctors(),
          fetchServices(),
          fetchPatients(),
        ]);
      setAppointments(nextAppointments);
      setDoctors(nextDoctors);
      setServices(nextServices);
      setPatients(nextPatients);
    } catch (caught) {
      setError(
        caught instanceof ClinicAppointmentsClientError
          ? caught.message
          : 'Unable to load appointment data.'
      );
    } finally {
      setLoading(false);
    }
  }, [date, doctorFilter, statusFilter]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const doctorNames = useMemo(
    () =>
      new Map(
        doctors.map((doctor) => [doctor.id, doctor.display_name || doctor.name])
      ),
    [doctors]
  );
  const serviceNames = useMemo(
    () => new Map(services.map((service) => [service.id, service.name])),
    [services]
  );
  const patientNames = useMemo(
    () =>
      new Map(
        patients.map((patient) => [
          patient.id,
          patient.contact.name || patient.contact.phone,
        ])
      ),
    [patients]
  );
  const activeDoctors = useMemo(
    () => doctors.filter((doctor) => doctor.is_active),
    [doctors]
  );
  const activeServices = useMemo(
    () => services.filter((service) => service.is_active),
    [services]
  );
  const selectableDoctors = useMemo(() => {
    const current = selected ? doctors.find((doctor) => doctor.id === selected.doctor_id) : null;
    return current && !current.is_active ? [current, ...activeDoctors] : activeDoctors;
  }, [activeDoctors, doctors, selected]);
  const selectableServices = useMemo(() => {
    const current = selected ? services.find((service) => service.id === selected.service_id) : null;
    return current && !current.is_active ? [current, ...activeServices] : activeServices;
  }, [activeServices, selected, services]);
  const visiblePatients = useMemo(() => {
    const query = patientQuery.trim().toLowerCase();
    return query
      ? patients.filter((patient) =>
          patientDisplay(patient).toLowerCase().includes(query)
        )
      : patients;
  }, [patientQuery, patients]);
  const selectedService = services.find(
    (service) => service.id === form.service_id
  );
  const appointmentKey = `${form.doctor_id || ''}|${form.service_id || ''}|${form.appointment_date || ''}`;
  const currentSlot: AppointmentSlot | null =
    selected &&
    selected.doctor_id === form.doctor_id &&
    selected.service_id === form.service_id &&
    selected.appointment_date === form.appointment_date
      ? {
          start_time: selected.start_time.slice(0, 5),
          end_time: selected.end_time.slice(0, 5),
        }
      : null;
  const slotOptions = useMemo(() => {
    const options = availability?.slots ? [...availability.slots] : [];
    if (
      currentSlot &&
      !options.some(
        (slot) =>
          slot.start_time === currentSlot.start_time &&
          slot.end_time === currentSlot.end_time
      )
    )
      options.unshift(currentSlot);
    return options;
  }, [availability, currentSlot]);

  useEffect(() => {
    if (
      !dialogOpen ||
      !form.doctor_id ||
      !form.service_id ||
      !form.appointment_date
    ) {
      setAvailability(null);
      return;
    }
    const sequence = ++availabilitySequence.current;
    setAvailability(null);
    setAvailabilityError(null);
    setAvailabilityLoading(true);
    void fetchAvailability({
      doctor_id: form.doctor_id,
      service_id: form.service_id,
      date: form.appointment_date,
    })
      .then((result) => {
        if (sequence === availabilitySequence.current) setAvailability(result);
      })
      .catch((caught) => {
        if (sequence === availabilitySequence.current)
          setAvailabilityError(
            caught instanceof ClinicAppointmentsClientError
              ? caught.message
              : 'Unable to load availability.'
          );
      })
      .finally(() => {
        if (sequence === availabilitySequence.current)
          setAvailabilityLoading(false);
      });
  }, [
    appointmentKey,
    availabilityRefresh,
    dialogOpen,
    form.doctor_id,
    form.service_id,
    form.appointment_date,
  ]);

  const openCreate = () => {
    setSelected(null);
    setPatientQuery('');
    setSaveError(null);
    setAvailability(null);
    setForm({
      ...EMPTY_FORM,
      appointment_date: date,
      doctor_id: activeDoctors[0]?.id || '',
      service_id: activeServices[0]?.id || '',
    });
    setDialogOpen(true);
  };
  const openEdit = (appointment: ClinicAppointment) => {
    setSelected(appointment);
    setPatientQuery('');
    setSaveError(null);
    setAvailability(null);
    setForm({
      patient_profile_id: appointment.patient_profile_id,
      doctor_id: appointment.doctor_id,
      service_id: appointment.service_id,
      appointment_date: appointment.appointment_date,
      start_time: appointment.start_time.slice(0, 5),
      end_time: appointment.end_time.slice(0, 5),
      status: appointment.status,
      source: appointment.source,
      notes: appointment.notes,
    });
    setDialogOpen(true);
  };
  const update = <K extends keyof ClinicAppointmentWrite>(
    key: K,
    value: ClinicAppointmentWrite[K]
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaveError(null);
  };
  const changeResource = (
    key: 'doctor_id' | 'service_id' | 'appointment_date',
    value: string
  ) => {
    update(key, value);
    if (key !== 'appointment_date' || value !== form.appointment_date) {
      update('start_time', '');
      update('end_time', '');
    }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError(null);
    if (
      !form.patient_profile_id ||
      !form.doctor_id ||
      !form.service_id ||
      !form.appointment_date ||
      (!form.start_time &&
        form.status !== 'cancelled' &&
        form.status !== 'completed' &&
        form.status !== 'no_show')
    ) {
      setSaveError(
        'Select a patient, doctor, service, date, and available time.'
      );
      return;
    }
    setSaving(true);
    try {
      await saveAppointmentRequest(form, selected?.id);
      setDialogOpen(false);
      await refresh();
      toast.success(selected ? 'Appointment updated' : 'Appointment booked');
    } catch (caught) {
      if (
        caught instanceof ClinicAppointmentsClientError &&
        caught.code === 'appointment_conflict'
      ) {
        setSaveError(
          'The selected time is no longer available. Please choose another slot.'
        );
        setAvailability(null);
        setAvailabilityRefresh((current) => current + 1);
      } else
        setSaveError(
          caught instanceof ClinicAppointmentsClientError
            ? caught.message
            : 'Unable to save appointment.'
        );
    } finally {
      setSaving(false);
    }
  };
  if (!date || loading)
    return (
      <div
        className="space-y-4"
        role="status"
        aria-label="Loading appointments"
      >
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80" />
      </div>
    );
  if (error)
    return (
      <div className="space-y-4" role="alert">
        <Alert variant="destructive">
          <AlertTitle>Unable to load appointments</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => void refresh()}>
          <RefreshCw /> Try again
        </Button>
      </div>
    );
  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <Button
            render={<Link href="/clinicconnect" />}
            variant="ghost"
            size="icon"
            aria-label="Back to ClinicConnect"
          >
            <ArrowLeft />
          </Button>
          <div>
            <p className="text-primary text-sm font-medium">ClinicConnect</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Appointments
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Day agenda in the clinic timezone: <strong>{timezone}</strong>.
            </p>
          </div>
        </div>
        <GatedButton
          canAct={canEdit}
          gateReason="book appointments"
          onClick={openCreate}
        >
          <Plus /> New appointment
        </GatedButton>
      </div>
      {!canEdit ? (
        <Alert>
          <AlertTitle>Read-only access</AlertTitle>
          <AlertDescription>
            Only clinic owners and administrators can create or edit
            appointments.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="border-border bg-card flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDate(shiftDate(date, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft />
          </Button>
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-auto"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDate(shiftDate(date, 1))}
            aria-label="Next day"
          >
            <ChevronRight />
          </Button>
          <Button
            variant="ghost"
            onClick={() => setDate(todayInTimezone(timezone))}
          >
            Today
          </Button>
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <CalendarDays className="size-4" />
          {formatDate(date, timezone)}
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="space-y-1">
          <Label htmlFor="appointment-doctor-filter">Doctor</Label>
          <select
            id="appointment-doctor-filter"
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            value={doctorFilter}
            onChange={(event) => setDoctorFilter(event.target.value)}
          >
            <option value="">All doctors</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.display_name || doctor.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="appointment-status-filter">Status</Label>
          <select
            id="appointment-status-filter"
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>
      <AppointmentAgenda
        appointments={appointments}
        doctorNames={doctorNames}
        serviceNames={serviceNames}
        patientNames={patientNames}
        canEdit={canEdit}
        onCreate={openCreate}
        onEdit={openEdit}
      />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {selected ? 'Appointment details' : 'Book appointment'}
            </DialogTitle>
            <DialogDescription>
              Select resources first; availability and duration always come from
              the server.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="appointment-patient">Patient *</Label>
                <Input
                  id="appointment-patient-search"
                  placeholder="Search patients"
                  value={patientQuery}
                  onChange={(event) => setPatientQuery(event.target.value)}
                />
                <select
                  id="appointment-patient"
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={form.patient_profile_id}
                  disabled={!canEdit || saving}
                  onChange={(event) =>
                    update('patient_profile_id', event.target.value)
                  }
                >
                  <option value="">
                    {patients.length
                      ? 'Select patient'
                      : 'No patients available'}
                  </option>
                  {visiblePatients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patientDisplay(patient)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="appointment-doctor">Doctor *</Label>
                <select
                  id="appointment-doctor"
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={form.doctor_id}
                  disabled={!canEdit || saving}
                  onChange={(event) =>
                    changeResource('doctor_id', event.target.value)
                  }
                >
                  <option value="">
                    {activeDoctors.length
                      ? 'Select doctor'
                      : 'No active doctors available'}
                  </option>
                  {selectableDoctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.display_name || doctor.name}{!doctor.is_active ? ' (inactive)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="appointment-service">Service *</Label>
                <select
                  id="appointment-service"
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={form.service_id}
                  disabled={!canEdit || saving}
                  onChange={(event) =>
                    changeResource('service_id', event.target.value)
                  }
                >
                  <option value="">
                    {activeServices.length
                      ? 'Select service'
                      : 'No active services available'}
                  </option>
                  {selectableServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} · {service.duration_minutes} min{!service.is_active ? ' (inactive)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="appointment-date">Date *</Label>
                <Input
                  id="appointment-date"
                  type="date"
                  value={form.appointment_date}
                  disabled={!canEdit || saving}
                  onChange={(event) =>
                    changeResource('appointment_date', event.target.value)
                  }
                />
              </div>
            </div>
            {selectedService ? (
              <p className="text-muted-foreground text-xs">
                Service duration: {selectedService.duration_minutes} minutes.
                End time is calculated by the server.
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="appointment-slot">Available time *</Label>
              {availabilityLoading ? (
                <div
                  className="text-muted-foreground flex items-center gap-2 text-sm"
                  role="status"
                >
                  <Loader2 className="animate-spin" />
                  Loading availability…
                </div>
              ) : availabilityError ? (
                <Alert variant="destructive">
                  <AlertTitle>Availability unavailable</AlertTitle>
                  <AlertDescription>{availabilityError}</AlertDescription>
                </Alert>
              ) : availability && slotOptions.length === 0 ? (
                <p className="border-border text-muted-foreground rounded-md border border-dashed p-3 text-sm">
                  No available appointments for this doctor and service on this
                  date.
                </p>
              ) : (
                <select
                  id="appointment-slot"
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={form.start_time || ''}
                  disabled={!canEdit || saving || !availability}
                  onChange={(event) => {
                    const slot = slotOptions.find(
                      (option) => option.start_time === event.target.value
                    );
                    if (slot) {
                      update('start_time', slot.start_time);
                      update('end_time', slot.end_time);
                    }
                  }}
                >
                  <option value="">Select an available time</option>
                  {slotOptions.map((slot) => (
                    <option
                      key={`${slot.start_time}-${slot.end_time}`}
                      value={slot.start_time}
                    >
                      {slot.start_time}–{slot.end_time}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-status">Status</Label>
              <select
                id="appointment-status"
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={form.status || 'pending'}
                disabled={!canEdit || saving}
                onChange={(event) =>
                  update(
                    'status',
                    event.target.value as ClinicAppointment['status']
                  )
                }
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-notes">Notes</Label>
              <Textarea
                id="appointment-notes"
                value={form.notes ?? ''}
                disabled={!canEdit || saving}
                onChange={(event) =>
                  update('notes', event.target.value || null)
                }
              />
            </div>
            {selected ? (
              <p className="text-xs text-muted-foreground">
                Created{' '}
                {new Date(selected.created_at).toLocaleString(undefined, {
                  timeZone: timezone,
                })}{' '}
                · Updated{' '}
                {new Date(selected.updated_at).toLocaleString(undefined, {
                  timeZone: timezone,
                })}
              </p>
            ) : null}
            {saveError ? (
              <Alert variant="destructive">
                <AlertTitle>Check appointment details</AlertTitle>
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Close
              </Button>
              <GatedButton
                type="submit"
                canAct={canEdit}
                gateReason={
                  selected ? 'save appointment changes' : 'book appointments'
                }
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Saving…
                  </>
                ) : selected ? (
                  'Save changes'
                ) : (
                  'Confirm booking'
                )}
              </GatedButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
