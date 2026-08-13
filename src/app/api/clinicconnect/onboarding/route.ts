import { NextResponse } from 'next/server';

import { toErrorResponse } from '@/lib/auth/account';
import {
  getCurrentClinicOnboarding,
  OnboardingError,
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

/** Returns the authenticated caller's account-scoped onboarding snapshot. */
export async function GET() {
  try {
    return NextResponse.json({
      onboarding: await getCurrentClinicOnboarding(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
