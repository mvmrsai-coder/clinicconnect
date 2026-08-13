import { randomUUID } from 'node:crypto';

import { loadEnvConfig } from '@next/env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

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
const appointmentDate = '2099-02-15';
const integrationTestTimeout = 30_000;
const runId = randomUUID();

type Row = Record<string, unknown> & { id: string };

interface User {
  accountId: string;
  client: SupabaseClient;
  userId: string;
}

interface ClinicData {
  appointmentIds: string[];
  contactId: string;
  doctorId: string;
  secondDoctorId?: string;
  patientId: string;
  serviceId: string;
}

let userA: User | undefined;
let userB: User | undefined;
let clinicA: ClinicData | undefined;
let clinicB: ClinicData | undefined;

function requireEnvironment(
  name: (typeof requiredEnvironment)[number]
): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requireFixtureAccountId(
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

function assertLocalSupabaseUrl(value: string) {
  const url = new URL(value);
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error(
      `Refusing to run appointment conflict mutations against non-local Supabase URL: ${url.origin}`
    );
  }
}

function assertPublicSupabaseKey(key: string) {
  if (key.startsWith('sb_secret_')) {
    throw new Error('Refusing to run appointment tests with a secret key');
  }

  const [, payload] = key.split('.');
  if (!payload) return;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as { role?: string };
    if (claims.role === 'service_role') {
      throw new Error(
        'Refusing to run appointment tests with a service-role JWT'
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Refusing')) {
      throw error;
    }
  }
}

async function authenticate(
  email: string,
  password: string,
  accountId: string
): Promise<User> {
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
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    throw new Error(
      `Authentication failed for ${email}: ${error?.message ?? 'no user returned'}`
    );
  }
  return { accountId, client, userId: data.user.id };
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
  user: User,
  suffix: string,
  withSecondDoctor = false
): Promise<ClinicData> {
  const doctor = await insertOne(user.client, 'clinic_doctors', {
    account_id: user.accountId,
    name: `Conflict test doctor ${suffix} ${runId}`,
  });
  const secondDoctor = withSecondDoctor
    ? await insertOne(user.client, 'clinic_doctors', {
        account_id: user.accountId,
        name: `Conflict test doctor ${suffix} second ${runId}`,
      })
    : undefined;
  const service = await insertOne(user.client, 'clinic_services', {
    account_id: user.accountId,
    name: `Conflict test service ${suffix} ${runId}`,
    duration_minutes: 30,
  });
  const contact = await insertOne(user.client, 'contacts', {
    account_id: user.accountId,
    user_id: user.userId,
    name: `Conflict test contact ${suffix}`,
    phone: testPhone(`${runId}${suffix}`),
  });
  const patient = await insertOne(user.client, 'patient_profiles', {
    account_id: user.accountId,
    contact_id: contact.id,
  });

  return {
    appointmentIds: [],
    contactId: contact.id,
    doctorId: doctor.id,
    secondDoctorId: secondDoctor?.id,
    patientId: patient.id,
    serviceId: service.id,
  };
}

function appointmentValues(
  user: User,
  clinic: ClinicData,
  values: {
    doctorId?: string;
    endTime: string;
    startTime: string;
    status?: 'pending' | 'confirmed' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show';
  }
) {
  return {
    account_id: user.accountId,
    appointment_date: appointmentDate,
    doctor_id: values.doctorId ?? clinic.doctorId,
    end_time: values.endTime,
    patient_profile_id: clinic.patientId,
    service_id: clinic.serviceId,
    start_time: values.startTime,
    status: values.status ?? 'pending',
  };
}

async function expectExclusionBlocked(
  user: User,
  values: Record<string, unknown>
) {
  const { error } = await user.client.from('appointments').insert(values);
  expect(error).not.toBeNull();
  expect(error?.code).toBe('23P01');
  expect(error?.message).toContain(
    'appointments_no_overlapping_active_doctor_time'
  );
}

async function createAppointment(
  user: User,
  clinic: ClinicData,
  values: Parameters<typeof appointmentValues>[2]
) {
  const appointment = await insertOne(
    user.client,
    'appointments',
    appointmentValues(user, clinic, values)
  );
  clinic.appointmentIds.push(appointment.id);
  return appointment;
}

async function cleanupClinicData(user: User | undefined, data: ClinicData | undefined) {
  if (!user || !data) return [];

  const errors: string[] = [];
  for (const id of data.appointmentIds) {
    const { error } = await user.client.from('appointments').delete().eq('id', id);
    if (error) errors.push(error.message);
  }
  for (const [table, id] of [
    ['patient_profiles', data.patientId],
    ['clinic_services', data.serviceId],
    ['clinic_doctors', data.secondDoctorId],
    ['clinic_doctors', data.doctorId],
    ['contacts', data.contactId],
  ] as const) {
    if (!id) continue;
    const { error } = await user.client.from(table).delete().eq('id', id);
    if (error) errors.push(error.message);
  }
  return errors;
}

localDescribe('ClinicConnect local appointment conflict guard', () => {
  it(
    'enforces active doctor interval exclusivity without crossing accounts',
    async () => {
      const url = requireEnvironment('NEXT_PUBLIC_SUPABASE_URL');
      const key = requireEnvironment('NEXT_PUBLIC_SUPABASE_ANON_KEY');
      assertLocalSupabaseUrl(url);
      assertPublicSupabaseKey(key);

      userA = await authenticate(
        requireEnvironment('TEST_CLINIC_A_EMAIL'),
        requireEnvironment('TEST_CLINIC_A_PASSWORD'),
        requireFixtureAccountId('TEST_CLINIC_A_ACCOUNT_ID', expectedAccountAId)
      );
      userB = await authenticate(
        requireEnvironment('TEST_CLINIC_B_EMAIL'),
        requireEnvironment('TEST_CLINIC_B_PASSWORD'),
        requireFixtureAccountId('TEST_CLINIC_B_ACCOUNT_ID', expectedAccountBId)
      );
      clinicA = await createClinicData(userA, 'A', true);
      clinicB = await createClinicData(userB, 'B');

      await createAppointment(userA, clinicA, {
        startTime: '10:00',
        endTime: '10:30',
      });

      await expectExclusionBlocked(
        userA,
        appointmentValues(userA, clinicA, {
          startTime: '10:00',
          endTime: '10:30',
        })
      );
      await expectExclusionBlocked(
        userA,
        appointmentValues(userA, clinicA, {
          startTime: '10:20',
          endTime: '10:50',
        })
      );

      await createAppointment(userA, clinicA, {
        startTime: '10:30',
        endTime: '11:00',
      });

      for (const [status, startTime, endTime] of [
        ['cancelled', '11:00', '11:30'],
        ['completed', '11:30', '12:00'],
        ['no_show', '12:00', '12:30'],
      ] as const) {
        await createAppointment(userA, clinicA, { status, startTime, endTime });
        await createAppointment(userA, clinicA, { startTime, endTime });
      }

      await createAppointment(userA, clinicA, {
        doctorId: clinicA.secondDoctorId,
        startTime: '10:20',
        endTime: '10:50',
      });
      await createAppointment(userB, clinicB, {
        startTime: '10:20',
        endTime: '10:50',
      });
    },
    integrationTestTimeout
  );

  afterAll(async () => {
    const errors = [
      ...(await cleanupClinicData(userA, clinicA)),
      ...(await cleanupClinicData(userB, clinicB)),
    ];
    await Promise.all([userA?.client.auth.signOut(), userB?.client.auth.signOut()]);
    expect(errors).toEqual([]);
  });
});
