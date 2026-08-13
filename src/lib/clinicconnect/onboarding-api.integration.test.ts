import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { loadEnvConfig } from '@next/env';
import {
  createClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireLocalIntegrationLock } from './local-integration-lock';

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
const integrationTimeout = 60_000;
const runId = randomUUID();
const appPort = Number(process.env.TEST_ONBOARDING_APP_PORT ?? 3400);
const appOrigin = `http://127.0.0.1:${appPort}`;
const readinessDeadlineMs = 45_000;
// A cold Next dev server can take several seconds to compile middleware and
// the first route after it reports Ready. Keep each probe bounded without
// assuming that a two-second request is sufficient.
const readinessProbeTimeoutMs = 10_000;
const maxStartupOutputLength = 4_000;

interface AuthenticatedUser {
  accountId: string;
  client: SupabaseClient;
  cookie: string;
}

interface ClinicFixture {
  profileId: string;
  doctorId?: string;
  serviceId?: string;
  scheduleId?: string;
}

let app: ChildProcess | undefined;
let userA: AuthenticatedUser | undefined;
let userB: AuthenticatedUser | undefined;
let clinicA: ClinicFixture | undefined;
let clinicB: ClinicFixture | undefined;
let releaseIntegrationLock: (() => Promise<void>) | undefined;
let appReady = false;
let appExit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
let appLifecycleError: string | undefined;
let appStdout = '';
let appStderr = '';
let activeReadinessProbe: AbortController | undefined;

function appendStartupOutput(current: string, chunk: Buffer) {
  const combined = current + chunk.toString();
  return combined.length > maxStartupOutputLength
    ? `…${combined.slice(-maxStartupOutputLength)}`
    : combined;
}

function readinessError(message: string, startedAt: number) {
  const elapsedMs = Date.now() - startedAt;
  const exitDetail = appExit
    ? `code=${appExit.code ?? 'null'}, signal=${appExit.signal ?? 'null'}`
    : 'not observed';
  return new Error(
    [
      message,
      `url=${appOrigin}/api/clinicconnect/onboarding`,
      `elapsedMs=${elapsedMs}`,
      `childPid=${app?.pid ?? 'unavailable'}`,
      `childExit=${exitDetail}`,
      `childStdout=${appStdout || '<none>'}`,
      `childStderr=${appStderr || '<none>'}`,
    ].join('\n')
  );
}

function startApp() {
  app = spawn(
    process.execPath,
    [require.resolve('next/dist/bin/next'), 'dev', '--port', String(appPort)],
    { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  app.stdout?.on('data', (chunk: Buffer) => {
    appStdout = appendStartupOutput(appStdout, chunk);
  });
  app.stderr?.on('data', (chunk: Buffer) => {
    appStderr = appendStartupOutput(appStderr, chunk);
  });
  app.on('error', (error) => {
    appLifecycleError = `Next.js child process error: ${error.message}`;
    activeReadinessProbe?.abort();
  });
  app.on('exit', (code, signal) => {
    appExit = { code, signal };
    if (!appReady) {
      appLifecycleError = `Next.js child process exited before readiness (code=${code ?? 'null'}, signal=${signal ?? 'null'})`;
      activeReadinessProbe?.abort();
    }
  });
}

async function stopApp() {
  if (!app || app.exitCode !== null || app.killed) return;

  const exited = new Promise<void>((resolve) =>
    app?.once('exit', () => resolve())
  );
  app.kill();
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

function env(name: (typeof requiredEnvironment)[number]): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function assertLocalPublicEnvironment() {
  const supabaseUrl = new URL(env('NEXT_PUBLIC_SUPABASE_URL'));
  if (
    supabaseUrl.hostname !== 'localhost' &&
    supabaseUrl.hostname !== '127.0.0.1'
  ) {
    throw new Error(
      `Refusing onboarding API integration against ${supabaseUrl.origin}`
    );
  }
  const key = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (key.startsWith('sb_secret_')) {
    throw new Error('Refusing onboarding API integration with a secret key');
  }
  const [, payload] = key.split('.');
  if (payload) {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as {
      role?: string;
    };
    if (claims.role === 'service_role') {
      throw new Error(
        'Refusing onboarding API integration with a service-role JWT'
      );
    }
  }
}

function sessionCookie(session: Session): string {
  const storageKey = `sb-${new URL(env('NEXT_PUBLIC_SUPABASE_URL')).hostname.split('.')[0]}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const chunks = Array.from(
    { length: Math.ceil(encoded.length / 3180) },
    (_, index) => {
      const name =
        encoded.length <= 3180 ? storageKey : `${storageKey}.${index}`;
      return `${name}=${encoded.slice(index * 3180, (index + 1) * 3180)}`;
    }
  );
  return chunks.join('; ');
}

async function authenticate(
  email: string,
  password: string,
  accountId: string
): Promise<AuthenticatedUser> {
  const client = createClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
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
  if (error || !data.session) {
    throw new Error(
      `Authentication failed for ${email}: ${error?.message ?? 'no session returned'}`
    );
  }
  return { accountId, client, cookie: sessionCookie(data.session) };
}

async function waitForApp() {
  const startedAt = Date.now();
  const deadline = startedAt + readinessDeadlineMs;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    if (appLifecycleError) {
      throw readinessError(appLifecycleError, startedAt);
    }

    const controller = new AbortController();
    activeReadinessProbe = controller;
    const timeout = setTimeout(
      () => controller.abort(),
      readinessProbeTimeoutMs
    );
    try {
      const response = await fetch(
        `${appOrigin}/api/clinicconnect/onboarding`,
        { signal: controller.signal }
      );
      if (response.status === 401) return;
      lastError = `unexpected HTTP ${response.status}`;
    } catch (error) {
      if (appLifecycleError) {
        throw readinessError(appLifecycleError, startedAt);
      }
      lastError = controller.signal.aborted
        ? `readiness probe timed out after ${readinessProbeTimeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    } finally {
      clearTimeout(timeout);
      if (activeReadinessProbe === controller) {
        activeReadinessProbe = undefined;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw readinessError(
    `Local Next server did not become ready: ${lastError}`,
    startedAt
  );
}

async function api(
  path: string,
  options: { cookie?: string; method?: 'GET' | 'POST'; body?: unknown } = {}
) {
  return fetch(`${appOrigin}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

async function insertProfile(
  user: AuthenticatedUser,
  bookingEnabled: boolean
): Promise<ClinicFixture> {
  const { data, error } = await user.client
    .from('clinic_profiles')
    .insert({
      account_id: user.accountId,
      clinic_name: `Onboarding API ${runId}`,
      booking_enabled: bookingEnabled,
    })
    .select('id')
    .single();
  if (error || !data)
    throw new Error(`Could not create fixture clinic: ${error?.message}`);
  return { profileId: data.id };
}

async function cleanup(
  user: AuthenticatedUser | undefined,
  clinic: ClinicFixture | undefined
) {
  if (!user || !clinic) return [];
  const operations = [
    clinic.scheduleId &&
      user.client.from('doctor_schedules').delete().eq('id', clinic.scheduleId),
    clinic.serviceId &&
      user.client.from('clinic_services').delete().eq('id', clinic.serviceId),
    clinic.doctorId &&
      user.client.from('clinic_doctors').delete().eq('id', clinic.doctorId),
    user.client.from('clinic_profiles').delete().eq('id', clinic.profileId),
  ].filter(Boolean) as PromiseLike<{ error: { message: string } | null }>[];
  const results = await Promise.all(operations);
  return results.flatMap((result) =>
    result.error ? [result.error.message] : []
  );
}

localDescribe('ClinicConnect onboarding HTTP API integration', () => {
  beforeAll(async () => {
    assertLocalPublicEnvironment();
    releaseIntegrationLock = await acquireLocalIntegrationLock();
    startApp();
    await waitForApp();
    appReady = true;
  }, integrationTimeout);

  it(
    'authenticates sessions, ignores client account scope, and persists only valid own-account transitions',
    async () => {
      userA = await authenticate(
        env('TEST_CLINIC_A_EMAIL'),
        env('TEST_CLINIC_A_PASSWORD'),
        env('TEST_CLINIC_A_ACCOUNT_ID')
      );
      userB = await authenticate(
        env('TEST_CLINIC_B_EMAIL'),
        env('TEST_CLINIC_B_PASSWORD'),
        env('TEST_CLINIC_B_ACCOUNT_ID')
      );
      clinicA = await insertProfile(userA, false);
      clinicB = await insertProfile(userB, true);

      const unauthenticated = await api('/api/clinicconnect/onboarding');
      expect(unauthenticated.status).toBe(401);
      expect(await unauthenticated.json()).toEqual({ error: 'Unauthorized' });

      const malformed = await api('/api/clinicconnect/onboarding/status', {
        method: 'POST',
        body: { status: 'NOT_A_STATUS' },
      });
      expect(malformed.status).toBe(400);

      const unauthenticatedTransition = await api(
        '/api/clinicconnect/onboarding/status',
        {
          method: 'POST',
          body: { status: 'TESTING' },
        }
      );
      expect(unauthenticatedTransition.status).toBe(401);

      const aSnapshotResponse = await api('/api/clinicconnect/onboarding', {
        cookie: userA.cookie,
      });
      const aSnapshot = await aSnapshotResponse.json();
      expect(aSnapshotResponse.status).toBe(200);
      expect(aSnapshot.onboarding).toMatchObject({
        onboardingStatus: 'REGISTERED',
        bookingEnabled: false,
        readyToTest: true,
      });

      const bSnapshotResponse = await api('/api/clinicconnect/onboarding', {
        cookie: userB.cookie,
      });
      const bSnapshot = await bSnapshotResponse.json();
      expect(bSnapshotResponse.status).toBe(200);
      expect(bSnapshot.onboarding).toMatchObject({
        onboardingStatus: 'REGISTERED',
        bookingEnabled: true,
        readyToTest: false,
      });

      const aWithBAccountParameter = await api(
        `/api/clinicconnect/onboarding?account_id=${userB.accountId}`,
        { cookie: userA.cookie }
      );
      expect((await aWithBAccountParameter.json()).onboarding).toMatchObject({
        bookingEnabled: false,
        readyToTest: true,
      });

      const incompleteB = await api('/api/clinicconnect/onboarding/status', {
        cookie: userB.cookie,
        method: 'POST',
        body: { status: 'TESTING' },
      });
      expect(incompleteB.status).toBe(409);
      expect(await incompleteB.json()).toMatchObject({
        code: 'prerequisites_incomplete',
      });

      const clientScopedBody = await api(
        '/api/clinicconnect/onboarding/status',
        {
          cookie: userA.cookie,
          method: 'POST',
          body: { status: 'TESTING', account_id: userB.accountId },
        }
      );
      expect(clientScopedBody.status).toBe(400);

      const validA = await api('/api/clinicconnect/onboarding/status', {
        cookie: userA.cookie,
        method: 'POST',
        body: { status: 'TESTING' },
      });
      expect(validA.status).toBe(200);
      expect((await validA.json()).onboarding.onboardingStatus).toBe('TESTING');

      const invalidA = await api('/api/clinicconnect/onboarding/status', {
        cookie: userA.cookie,
        method: 'POST',
        body: { status: 'LIVE' },
      });
      expect(invalidA.status).toBe(400);
      expect(await invalidA.json()).toMatchObject({
        code: 'invalid_status_transition',
      });

      const aPersisted = await api('/api/clinicconnect/onboarding', {
        cookie: userA.cookie,
      });
      expect((await aPersisted.json()).onboarding.onboardingStatus).toBe(
        'TESTING'
      );

      const bStillOwn = await api('/api/clinicconnect/onboarding', {
        cookie: userB.cookie,
      });
      expect((await bStillOwn.json()).onboarding).toMatchObject({
        onboardingStatus: 'REGISTERED',
        bookingEnabled: true,
      });
    },
    integrationTimeout
  );

  afterAll(async () => {
    let errors: string[] = [];
    try {
      errors = [
        ...(await cleanup(userA, clinicA)),
        ...(await cleanup(userB, clinicB)),
      ];
      await Promise.all([
        userA?.client.auth.signOut(),
        userB?.client.auth.signOut(),
      ]);
    } finally {
      await stopApp();
      await releaseIntegrationLock?.();
    }
    expect(errors).toEqual([]);
  });
});
