import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { OnboardingDashboard } from './onboarding-dashboard';

const snapshot = {
  onboardingStatus: 'REGISTERED' as const,
  bookingEnabled: true,
  steps: [
    { key: 'clinic_profile' as const, state: 'complete' as const, required: true, detailKey: 'complete' },
    { key: 'doctors' as const, state: 'incomplete' as const, required: true, detailKey: 'incomplete', count: 0 },
    { key: 'services' as const, state: 'complete' as const, required: true, detailKey: 'complete', count: 2 },
    { key: 'schedules' as const, state: 'incomplete' as const, required: true, detailKey: 'incomplete', count: 0 },
    { key: 'patients' as const, state: 'not_required' as const, required: false, detailKey: 'optional', count: 4 },
    { key: 'whatsapp' as const, state: 'incomplete' as const, required: false, detailKey: 'optional' },
    { key: 'automations' as const, state: 'not_required' as const, required: false, detailKey: 'optional', count: 1 },
    { key: 'testing' as const, state: 'needs_operator_test' as const, required: false, detailKey: 'test' },
  ],
  completedRequiredSteps: 2,
  requiredSteps: 4,
  progressPercent: 50,
  nextStep: 'doctors' as const,
  readyToTest: false,
  canStartTesting: false,
  canMarkReady: false,
  canGoLive: false,
};

const props = {
  snapshot,
  loading: false,
  error: null,
  transitionError: null,
  pendingStatus: null,
  onRetry: vi.fn(),
  onTransition: vi.fn(),
};

describe('OnboardingDashboard', () => {
  it('renders the current status and progress', () => {
    const html = renderToStaticMarkup(<OnboardingDashboard {...props} accountRole="owner" />);
    expect(html).toContain('REGISTERED');
    expect(html).toContain('2/4');
    expect(html).toContain('50% complete');
  });

  it('renders required and recommended checklist labels', () => {
    const html = renderToStaticMarkup(<OnboardingDashboard {...props} accountRole="owner" />);
    expect(html).toContain('Required');
    expect(html).toContain('Recommended');
    expect(html).toContain('WhatsApp');
    expect(html).toContain('Automations');
  });

  it('explains the next incomplete action', () => {
    const html = renderToStaticMarkup(<OnboardingDashboard {...props} accountRole="owner" />);
    expect(html).toContain('Add at least one active doctor');
  });

  it('shows loading state accessibly', () => {
    const html = renderToStaticMarkup(<OnboardingDashboard {...props} snapshot={null} loading accountRole="owner" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Loading onboarding');
  });

  it('shows an error and retry action', () => {
    const html = renderToStaticMarkup(<OnboardingDashboard {...props} snapshot={null} error="Session expired" accountRole={null} />);
    expect(html).toContain('Unable to load onboarding');
    expect(html).toContain('Session expired');
    expect(html).toContain('Try again');
  });

  it('hides transition controls from viewers', () => {
    const ready = { ...snapshot, readyToTest: true, canStartTesting: true };
    const html = renderToStaticMarkup(<OnboardingDashboard {...props} snapshot={ready} accountRole="viewer" />);
    expect(html).not.toContain('Start testing');
    expect(html).toContain('Only account owners and admins can change onboarding status.');
  });

  it('shows an authorized start-testing control when the API allows it', () => {
    const ready = { ...snapshot, readyToTest: true, canStartTesting: true };
    const html = renderToStaticMarkup(<OnboardingDashboard {...props} snapshot={ready} accountRole="admin" />);
    expect(html).toContain('Start testing');
  });

  it('shows transition errors without changing authorization rules', () => {
    const html = renderToStaticMarkup(<OnboardingDashboard {...props} accountRole="admin" transitionError="Prerequisites changed" />);
    expect(html).toContain('Status update failed');
    expect(html).toContain('Prerequisites changed');
  });
});
