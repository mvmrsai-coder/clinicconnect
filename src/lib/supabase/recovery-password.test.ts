import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MIN_PASSWORD_LENGTH,
  updateRecoveryPassword,
  validateRecoveryPassword,
} from './recovery-password';

const getUser = vi.fn();
const updateUser = vi.fn();
const supabase = {
  auth: { getUser, updateUser },
} as unknown as Pick<SupabaseClient, 'auth'>;

describe('recovery password updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    updateUser.mockResolvedValue({ error: null });
  });

  it('uses the same six-character minimum as signup', () => {
    expect(
      validateRecoveryPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1), 'aaaaaa')
    ).toBe('Password must be at least 6 characters');
  });

  it('rejects mismatched passwords without querying or updating Supabase', async () => {
    const result = await updateRecoveryPassword(
      supabase,
      'password',
      'different'
    );

    expect(result).toEqual({ success: false, error: 'Passwords do not match' });
    expect(getUser).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('does not update a password without an authenticated recovery session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await updateRecoveryPassword(
      supabase,
      'new-password',
      'new-password'
    );

    expect(result.success).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('updates the authenticated recovery user after validation', async () => {
    const result = await updateRecoveryPassword(
      supabase,
      'new-password',
      'new-password'
    );

    expect(updateUser).toHaveBeenCalledWith({ password: 'new-password' });
    expect(result).toEqual({ success: true });
  });
});
