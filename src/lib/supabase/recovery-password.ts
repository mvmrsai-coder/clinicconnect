import type { SupabaseClient } from '@supabase/supabase-js';

// Keep recovery passwords consistent with the current signup form.
export const MIN_PASSWORD_LENGTH = 6;

type PasswordUpdateResult =
  { success: true } | { success: false; error: string };

export function validateRecoveryPassword(
  password: string,
  confirmPassword: string
) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  if (password !== confirmPassword) {
    return 'Passwords do not match';
  }

  return null;
}

/**
 * Updates only the user represented by the recovery session established by
 * /auth/callback. Checking that session first produces a clear result for
 * expired or already-used recovery links.
 */
export async function updateRecoveryPassword(
  supabase: Pick<SupabaseClient, 'auth'>,
  password: string,
  confirmPassword: string
): Promise<PasswordUpdateResult> {
  const validationError = validateRecoveryPassword(password, confirmPassword);
  if (validationError) {
    return { success: false, error: validationError };
  }

  try {
    const {
      data: { user },
      error: sessionError,
    } = await supabase.auth.getUser();

    if (sessionError || !user) {
      return {
        success: false,
        error:
          'This password reset link is invalid or has expired. Please request a new one.',
      };
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch {
    return {
      success: false,
      error: "We couldn't update your password. Please try again.",
    };
  }
}
