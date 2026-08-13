export const CLINIC_ONBOARDING_STATUSES = [
  'REGISTERED',
  'TESTING',
  'READY',
  'LIVE',
  'BLOCKED',
] as const;

export type ClinicOnboardingStatus =
  (typeof CLINIC_ONBOARDING_STATUSES)[number];

export type OnboardingStepKey =
  | 'clinic_profile'
  | 'doctors'
  | 'services'
  | 'schedules'
  | 'patients'
  | 'whatsapp'
  | 'automations'
  | 'testing';

export type OnboardingStepState =
  | 'complete'
  | 'incomplete'
  | 'not_required'
  | 'needs_operator_test'
  | 'unavailable';

export type OnboardingNextStep = OnboardingStepKey | 'review_blocker';

export interface OnboardingStep {
  key: OnboardingStepKey;
  state: OnboardingStepState;
  required: boolean;
  detailKey: string;
  count?: number;
  missingDoctorIds?: string[];
}

export interface ClinicOnboardingSnapshot {
  onboardingStatus: ClinicOnboardingStatus | null;
  bookingEnabled: boolean | null;
  steps: OnboardingStep[];
  completedRequiredSteps: number;
  requiredSteps: number;
  progressPercent: number | null;
  nextStep: OnboardingNextStep | null;
  readyToTest: boolean;
  canStartTesting: boolean;
  canMarkReady: boolean;
  canGoLive: boolean;
}

export interface OnboardingEvidence {
  profile: {
    clinicName: string | null;
    timezone: string | null;
    bookingEnabled: boolean;
    onboardingStatus: ClinicOnboardingStatus;
  } | null;
  activeDoctorIds: string[];
  activeServiceCount: number;
  scheduledDoctorIds: string[];
  patientCount: number;
  whatsapp: {
    exists: boolean;
    status: string | null;
    phoneNumberId: string | null;
    connectedAt: string | null;
    lastRegistrationError: string | null;
  };
  automations: {
    activeAutomationCount: number;
    activeFlowCount: number;
    approvedTemplateCount: number;
  };
}

export function isClinicOnboardingStatus(
  value: unknown
): value is ClinicOnboardingStatus {
  return (
    typeof value === 'string' &&
    (CLINIC_ONBOARDING_STATUSES as readonly string[]).includes(value)
  );
}

function hasText(value: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function step(
  key: OnboardingStepKey,
  state: OnboardingStepState,
  required: boolean,
  detailKey: string,
  extras: Pick<OnboardingStep, 'count' | 'missingDoctorIds'> = {}
): OnboardingStep {
  return { key, state, required, detailKey, ...extras };
}

/**
 * Pure checklist evaluator. The server-side reader supplies only records that
 * were read through the current authenticated account context; this function
 * deliberately has no account id or database access of its own.
 */
export function calculateClinicOnboardingSnapshot(
  evidence: OnboardingEvidence
): ClinicOnboardingSnapshot {
  const profileComplete =
    evidence.profile !== null &&
    hasText(evidence.profile.clinicName) &&
    hasText(evidence.profile.timezone);
  const bookingEnabled = evidence.profile?.bookingEnabled ?? null;
  const bookingRequired = bookingEnabled === true;
  const missingDoctorIds = bookingRequired
    ? evidence.activeDoctorIds.filter(
        (doctorId) => !evidence.scheduledDoctorIds.includes(doctorId)
      )
    : [];
  const whatsappPersistedReady =
    evidence.whatsapp.exists &&
    evidence.whatsapp.status === 'connected' &&
    hasText(evidence.whatsapp.phoneNumberId) &&
    evidence.whatsapp.connectedAt !== null &&
    evidence.whatsapp.lastRegistrationError === null;
  const optionalAutomationCount =
    evidence.automations.activeAutomationCount +
    evidence.automations.activeFlowCount +
    evidence.automations.approvedTemplateCount;

  const steps: OnboardingStep[] = [
    step(
      'clinic_profile',
      profileComplete ? 'complete' : 'incomplete',
      true,
      profileComplete
        ? 'clinicconnect.onboarding.clinicProfile.complete'
        : 'clinicconnect.onboarding.clinicProfile.incomplete'
    ),
    step(
      'doctors',
      bookingEnabled === null
        ? 'unavailable'
        : !bookingRequired
          ? 'not_required'
          : evidence.activeDoctorIds.length > 0
            ? 'complete'
            : 'incomplete',
      bookingRequired,
      bookingEnabled === null
        ? 'clinicconnect.onboarding.doctors.awaitingProfile'
        : !bookingRequired
          ? 'clinicconnect.onboarding.doctors.notRequired'
          : evidence.activeDoctorIds.length > 0
            ? 'clinicconnect.onboarding.doctors.complete'
            : 'clinicconnect.onboarding.doctors.incomplete',
      { count: evidence.activeDoctorIds.length }
    ),
    step(
      'services',
      bookingEnabled === null
        ? 'unavailable'
        : !bookingRequired
          ? 'not_required'
          : evidence.activeServiceCount > 0
            ? 'complete'
            : 'incomplete',
      bookingRequired,
      bookingEnabled === null
        ? 'clinicconnect.onboarding.services.awaitingProfile'
        : !bookingRequired
          ? 'clinicconnect.onboarding.services.notRequired'
          : evidence.activeServiceCount > 0
            ? 'clinicconnect.onboarding.services.complete'
            : 'clinicconnect.onboarding.services.incomplete',
      { count: evidence.activeServiceCount }
    ),
    step(
      'schedules',
      bookingEnabled === null
        ? 'unavailable'
        : !bookingRequired
          ? 'not_required'
          : missingDoctorIds.length === 0 && evidence.activeDoctorIds.length > 0
            ? 'complete'
            : 'incomplete',
      bookingRequired,
      bookingEnabled === null
        ? 'clinicconnect.onboarding.schedules.awaitingProfile'
        : !bookingRequired
          ? 'clinicconnect.onboarding.schedules.notRequired'
          : missingDoctorIds.length === 0 && evidence.activeDoctorIds.length > 0
            ? 'clinicconnect.onboarding.schedules.complete'
            : 'clinicconnect.onboarding.schedules.incomplete',
      {
        count: evidence.scheduledDoctorIds.length,
        missingDoctorIds,
      }
    ),
    step(
      'patients',
      'not_required',
      false,
      'clinicconnect.onboarding.patients.optional',
      { count: evidence.patientCount }
    ),
    step(
      'whatsapp',
      whatsappPersistedReady ? 'complete' : 'incomplete',
      false,
      whatsappPersistedReady
        ? 'clinicconnect.onboarding.whatsapp.persistedReady'
        : 'clinicconnect.onboarding.whatsapp.optional'
    ),
    step(
      'automations',
      'not_required',
      false,
      'clinicconnect.onboarding.automations.optional',
      { count: optionalAutomationCount }
    ),
    step(
      'testing',
      'needs_operator_test',
      false,
      'clinicconnect.onboarding.testing.operatorRequired'
    ),
  ];

  const required = steps.filter((item) => item.required);
  const completedRequiredSteps = required.filter(
    (item) => item.state === 'complete'
  ).length;
  const readyToTest =
    evidence.profile !== null && completedRequiredSteps === required.length;
  const status = evidence.profile?.onboardingStatus ?? null;
  const firstIncomplete = required.find((item) => item.state !== 'complete');
  const nextStep: OnboardingNextStep | null =
    status === 'READY' || status === 'LIVE'
      ? null
      : status === 'BLOCKED'
        ? 'review_blocker'
        : (firstIncomplete?.key ?? 'testing');

  return {
    onboardingStatus: status,
    bookingEnabled,
    steps,
    completedRequiredSteps,
    requiredSteps: required.length,
    progressPercent:
      required.length === 0
        ? null
        : Math.round((100 * completedRequiredSteps) / required.length),
    nextStep,
    readyToTest,
    canStartTesting: status === 'REGISTERED' && readyToTest,
    canMarkReady: status === 'TESTING' && readyToTest,
    canGoLive: status === 'READY' && readyToTest,
  };
}

export class OnboardingError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'clinic_profile_unavailable'
      | 'prerequisites_incomplete'
      | 'invalid_status_transition'
      | 'onboarding_unavailable',
    readonly status: 400 | 409 | 500
  ) {
    super(message);
    this.name = 'OnboardingError';
  }
}

export function assertOnboardingTransition(
  snapshot: ClinicOnboardingSnapshot,
  target: ClinicOnboardingStatus
): void {
  const current = snapshot.onboardingStatus;
  if (!current) {
    throw new OnboardingError(
      'Clinic profile is unavailable',
      'clinic_profile_unavailable',
      409
    );
  }

  const allowed =
    (current === 'REGISTERED' &&
      (target === 'TESTING' || target === 'BLOCKED')) ||
    (current === 'TESTING' &&
      (target === 'REGISTERED' ||
        target === 'READY' ||
        target === 'BLOCKED')) ||
    (current === 'READY' &&
      (target === 'TESTING' || target === 'LIVE' || target === 'BLOCKED')) ||
    (current === 'BLOCKED' &&
      (target === 'REGISTERED' || target === 'TESTING'));

  if (!allowed) {
    throw new OnboardingError(
      `Cannot transition onboarding status from ${current} to ${target}`,
      'invalid_status_transition',
      400
    );
  }

  const requiresChecklist =
    (current === 'REGISTERED' && target === 'TESTING') ||
    (current === 'BLOCKED' && target === 'TESTING') ||
    (current === 'TESTING' && target === 'READY') ||
    (current === 'READY' && target === 'LIVE');
  if (requiresChecklist && !snapshot.readyToTest) {
    throw new OnboardingError(
      'Required onboarding prerequisites are incomplete',
      'prerequisites_incomplete',
      409
    );
  }
}
