'use client';

import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock3,
  Loader2,
  LockKeyhole,
  MessageCircle,
  Play,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/dashboard/skeleton';
import { hasMinRole, type AccountRole } from '@/lib/auth/roles';
import type {
  ClinicOnboardingSnapshot,
  ClinicOnboardingStatus,
  OnboardingStep,
  OnboardingStepKey,
} from '@/lib/clinicconnect/onboarding-types';

const STEP_LABELS: Record<OnboardingStepKey, string> = {
  clinic_profile: 'Clinic profile',
  doctors: 'Doctors',
  services: 'Services',
  schedules: 'Schedules',
  patients: 'Patients',
  whatsapp: 'WhatsApp',
  automations: 'Automations',
  testing: 'Operational test',
};

const STATUS_DESCRIPTIONS: Record<ClinicOnboardingStatus, string> = {
  REGISTERED: 'Your clinic is registered and ready for configuration.',
  TESTING: 'The clinic is in operational testing.',
  READY: 'Required setup is complete and the clinic can go live.',
  LIVE: 'ClinicConnect is live for this clinic.',
  BLOCKED: 'Onboarding is blocked and needs an operator review.',
};

const NEXT_STEP_LABELS: Record<string, string> = {
  clinic_profile: 'Complete the clinic profile',
  doctors: 'Add at least one active doctor',
  services: 'Add at least one active service',
  schedules: 'Configure a schedule for every active doctor',
  patients: 'Review imported patients',
  whatsapp: 'Connect WhatsApp when ready',
  automations: 'Review automations and templates',
  testing: 'Run the operational test',
  review_blocker: 'Review the onboarding blocker',
};

const NEXT_STEP_HREFS: Partial<Record<string, string>> = {
  clinic_profile: '/clinicconnect/profile',
  doctors: '/clinicconnect/doctors',
  services: '/clinicconnect/services',
  schedules: '/clinicconnect/schedules',
};

export interface OnboardingDashboardProps {
  snapshot: ClinicOnboardingSnapshot | null;
  accountRole: AccountRole | null;
  loading: boolean;
  error: string | null;
  transitionError: string | null;
  pendingStatus: ClinicOnboardingStatus | null;
  onRetry: () => void;
  onTransition: (status: ClinicOnboardingStatus) => void;
}

function StepIcon({ state }: Pick<OnboardingStep, 'state'>) {
  if (state === 'complete') {
    return <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />;
  }
  if (state === 'incomplete') {
    return <Circle className="size-4 text-amber-500" aria-hidden="true" />;
  }
  if (state === 'needs_operator_test') {
    return <Clock3 className="size-4 text-primary" aria-hidden="true" />;
  }
  return <LockKeyhole className="size-4 text-muted-foreground" aria-hidden="true" />;
}

function stepStateLabel(step: OnboardingStep): string {
  switch (step.state) {
    case 'complete':
      return 'Complete';
    case 'incomplete':
      return step.required ? 'Required' : 'Recommended';
    case 'needs_operator_test':
      return 'Operator test';
    case 'not_required':
      return 'Recommended';
    default:
      return 'Unavailable';
  }
}

function availableTransition(
  snapshot: ClinicOnboardingSnapshot,
): ClinicOnboardingStatus | null {
  if (snapshot.canStartTesting) return 'TESTING';
  if (snapshot.canMarkReady) return 'READY';
  if (snapshot.canGoLive) return 'LIVE';
  return null;
}

export function OnboardingDashboard({
  snapshot,
  accountRole,
  loading,
  error,
  transitionError,
  pendingStatus,
  onRetry,
  onTransition,
}: OnboardingDashboardProps) {
  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading onboarding">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4" role="alert">
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Unable to load onboarding</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button type="button" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (!snapshot) return null;

  const status = snapshot.onboardingStatus ?? 'REGISTERED';
  const nextAction = snapshot.nextStep
    ? NEXT_STEP_LABELS[snapshot.nextStep]
    : 'No further onboarding action is required.';
  const transition = availableTransition(snapshot);
  const canTransition =
    transition !== null && accountRole !== null && hasMinRole(accountRole, 'admin');

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-medium text-primary">ClinicConnect</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Onboarding dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Configure, test, and prepare your clinic for go-live from one account-scoped checklist.
          </p>
        </div>
        <Badge variant={status === 'BLOCKED' ? 'destructive' : 'outline'} aria-label={`Onboarding status: ${status}`}>
          {status}
        </Badge>
      </div>

      {transitionError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Status update failed</AlertTitle>
          <AlertDescription>{transitionError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Current status</CardDescription>
            <CardTitle>{status}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {STATUS_DESCRIPTIONS[status]}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Required setup</CardDescription>
            <CardTitle>
              {snapshot.completedRequiredSteps}/{snapshot.requiredSteps}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`Required setup ${snapshot.progressPercent ?? 0}% complete`}>
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${snapshot.progressPercent ?? 0}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{snapshot.progressPercent ?? 0}% complete</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Next recommended action</CardDescription>
            <CardTitle className="text-base">{nextAction}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {snapshot.readyToTest ? 'All required checklist items are complete.' : 'Complete the required items before advancing.'}
            {snapshot.nextStep && NEXT_STEP_HREFS[snapshot.nextStep] ? (
              <Link href={NEXT_STEP_HREFS[snapshot.nextStep]!} className="mt-3 inline-flex rounded-md text-primary underline-offset-4 hover:underline">
                Open {snapshot.nextStep === 'clinic_profile' ? 'clinic profile' : snapshot.nextStep === 'doctors' ? 'doctor management' : snapshot.nextStep === 'services' ? 'service management' : 'schedule management'}
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Setup checklist</CardTitle>
          <CardDescription>Required items are evaluated first; recommended readiness items can follow.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-2">
            {snapshot.steps.map((step) => (
              <li key={step.key} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <StepIcon state={step.state} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{STEP_LABELS[step.key]}</span>
                    <Badge variant={step.required ? 'secondary' : 'outline'}>{step.required ? 'Required' : 'Recommended'}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{stepStateLabel(step)}{typeof step.count === 'number' ? ` · ${step.count}` : ''}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Readiness review</CardTitle>
            <CardDescription>Resolve blockers before requesting the next status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {snapshot.readyToTest ? (
              <p className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="size-4" /> Required setup is ready for testing.</p>
            ) : (
              <p className="flex items-center gap-2 text-amber-600 dark:text-amber-400"><AlertCircle className="size-4" /> {nextAction}</p>
            )}
            {status === 'BLOCKED' ? <p className="text-muted-foreground">An administrator must review the blocker before restarting onboarding.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Optional readiness</CardTitle>
            <CardDescription>These capabilities improve launch readiness but do not block the core checklist.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2"><MessageCircle className="size-4" /> WhatsApp connection</p>
            <p className="flex items-center gap-2"><ShieldCheck className="size-4" /> Automations and approved templates</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Onboarding controls</CardTitle>
          <CardDescription>
            Status transitions are validated by the server for your authenticated account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {canTransition ? (
            <Button type="button" onClick={() => onTransition(transition)} disabled={pendingStatus !== null}>
              {pendingStatus === transition ? <Loader2 className="animate-spin" /> : <Play />}
              {transition === 'TESTING' ? 'Start testing' : transition === 'READY' ? 'Mark ready' : 'Go live'}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              {accountRole && !hasMinRole(accountRole, 'admin')
                ? 'Only account owners and admins can change onboarding status.'
                : 'No valid status transition is available until the checklist allows it.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
