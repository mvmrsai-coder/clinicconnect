import { NextResponse } from 'next/server';

import { toErrorResponse } from '@/lib/auth/account';
import {
  isClinicOnboardingStatus,
  OnboardingError,
  transitionClinicOnboardingStatus,
} from '@/lib/clinicconnect/onboarding';

function errorResponse(error: unknown) {
  if (error instanceof OnboardingError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  return toErrorResponse(error);
}

/** Performs an explicit admin-only onboarding status transition. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !isClinicOnboardingStatus(body.status)
  ) {
    return NextResponse.json(
      { error: 'Body must contain exactly one valid onboarding status' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({
      onboarding: await transitionClinicOnboardingStatus(body.status),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
