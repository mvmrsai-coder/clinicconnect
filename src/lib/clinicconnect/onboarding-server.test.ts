import { afterEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  requireRole: vi.fn(),
}))

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: auth.getCurrentAccount,
  requireRole: auth.requireRole,
}))

const { transitionClinicOnboardingStatus } = await import('./onboarding')

afterEach(() => {
  vi.clearAllMocks()
})

describe('ClinicConnect onboarding server authorization', () => {
  it('does not begin a transition when the caller is not an admin', async () => {
    auth.requireRole.mockRejectedValue(new Error('Insufficient role'))

    await expect(transitionClinicOnboardingStatus('TESTING')).rejects.toThrow(
      'Insufficient role',
    )
    expect(auth.requireRole).toHaveBeenCalledWith('admin')
  })
})
