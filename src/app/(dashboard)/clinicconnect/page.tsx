'use client';

import { useCallback, useEffect, useState } from 'react';

import { OnboardingDashboard } from '@/components/clinicconnect/onboarding-dashboard';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchOnboarding,
  OnboardingClientError,
  transitionOnboarding,
} from '@/lib/clinicconnect/onboarding-api-client';
import type {
  ClinicOnboardingSnapshot,
  ClinicOnboardingStatus,
} from '@/lib/clinicconnect/onboarding-types';

export default function ClinicConnectOnboardingPage() {
  const { accountRole } = useAuth();
  const [snapshot, setSnapshot] = useState<ClinicOnboardingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<ClinicOnboardingStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await fetchOnboarding());
    } catch (caught) {
      setError(caught instanceof OnboardingClientError ? caught.message : 'Unable to load onboarding.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleTransition = useCallback(async (status: ClinicOnboardingStatus) => {
    setPendingStatus(status);
    setTransitionError(null);
    try {
      setSnapshot(await transitionOnboarding(status));
    } catch (caught) {
      setTransitionError(caught instanceof OnboardingClientError ? caught.message : 'Unable to update onboarding status.');
    } finally {
      setPendingStatus(null);
    }
  }, []);

  return (
    <OnboardingDashboard
      snapshot={snapshot}
      accountRole={accountRole}
      loading={loading}
      error={error}
      transitionError={transitionError}
      pendingStatus={pendingStatus}
      onRetry={() => void load()}
      onTransition={(status) => void handleTransition(status)}
    />
  );
}
