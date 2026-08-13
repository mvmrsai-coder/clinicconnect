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
const runId = randomUUID();
const integrationTestTimeout = 30_000;

type Row = Record<string, unknown> & { id: string };

interface User {
  accountId: string;
  client: SupabaseClient;
  userId: string;
}

interface ContactData {
  id: string;
}

let userA: User | undefined;
let userB: User | undefined;
let contactA: ContactData | undefined;
let contactB: ContactData | undefined;

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
      `Refusing to run consent mutations against non-local Supabase URL: ${url.origin}`
    );
  }
}

function assertPublicSupabaseKey(key: string) {
  if (key.startsWith('sb_secret_')) {
    throw new Error('Refusing to run consent tests with a secret key');
  }

  const [, payload] = key.split('.');
  if (!payload) return;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as { role?: string };
    if (claims.role === 'service_role') {
      throw new Error('Refusing to run consent tests with a service-role JWT');
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

async function createContact(user: User, suffix: string): Promise<ContactData> {
  const contact = await insertOne(user.client, 'contacts', {
    account_id: user.accountId,
    user_id: user.userId,
    name: `Consent test contact ${suffix}`,
    phone: testPhone(`${runId}${suffix}`),
  });
  return { id: contact.id };
}

async function insertConsent(
  user: User,
  accountId: string,
  contactId: string,
  eventType: 'OPT_IN' | 'OPT_OUT',
  source: string
) {
  return insertOne(user.client, 'whatsapp_consent_events', {
    account_id: accountId,
    contact_id: contactId,
    event_type: eventType,
    source,
    occurred_at: '2025-01-02T03:04:05.000Z',
    recorded_by_user_id: user.userId,
    metadata: { integration_test: true, run_id: runId },
  });
}

async function cleanupContact(user: User | undefined, contact: ContactData | undefined) {
  if (!user || !contact) return [];
  const { error } = await user.client.from('contacts').delete().eq('id', contact.id);
  return error ? [error.message] : [];
}

localDescribe('ClinicConnect local WhatsApp consent events', () => {
  it(
    'keeps append-only consent history scoped to its account and contact',
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
      contactA = await createContact(userA, 'A');
      contactB = await createContact(userB, 'B');

      const optIn = await insertConsent(
        userA,
        userA.accountId,
        contactA.id,
        'OPT_IN',
        'manual'
      );
      const optOut = await insertConsent(
        userA,
        userA.accountId,
        contactA.id,
        'OPT_OUT',
        'import'
      );

      const { data: ownEvents, error: ownReadError } = await userA.client
        .from('whatsapp_consent_events')
        .select('id, event_type, source, occurred_at, recorded_at, metadata')
        .eq('account_id', userA.accountId)
        .eq('contact_id', contactA.id)
        .order('occurred_at', { ascending: true });
      expect(ownReadError).toBeNull();
      expect(ownEvents).toHaveLength(2);
      const storedOptIn = ownEvents?.find((event) => event.id === optIn.id);
      const storedOptOut = ownEvents?.find((event) => event.id === optOut.id);
      expect(storedOptIn).toMatchObject({ event_type: 'OPT_IN', source: 'manual' });
      expect(storedOptOut).toMatchObject({ event_type: 'OPT_OUT', source: 'import' });
      expect(new Date(storedOptIn?.occurred_at ?? '').toISOString()).toBe(
        '2025-01-02T03:04:05.000Z'
      );
      expect(storedOptIn?.recorded_at).toBeTruthy();
      expect(new Date(storedOptOut?.occurred_at ?? '').toISOString()).toBe(
        '2025-01-02T03:04:05.000Z'
      );
      expect(storedOptOut?.recorded_at).toBeTruthy();

      const { data: crossAccountEvents, error: crossAccountReadError } =
        await userB.client
          .from('whatsapp_consent_events')
          .select('id')
          .eq('account_id', userA.accountId)
          .eq('contact_id', contactA.id);
      expect(crossAccountReadError).toBeNull();
      expect(crossAccountEvents).toEqual([]);

      const { error: userBImpersonationInsertError } = await userB.client
        .from('whatsapp_consent_events')
        .insert({
          account_id: userA.accountId,
          contact_id: contactA.id,
          event_type: 'OPT_IN',
          source: 'manual',
          recorded_by_user_id: userB.userId,
        });
      expect(userBImpersonationInsertError).not.toBeNull();

      const { error: userBCrossAccountInsertError } = await userB.client
        .from('whatsapp_consent_events')
        .insert({
          account_id: userB.accountId,
          contact_id: contactA.id,
          event_type: 'OPT_IN',
          source: 'manual',
          recorded_by_user_id: userB.userId,
        });
      expect(userBCrossAccountInsertError).not.toBeNull();
      expect(userBCrossAccountInsertError?.code).toBe('23503');

      const { error: userACrossAccountInsertError } = await userA.client
        .from('whatsapp_consent_events')
        .insert({
          account_id: userA.accountId,
          contact_id: contactB.id,
          event_type: 'OPT_OUT',
          source: 'manual',
          recorded_by_user_id: userA.userId,
        });
      expect(userACrossAccountInsertError).not.toBeNull();
      expect(userACrossAccountInsertError?.code).toBe('23503');

      const { data: crossAccountUpdateData, error: crossAccountUpdateError } =
        await userB.client
        .from('whatsapp_consent_events')
        .update({ source: 'tampered' })
        .eq('id', optIn.id)
        .select('id');
      expect(
        crossAccountUpdateError !== null || crossAccountUpdateData?.length === 0
      ).toBe(true);

      const { data: ownDeleteData, error: ownDeleteError } = await userA.client
        .from('whatsapp_consent_events')
        .delete()
        .eq('id', optOut.id)
        .select('id');
      expect(ownDeleteError !== null || ownDeleteData?.length === 0).toBe(true);

      const { data: finalEvents, error: finalReadError } = await userA.client
        .from('whatsapp_consent_events')
        .select('id, source')
        .eq('account_id', userA.accountId)
        .eq('contact_id', contactA.id);
      expect(finalReadError).toBeNull();
      expect(finalEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: optIn.id, source: 'manual' }),
          expect.objectContaining({ id: optOut.id, source: 'import' }),
        ])
      );
    },
    integrationTestTimeout
  );

  afterAll(async () => {
    const errors = [
      ...(await cleanupContact(userA, contactA)),
      ...(await cleanupContact(userB, contactB)),
    ];
    await Promise.all([userA?.client.auth.signOut(), userB?.client.auth.signOut()]);
    expect(errors).toEqual([]);
  });
});
