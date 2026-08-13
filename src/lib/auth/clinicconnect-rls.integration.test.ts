import { randomUUID } from 'node:crypto';

import { loadEnvConfig } from '@next/env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

// This is a local integration test, not a mocked unit test. Loading env here
// preserves Next.js's test-environment load order, including .env.test.local.
loadEnvConfig(process.cwd());

const requiredEnvironment = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'TEST_CLINIC_A_EMAIL',
  'TEST_CLINIC_A_PASSWORD',
  'TEST_CLINIC_A_ACCOUNT_ID',
  'TEST_CLINIC_B_EMAIL',
  'TEST_CLINIC_B_PASSWORD',
  'TEST_CLINIC_B_ACCOUNT_ID',
] as const;

const missingEnvironment = requiredEnvironment.filter(
  (name) => !process.env[name]
);
const localDescribe = missingEnvironment.length ? describe.skip : describe;

const expectedAccountAId = 'cf9b2121-335c-41ce-9b45-8f26fdd0dedf';
const expectedAccountBId = '075d6985-a6c4-4eae-bb73-07111d93442e';
const runId = randomUUID();
const label = `ClinicConnect RLS ${runId}`;
const appointmentDate = '2099-01-15';
const integrationTestTimeout = 30_000;

type Row = Record<string, unknown> & { id: string };

interface AuthenticatedUser {
  client: SupabaseClient;
  accountId: string;
  userId: string;
}

interface ClinicData {
  clinicProfileId: string;
  contactId: string;
  doctorId: string;
  scheduleId: string;
  patientId: string;
  serviceId: string;
  appointmentIds: string[];
}

const report = { passed: 0 };
let userA: AuthenticatedUser | undefined;
let userB: AuthenticatedUser | undefined;
let clinicA: ClinicData | undefined;
let clinicB: ClinicData | undefined;

function requireEnvironment(
  name: (typeof requiredEnvironment)[number]
): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requireTestAccountId(
  name: 'TEST_CLINIC_A_ACCOUNT_ID' | 'TEST_CLINIC_B_ACCOUNT_ID',
  expectedId: string
): string {
  const accountId = requireEnvironment(name);
  if (accountId !== expectedId) {
    throw new Error(
      `${name} must equal the configured local test account fixture ${expectedId}`
    );
  }
  return accountId;
}

function assertLocalSupabaseUrl(urlValue: string) {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL: ${urlValue}`);
  }

  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error(
      `Refusing to run ClinicConnect RLS mutations against non-local Supabase URL: ${url.origin}`
    );
  }
}

function assertPublicSupabaseKey(key: string) {
  if (key.startsWith('sb_secret_')) {
    throw new Error(
      'Refusing to run RLS assertions with a Supabase secret key'
    );
  }

  const [, payload] = key.split('.');
  if (!payload) return;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as { role?: string };
    if (claims.role === 'service_role') {
      throw new Error('Refusing to run RLS assertions with a service-role JWT');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Refusing')) {
      throw error;
    }
    // A publishable sb_publishable_ key is not a JWT and is valid here.
  }
}

function pass(message: string) {
  report.passed += 1;
  console.info(`PASS  ${message}`);
}

async function check(message: string, assertion: () => Promise<void>) {
  try {
    await assertion();
    pass(message);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`FAIL  ${message}: ${detail}`);
    throw error;
  }
}

async function authenticate(
  email: string,
  password: string,
  accountId: string
): Promise<AuthenticatedUser> {
  const client = createClient(
    requireEnvironment('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnvironment('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    }
  );
  const { data: authData, error: authError } =
    await client.auth.signInWithPassword({
      email,
      password,
    });

  if (authError || !authData.user) {
    throw new Error(
      `Authentication failed for ${email}: ${authError?.message ?? 'no user returned'}`
    );
  }

  return { client, accountId, userId: authData.user.id };
}

async function insertOne(
  client: SupabaseClient,
  table: string,
  values: Record<string, unknown>
): Promise<Row> {
  const { data, error } = await client
    .from(table)
    .insert(values)
    .select()
    .single();
  if (error || !data) {
    throw new Error(
      `Could not create ${table}: ${error?.message ?? 'no row returned'}`
    );
  }
  return data as Row;
}

function testPhone(suffix: string) {
  return `+1555${suffix
    .replace(/[^0-9]/g, '')
    .slice(0, 10)
    .padEnd(10, '0')}`;
}

async function createClinicData(
  user: AuthenticatedUser,
  suffix: string
): Promise<ClinicData> {
  const clinicProfile = await insertOne(user.client, 'clinic_profiles', {
    account_id: user.accountId,
    clinic_name: `${label} Clinic ${suffix}`,
  });
  const doctor = await insertOne(user.client, 'clinic_doctors', {
    account_id: user.accountId,
    name: `${label} Doctor ${suffix}`,
    specialization: 'Test medicine',
  });
  const schedule = await insertOne(user.client, 'doctor_schedules', {
    account_id: user.accountId,
    doctor_id: doctor.id,
    day_of_week: 1,
    start_time: '09:00',
    end_time: '17:00',
    slot_duration_minutes: 30,
  });
  const service = await insertOne(user.client, 'clinic_services', {
    account_id: user.accountId,
    name: `${label} Service ${suffix}`,
    duration_minutes: 30,
  });
  // Appointments have no doctor_schedules foreign key; the exact schema does
  // not require a schedule row for this security test.
  const contact = await insertOne(user.client, 'contacts', {
    account_id: user.accountId,
    user_id: user.userId,
    name: `${label} Contact ${suffix}`,
    phone: testPhone(`${runId}${suffix}`),
  });
  const patient = await insertOne(user.client, 'patient_profiles', {
    account_id: user.accountId,
    contact_id: contact.id,
    notes: 'Synthetic local RLS test record; not patient data.',
  });

  return {
    appointmentIds: [],
    clinicProfileId: clinicProfile.id,
    contactId: contact.id,
    doctorId: doctor.id,
    scheduleId: schedule.id,
    patientId: patient.id,
    serviceId: service.id,
  };
}

async function expectOwnRead(
  client: SupabaseClient,
  table: string,
  id: string
) {
  const { data, error } = await client
    .from(table)
    .select('id')
    .eq('id', id)
    .single();
  expect(error).toBeNull();
  expect(data?.id).toBe(id);
}

async function expectCrossTenantReadBlocked(
  client: SupabaseClient,
  table: string,
  id: string
) {
  const { data, error } = await client.from(table).select('id').eq('id', id);
  expect(error).toBeNull();
  expect(data).toEqual([]);
}

async function expectAppointmentForeignKeyBlocked(
  client: SupabaseClient,
  values: Record<string, unknown>,
  constraint: string
) {
  const { error } = await client.from('appointments').insert(values);
  expect(error).not.toBeNull();
  expect(error?.code).toBe('23503');
  expect(error?.message).toContain(constraint);
}

async function cleanupClinicData(
  user: AuthenticatedUser | undefined,
  data: ClinicData | undefined
) {
  if (!user || !data) return [];

  const deletes = [
    ...data.appointmentIds.map((id) =>
      user.client.from('appointments').delete().eq('id', id)
    ),
    user.client.from('patient_profiles').delete().eq('id', data.patientId),
    user.client.from('clinic_services').delete().eq('id', data.serviceId),
    user.client.from('doctor_schedules').delete().eq('id', data.scheduleId),
    user.client.from('clinic_doctors').delete().eq('id', data.doctorId),
    user.client.from('clinic_profiles').delete().eq('id', data.clinicProfileId),
    user.client.from('contacts').delete().eq('id', data.contactId),
  ];
  const results = await Promise.all(deletes);
  return results.flatMap(({ error }) => (error ? [error.message] : []));
}

localDescribe('ClinicConnect local multi-tenant RLS security', () => {
  it(
    'authenticates both owners and enforces account isolation',
    async () => {
      const supabaseUrl = requireEnvironment('NEXT_PUBLIC_SUPABASE_URL');
      const publicSupabaseKey = requireEnvironment(
        'NEXT_PUBLIC_SUPABASE_ANON_KEY'
      );
      assertLocalSupabaseUrl(supabaseUrl);
      assertPublicSupabaseKey(publicSupabaseKey);
      const accountAId = requireTestAccountId(
        'TEST_CLINIC_A_ACCOUNT_ID',
        expectedAccountAId
      );
      const accountBId = requireTestAccountId(
        'TEST_CLINIC_B_ACCOUNT_ID',
        expectedAccountBId
      );

      userA = await authenticate(
        requireEnvironment('TEST_CLINIC_A_EMAIL'),
        requireEnvironment('TEST_CLINIC_A_PASSWORD'),
        accountAId
      );
      userB = await authenticate(
        requireEnvironment('TEST_CLINIC_B_EMAIL'),
        requireEnvironment('TEST_CLINIC_B_PASSWORD'),
        accountBId
      );
      clinicA = await createClinicData(userA, 'A');
      clinicB = await createClinicData(userB, 'B');

      for (const [name, table, id] of [
        ['clinic profile', 'clinic_profiles', clinicA.clinicProfileId],
        ['doctor', 'clinic_doctors', clinicA.doctorId],
        ['schedule', 'doctor_schedules', clinicA.scheduleId],
        ['service', 'clinic_services', clinicA.serviceId],
        ['patient', 'patient_profiles', clinicA.patientId],
        ['contact', 'contacts', clinicA.contactId],
      ] as const) {
        await check(`User A can read own ${name}`, () =>
          expectOwnRead(userA!.client, table, id)
        );
      }
      for (const [name, table, id] of [
        ['clinic profile', 'clinic_profiles', clinicB.clinicProfileId],
        ['doctor', 'clinic_doctors', clinicB.doctorId],
        ['schedule', 'doctor_schedules', clinicB.scheduleId],
        ['service', 'clinic_services', clinicB.serviceId],
        ['patient', 'patient_profiles', clinicB.patientId],
        ['contact', 'contacts', clinicB.contactId],
      ] as const) {
        await check(`User B can read own ${name}`, () =>
          expectOwnRead(userB!.client, table, id)
        );
      }

      for (const [name, table, id] of [
        ['Clinic B clinic profile', 'clinic_profiles', clinicB.clinicProfileId],
        ['Clinic B doctor', 'clinic_doctors', clinicB.doctorId],
        ['Clinic B schedule', 'doctor_schedules', clinicB.scheduleId],
        ['Clinic B service', 'clinic_services', clinicB.serviceId],
        ['Clinic B patient', 'patient_profiles', clinicB.patientId],
        ['Clinic B contact', 'contacts', clinicB.contactId],
      ] as const) {
        await check(`User A cannot read ${name}`, () =>
          expectCrossTenantReadBlocked(userA!.client, table, id)
        );
      }
      for (const [name, table, id] of [
        ['Clinic A clinic profile', 'clinic_profiles', clinicA.clinicProfileId],
        ['Clinic A doctor', 'clinic_doctors', clinicA.doctorId],
        ['Clinic A schedule', 'doctor_schedules', clinicA.scheduleId],
        ['Clinic A service', 'clinic_services', clinicA.serviceId],
        ['Clinic A patient', 'patient_profiles', clinicA.patientId],
        ['Clinic A contact', 'contacts', clinicA.contactId],
      ] as const) {
        await check(`User B cannot read ${name}`, () =>
          expectCrossTenantReadBlocked(userB!.client, table, id)
        );
      }

      await check('User A cannot modify Clinic B schedule', async () => {
        const { data, error } = await userA!.client
          .from('doctor_schedules')
          .update({ slot_duration_minutes: 15 })
          .eq('id', clinicB!.scheduleId)
          .select('id');
        expect(error).toBeNull();
        expect(data).toEqual([]);
      });
      await check('User B cannot modify Clinic A schedule', async () => {
        const { data, error } = await userB!.client
          .from('doctor_schedules')
          .update({ slot_duration_minutes: 15 })
          .eq('id', clinicA!.scheduleId)
          .select('id');
        expect(error).toBeNull();
        expect(data).toEqual([]);
      });
      await check('User A cannot modify Clinic B patient', async () => {
        const { data, error } = await userA!.client
          .from('patient_profiles')
          .update({ notes: 'Intentional cross-tenant update rejection test.' })
          .eq('id', clinicB!.patientId)
          .select('id');
        expect(error).toBeNull();
        expect(data).toEqual([]);
      });
      await check('User B cannot modify Clinic A patient', async () => {
        const { data, error } = await userB!.client
          .from('patient_profiles')
          .update({ notes: 'Intentional cross-tenant update rejection test.' })
          .eq('id', clinicA!.patientId)
          .select('id');
        expect(error).toBeNull();
        expect(data).toEqual([]);
      });

      await check(
        'User A cannot associate Patient A with Contact B',
        async () => {
          const { error } = await userA!.client
            .from('patient_profiles')
            .insert({
              account_id: userA!.accountId,
              contact_id: clinicB!.contactId,
              notes: 'Intentional cross-tenant rejection test.',
            });
          expect(error).not.toBeNull();
        }
      );
      await check(
        'User B cannot associate Patient B with Contact A',
        async () => {
          const { error } = await userB!.client
            .from('patient_profiles')
            .insert({
              account_id: userB!.accountId,
              contact_id: clinicA!.contactId,
              notes: 'Intentional cross-tenant rejection test.',
            });
          expect(error).not.toBeNull();
        }
      );

      const appointmentForA = {
        account_id: userA.accountId,
        appointment_date: appointmentDate,
        doctor_id: clinicA.doctorId,
        end_time: '09:30',
        patient_profile_id: clinicA.patientId,
        service_id: clinicA.serviceId,
        start_time: '09:00',
      };
      await check('User A cannot create appointment using Doctor B', () =>
        expectAppointmentForeignKeyBlocked(
          userA!.client,
          { ...appointmentForA, doctor_id: clinicB!.doctorId },
          'appointments_account_id_doctor_id_fkey'
        )
      );
      await check('User A cannot create appointment using Service B', () =>
        expectAppointmentForeignKeyBlocked(
          userA!.client,
          { ...appointmentForA, service_id: clinicB!.serviceId },
          'appointments_account_id_service_id_fkey'
        )
      );
      await check('User A cannot create appointment using Patient B', () =>
        expectAppointmentForeignKeyBlocked(
          userA!.client,
          { ...appointmentForA, patient_profile_id: clinicB!.patientId },
          'appointments_account_id_patient_profile_id_fkey'
        )
      );

      await check('User A can create valid own appointment', async () => {
        const appointment = await insertOne(
          userA!.client,
          'appointments',
          appointmentForA
        );
        clinicA!.appointmentIds.push(appointment.id);
      });
      await check('User B can create valid own appointment', async () => {
        const appointment = await insertOne(userB!.client, 'appointments', {
          account_id: userB!.accountId,
          appointment_date: appointmentDate,
          doctor_id: clinicB!.doctorId,
          end_time: '10:30',
          patient_profile_id: clinicB!.patientId,
          service_id: clinicB!.serviceId,
          start_time: '10:00',
        });
        clinicB!.appointmentIds.push(appointment.id);
      });

      console.info(
        `PASS  ClinicConnect RLS assertion summary: ${report.passed} passed`
      );
    },
    integrationTestTimeout
  );

  afterAll(async () => {
    const errors = [
      ...(await cleanupClinicData(userA, clinicA)),
      ...(await cleanupClinicData(userB, clinicB)),
    ];
    await Promise.all([
      userA?.client.auth.signOut(),
      userB?.client.auth.signOut(),
    ]);
    expect(errors).toEqual([]);
  });
});
