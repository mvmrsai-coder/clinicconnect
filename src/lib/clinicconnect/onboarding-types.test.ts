import { describe, expect, it } from 'vitest'

import {
  assertOnboardingTransition,
  calculateClinicOnboardingSnapshot,
  type OnboardingEvidence,
  OnboardingError,
} from './onboarding-types'

function evidence(overrides: Partial<OnboardingEvidence> = {}): OnboardingEvidence {
  return {
    profile: {
      clinicName: 'Northstar Clinic',
      timezone: 'Asia/Kolkata',
      bookingEnabled: true,
      onboardingStatus: 'REGISTERED',
    },
    activeDoctorIds: ['doctor-1'],
    activeServiceCount: 1,
    scheduledDoctorIds: ['doctor-1'],
    patientCount: 0,
    whatsapp: {
      exists: false,
      status: null,
      phoneNumberId: null,
      connectedAt: null,
      lastRegistrationError: null,
    },
    automations: {
      activeAutomationCount: 0,
      activeFlowCount: 0,
      approvedTemplateCount: 0,
    },
    ...overrides,
  }
}

function stepState(snapshot: ReturnType<typeof calculateClinicOnboardingSnapshot>, key: string) {
  return snapshot.steps.find((step) => step.key === key)?.state
}

describe('ClinicConnect onboarding checklist', () => {
  it('starts a newly created clinic profile in REGISTERED', () => {
    const snapshot = calculateClinicOnboardingSnapshot(evidence())
    expect(snapshot.onboardingStatus).toBe('REGISTERED')
    expect(snapshot.progressPercent).toBe(100)
    expect(snapshot.nextStep).toBe('testing')
  })

  it('marks a blank clinic name as incomplete', () => {
    const snapshot = calculateClinicOnboardingSnapshot(
      evidence({ profile: { ...evidence().profile!, clinicName: '  ' } }),
    )
    expect(stepState(snapshot, 'clinic_profile')).toBe('incomplete')
    expect(snapshot.readyToTest).toBe(false)
    expect(snapshot.nextStep).toBe('clinic_profile')
  })

  it('recognises a complete profile without treating optional patients as blocking', () => {
    const snapshot = calculateClinicOnboardingSnapshot(evidence({ patientCount: 0 }))
    expect(stepState(snapshot, 'clinic_profile')).toBe('complete')
    expect(stepState(snapshot, 'patients')).toBe('not_required')
    expect(snapshot.readyToTest).toBe(true)
  })

  it('does not require doctors, services, or schedules when booking is disabled', () => {
    const snapshot = calculateClinicOnboardingSnapshot(
      evidence({
        profile: { ...evidence().profile!, bookingEnabled: false },
        activeDoctorIds: [],
        activeServiceCount: 0,
        scheduledDoctorIds: [],
      }),
    )
    expect(snapshot.requiredSteps).toBe(1)
    expect(snapshot.progressPercent).toBe(100)
    expect(snapshot.readyToTest).toBe(true)
    expect(stepState(snapshot, 'doctors')).toBe('not_required')
    expect(stepState(snapshot, 'services')).toBe('not_required')
    expect(stepState(snapshot, 'schedules')).toBe('not_required')
  })

  it('blocks booking readiness when no active doctor exists', () => {
    const snapshot = calculateClinicOnboardingSnapshot(
      evidence({ activeDoctorIds: [], scheduledDoctorIds: [] }),
    )
    expect(stepState(snapshot, 'doctors')).toBe('incomplete')
    expect(snapshot.nextStep).toBe('doctors')
  })

  it('blocks booking readiness when no active service exists', () => {
    const snapshot = calculateClinicOnboardingSnapshot(
      evidence({ activeServiceCount: 0 }),
    )
    expect(stepState(snapshot, 'services')).toBe('incomplete')
    expect(snapshot.nextStep).toBe('services')
  })

  it('blocks booking readiness for every active doctor missing an active schedule', () => {
    const snapshot = calculateClinicOnboardingSnapshot(
      evidence({ activeDoctorIds: ['doctor-1', 'doctor-2'], scheduledDoctorIds: ['doctor-1'] }),
    )
    const schedules = snapshot.steps.find((step) => step.key === 'schedules')
    expect(schedules?.state).toBe('incomplete')
    expect(schedules?.missingDoctorIds).toEqual(['doctor-2'])
  })

  it('is ready when booking prerequisites have active doctors, services, and schedules', () => {
    const snapshot = calculateClinicOnboardingSnapshot(evidence())
    expect(snapshot).toMatchObject({
      completedRequiredSteps: 4,
      requiredSteps: 4,
      progressPercent: 100,
      readyToTest: true,
      canStartTesting: true,
    })
  })

  it('allows REGISTERED to TESTING only when prerequisites are complete', () => {
    expect(() =>
      assertOnboardingTransition(calculateClinicOnboardingSnapshot(evidence()), 'TESTING'),
    ).not.toThrow()
    expect(() =>
      assertOnboardingTransition(
        calculateClinicOnboardingSnapshot(evidence({ activeDoctorIds: [], scheduledDoctorIds: [] })),
        'TESTING',
      ),
    ).toThrow(expect.objectContaining({ code: 'prerequisites_incomplete' }))
  })

  it('allows TESTING to READY only when required conditions still pass', () => {
    const ready = calculateClinicOnboardingSnapshot(
      evidence({ profile: { ...evidence().profile!, onboardingStatus: 'TESTING' } }),
    )
    expect(() => assertOnboardingTransition(ready, 'READY')).not.toThrow()

    const incomplete = calculateClinicOnboardingSnapshot(
      evidence({
        profile: { ...evidence().profile!, onboardingStatus: 'TESTING' },
        activeServiceCount: 0,
      }),
    )
    expect(() => assertOnboardingTransition(incomplete, 'READY')).toThrow(
      expect.objectContaining({ code: 'prerequisites_incomplete' }),
    )
  })

  it('allows READY to LIVE only when required conditions still pass', () => {
    const ready = calculateClinicOnboardingSnapshot(
      evidence({ profile: { ...evidence().profile!, onboardingStatus: 'READY' } }),
    )
    expect(() => assertOnboardingTransition(ready, 'LIVE')).not.toThrow()
  })

  it('rejects invalid transitions without changing the snapshot', () => {
    const snapshot = calculateClinicOnboardingSnapshot(evidence())
    expect(() => assertOnboardingTransition(snapshot, 'LIVE')).toThrow(OnboardingError)
    expect(snapshot.onboardingStatus).toBe('REGISTERED')
  })

  it('allows BLOCKED from non-live states and requires an explicit recovery transition', () => {
    const registered = calculateClinicOnboardingSnapshot(evidence())
    expect(() => assertOnboardingTransition(registered, 'BLOCKED')).not.toThrow()

    const blocked = calculateClinicOnboardingSnapshot(
      evidence({ profile: { ...evidence().profile!, onboardingStatus: 'BLOCKED' } }),
    )
    expect(blocked.nextStep).toBe('review_blocker')
    expect(() => assertOnboardingTransition(blocked, 'REGISTERED')).not.toThrow()

    const live = calculateClinicOnboardingSnapshot(
      evidence({ profile: { ...evidence().profile!, onboardingStatus: 'LIVE' } }),
    )
    expect(() => assertOnboardingTransition(live, 'BLOCKED')).toThrow(
      expect.objectContaining({ code: 'invalid_status_transition' }),
    )
  })
})
