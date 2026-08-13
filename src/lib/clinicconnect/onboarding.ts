// Server-side ClinicConnect onboarding reader and state transition service.
// Account scope always comes from AccountContext, which is derived from the
// authenticated SSR session in getCurrentAccount()/requireRole().

import {
  getCurrentAccount,
  requireRole,
  type AccountContext,
} from '@/lib/auth/account';

import {
  calculateClinicOnboardingSnapshot,
  isClinicOnboardingStatus,
  type ClinicOnboardingSnapshot,
  type ClinicOnboardingStatus,
  type OnboardingEvidence,
  OnboardingError,
  assertOnboardingTransition,
} from './onboarding-types';

export * from './onboarding-types';

type AccountScopedContext = Pick<AccountContext, 'accountId' | 'supabase'>;

function countFrom(result: { count: number | null }): number {
  return result.count ?? 0;
}

/**
 * The canonical database-backed onboarding calculation. Callers cannot supply
 * an account id from a browser request; they supply an already-authenticated
 * server AccountContext instead.
 */
export async function getClinicOnboardingSnapshot(
  context: AccountScopedContext
): Promise<ClinicOnboardingSnapshot> {
  const accountId = context.accountId;
  const supabase = context.supabase;

  const [
    profileResult,
    doctorsResult,
    servicesResult,
    schedulesResult,
    patientsResult,
    whatsappResult,
    automationsResult,
    flowsResult,
    templatesResult,
  ] = await Promise.all([
    supabase
      .from('clinic_profiles')
      .select('clinic_name, timezone, booking_enabled, onboarding_status')
      .eq('account_id', accountId)
      .maybeSingle(),
    supabase
      .from('clinic_doctors')
      .select('id')
      .eq('account_id', accountId)
      .eq('is_active', true),
    supabase
      .from('clinic_services')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('is_active', true),
    supabase
      .from('doctor_schedules')
      .select('doctor_id')
      .eq('account_id', accountId)
      .eq('is_active', true),
    supabase
      .from('patient_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId),
    supabase
      .from('whatsapp_config')
      .select('phone_number_id, status, connected_at, last_registration_error')
      .eq('account_id', accountId)
      .maybeSingle(),
    supabase
      .from('automations')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('is_active', true),
    supabase
      .from('flows')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'active'),
    supabase
      .from('message_templates')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'Approved'),
  ]);

  const requiredResults = [
    profileResult,
    doctorsResult,
    servicesResult,
    schedulesResult,
    patientsResult,
  ];
  if (requiredResults.some((result) => result.error)) {
    console.error('[clinicconnect/onboarding] required checklist query failed');
    throw new OnboardingError(
      'Onboarding information is temporarily unavailable',
      'onboarding_unavailable',
      500
    );
  }

  if (
    profileResult.data &&
    !isClinicOnboardingStatus(profileResult.data.onboarding_status)
  ) {
    console.error(
      '[clinicconnect/onboarding] invalid persisted onboarding status'
    );
    throw new OnboardingError(
      'Onboarding information is temporarily unavailable',
      'onboarding_unavailable',
      500
    );
  }

  const optionalErrors = [
    whatsappResult.error,
    automationsResult.error,
    flowsResult.error,
    templatesResult.error,
  ].some(Boolean);
  if (optionalErrors) {
    console.warn('[clinicconnect/onboarding] optional readiness query failed');
  }

  const evidence: OnboardingEvidence = {
    profile: profileResult.data
      ? {
          clinicName: profileResult.data.clinic_name,
          timezone: profileResult.data.timezone,
          bookingEnabled: profileResult.data.booking_enabled,
          onboardingStatus: profileResult.data.onboarding_status,
        }
      : null,
    activeDoctorIds: (doctorsResult.data ?? []).map((doctor) => doctor.id),
    activeServiceCount: countFrom(servicesResult),
    scheduledDoctorIds: (schedulesResult.data ?? []).map(
      (schedule) => schedule.doctor_id
    ),
    patientCount: countFrom(patientsResult),
    whatsapp:
      whatsappResult.error || !whatsappResult.data
        ? {
            exists: false,
            status: null,
            phoneNumberId: null,
            connectedAt: null,
            lastRegistrationError: null,
          }
        : {
            exists: true,
            status: whatsappResult.data.status,
            phoneNumberId: whatsappResult.data.phone_number_id,
            connectedAt: whatsappResult.data.connected_at,
            lastRegistrationError: whatsappResult.data.last_registration_error,
          },
    automations: {
      activeAutomationCount: automationsResult.error
        ? 0
        : countFrom(automationsResult),
      activeFlowCount: flowsResult.error ? 0 : countFrom(flowsResult),
      approvedTemplateCount: templatesResult.error
        ? 0
        : countFrom(templatesResult),
    },
  };

  return calculateClinicOnboardingSnapshot(evidence);
}

export async function getCurrentClinicOnboarding(): Promise<ClinicOnboardingSnapshot> {
  return getClinicOnboardingSnapshot(await getCurrentAccount());
}

export async function transitionClinicOnboardingStatusForContext(
  context: AccountScopedContext,
  target: ClinicOnboardingStatus
): Promise<ClinicOnboardingSnapshot> {
  const snapshot = await getClinicOnboardingSnapshot(context);
  assertOnboardingTransition(snapshot, target);

  const { data, error } = await context.supabase
    .from('clinic_profiles')
    .update({ onboarding_status: target })
    .eq('account_id', context.accountId)
    .select('onboarding_status')
    .maybeSingle();

  if (error || !data || data.onboarding_status !== target) {
    console.error('[clinicconnect/onboarding] status update failed');
    throw new OnboardingError(
      'Onboarding information is temporarily unavailable',
      'onboarding_unavailable',
      500
    );
  }

  return getClinicOnboardingSnapshot(context);
}

export async function transitionClinicOnboardingStatus(
  target: ClinicOnboardingStatus
): Promise<ClinicOnboardingSnapshot> {
  return transitionClinicOnboardingStatusForContext(
    await requireRole('admin'),
    target
  );
}
