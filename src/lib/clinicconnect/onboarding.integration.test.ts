import { randomUUID } from 'node:crypto'

import { loadEnvConfig } from '@next/env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { acquireLocalIntegrationLock } from './local-integration-lock'

loadEnvConfig(process.cwd())

// The canonical reader accepts an already-derived server context. Mocking its
// unused SSR-client constructor lets this local integration test use two real
// authenticated anon clients without manufacturing Next.js request cookies.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const {
  getClinicOnboardingSnapshot,
  transitionClinicOnboardingStatusForContext,
} = await import('./onboarding')

const requiredEnvironment = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'TEST_CLINIC_A_EMAIL',
  'TEST_CLINIC_A_PASSWORD',
  'TEST_CLINIC_A_ACCOUNT_ID',
  'TEST_CLINIC_B_EMAIL',
  'TEST_CLINIC_B_PASSWORD',
  'TEST_CLINIC_B_ACCOUNT_ID',
] as const

const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name])
const localDescribe = missingEnvironment.length ? describe.skip : describe
const integrationTimeout = 30_000
const runId = randomUUID()

interface AuthenticatedUser {
  client: SupabaseClient
  accountId: string
}

interface ClinicData {
  profileId: string
  doctorId?: string
  serviceId?: string
  scheduleId?: string
}

let userA: AuthenticatedUser | undefined
let userB: AuthenticatedUser | undefined
let clinicA: ClinicData | undefined
let clinicB: ClinicData | undefined
let releaseIntegrationLock: (() => Promise<void>) | undefined

function env(name: (typeof requiredEnvironment)[number]): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function assertLocalPublicEnvironment() {
  const url = new URL(env('NEXT_PUBLIC_SUPABASE_URL'))
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error(`Refusing onboarding integration mutations against ${url.origin}`)
  }
  const key = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (key.startsWith('sb_secret_')) {
    throw new Error('Refusing onboarding integration assertions with a secret key')
  }
  const [, payload] = key.split('.')
  if (payload) {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      role?: string
    }
    if (claims.role === 'service_role') {
      throw new Error('Refusing onboarding integration assertions with a service-role JWT')
    }
  }
}

async function authenticate(
  email: string,
  password: string,
  accountId: string,
): Promise<AuthenticatedUser> {
  const client = createClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } },
  )
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    throw new Error(`Authentication failed for ${email}: ${error?.message ?? 'no user returned'}`)
  }
  return { client, accountId }
}

function context(user: AuthenticatedUser) {
  return { accountId: user.accountId, supabase: user.client } as Parameters<
    typeof getClinicOnboardingSnapshot
  >[0]
}

async function insertProfile(user: AuthenticatedUser, bookingEnabled: boolean): Promise<ClinicData> {
  const { data, error } = await user.client
    .from('clinic_profiles')
    .insert({
      account_id: user.accountId,
      clinic_name: `Onboarding ${runId}`,
      booking_enabled: bookingEnabled,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not create clinic profile: ${error?.message}`)
  return { profileId: data.id }
}

async function makeBookingReady(user: AuthenticatedUser, clinic: ClinicData) {
  const { data: doctor, error: doctorError } = await user.client
    .from('clinic_doctors')
    .insert({ account_id: user.accountId, name: `Doctor ${runId}` })
    .select('id')
    .single()
  if (doctorError || !doctor) throw new Error(`Could not create doctor: ${doctorError?.message}`)

  const { data: service, error: serviceError } = await user.client
    .from('clinic_services')
    .insert({ account_id: user.accountId, name: `Service ${runId}`, duration_minutes: 30 })
    .select('id')
    .single()
  if (serviceError || !service) throw new Error(`Could not create service: ${serviceError?.message}`)

  const { data: schedule, error: scheduleError } = await user.client
    .from('doctor_schedules')
    .insert({
      account_id: user.accountId,
      doctor_id: doctor.id,
      day_of_week: 1,
      start_time: '09:00',
      end_time: '17:00',
      slot_duration_minutes: 30,
    })
    .select('id')
    .single()
  if (scheduleError || !schedule) throw new Error(`Could not create schedule: ${scheduleError?.message}`)

  Object.assign(clinic, {
    doctorId: doctor.id,
    serviceId: service.id,
    scheduleId: schedule.id,
  })
}

async function cleanup(user: AuthenticatedUser | undefined, clinic: ClinicData | undefined) {
  if (!user || !clinic) return []
  const operations = [
    clinic.scheduleId && user.client.from('doctor_schedules').delete().eq('id', clinic.scheduleId),
    clinic.serviceId && user.client.from('clinic_services').delete().eq('id', clinic.serviceId),
    clinic.doctorId && user.client.from('clinic_doctors').delete().eq('id', clinic.doctorId),
    user.client.from('clinic_profiles').delete().eq('id', clinic.profileId),
  ].filter(Boolean) as PromiseLike<{ error: { message: string } | null }>[]
  const results = await Promise.all(operations)
  return results.flatMap((result) => (result.error ? [result.error.message] : []))
}

localDescribe('ClinicConnect onboarding local integration', () => {
  it(
    'derives each authenticated account independently and never accepts cross-account mutation scope',
    async () => {
      assertLocalPublicEnvironment()
      releaseIntegrationLock = await acquireLocalIntegrationLock()
      userA = await authenticate(
        env('TEST_CLINIC_A_EMAIL'),
        env('TEST_CLINIC_A_PASSWORD'),
        env('TEST_CLINIC_A_ACCOUNT_ID'),
      )
      userB = await authenticate(
        env('TEST_CLINIC_B_EMAIL'),
        env('TEST_CLINIC_B_PASSWORD'),
        env('TEST_CLINIC_B_ACCOUNT_ID'),
      )
      clinicA = await insertProfile(userA, false)
      clinicB = await insertProfile(userB, true)

      const aInitial = await getClinicOnboardingSnapshot(context(userA))
      const bInitial = await getClinicOnboardingSnapshot(context(userB))
      expect(aInitial).toMatchObject({ onboardingStatus: 'REGISTERED', readyToTest: true })
      expect(bInitial).toMatchObject({ onboardingStatus: 'REGISTERED', readyToTest: false })

      const { data: crossRead, error: crossReadError } = await userA.client
        .from('clinic_profiles')
        .select('id')
        .eq('id', clinicB.profileId)
      expect(crossReadError).toBeNull()
      expect(crossRead).toEqual([])

      await expect(
        transitionClinicOnboardingStatusForContext(context(userB), 'TESTING'),
      ).rejects.toMatchObject({ code: 'prerequisites_incomplete' })

      await makeBookingReady(userB, clinicB)
      const bTesting = await transitionClinicOnboardingStatusForContext(
        context(userB),
        'TESTING',
      )
      expect(bTesting.onboardingStatus).toBe('TESTING')

      const aAfterBMutation = await getClinicOnboardingSnapshot(context(userA))
      expect(aAfterBMutation.onboardingStatus).toBe('REGISTERED')
      expect(aAfterBMutation.readyToTest).toBe(true)
    },
    integrationTimeout,
  )

  afterAll(async () => {
    try {
      const errors = [
        ...(await cleanup(userA, clinicA)),
        ...(await cleanup(userB, clinicB)),
      ]
      await Promise.all([userA?.client.auth.signOut(), userB?.client.auth.signOut()])
      expect(errors).toEqual([])
    } finally {
      await releaseIntegrationLock?.()
    }
  })
})
