import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

import { requireRole } from '@/lib/auth/account'
import { createClient } from '@/lib/supabase/server'
import { verifyPhoneNumber } from '@/lib/whatsapp/meta-api'
import { encrypt } from '@/lib/whatsapp/encryption'

vi.mock('@/lib/auth/account', () => ({
  requireRole: vi.fn(),
  toErrorResponse: (error: unknown) => {
    const typed = error as { message?: string; status?: number }
    return NextResponse.json(
      { error: typed.message ?? 'Internal server error' },
      { status: typed.status ?? 500 },
    )
  },
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/whatsapp/meta-api', () => ({
  registerPhoneNumber: vi.fn(),
  subscribeWabaToApp: vi.fn(),
  verifyPhoneNumber: vi.fn(),
}))
vi.mock('@/lib/whatsapp/encryption', () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn(),
}))

const { POST, DELETE } = await import('./route')

type Role = 'owner' | 'admin' | 'agent' | 'viewer'

function makeBuilder(result: { data?: unknown; error?: unknown } = {}) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
    update: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(resolve({ data: result.data ?? null, error: result.error ?? null })),
  }
  return builder
}

function makeContext(role: Role) {
  const builder = makeBuilder()
  const supabase = { from: vi.fn(() => builder) }
  return {
    accountId: 'account-a',
    userId: 'user-a',
    role,
    account: { id: 'account-a', name: 'Clinic A' },
    supabase,
    builder,
  }
}

const validBody = {
  phone_number_id: 'phone-a',
  waba_id: 'waba-a',
  access_token: 'token-a',
  verify_token: 'verify-a',
}

describe('POST /api/whatsapp/config authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(verifyPhoneNumber).mockResolvedValue({ id: 'phone-a' } as never)
    vi.mocked(encrypt).mockImplementation((value: string) => `encrypted:${value}`)
    vi.mocked(createClient).mockResolvedValue({} as never)
  })

  it.each(['owner', 'admin'] as const)('%s can post configuration', async (role) => {
    const context = makeContext(role)
    const adminBuilder = makeBuilder()
    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
    vi.mocked(requireRole).mockResolvedValue(context as never)
    vi.mocked(createSupabaseClient).mockReturnValue({ from: vi.fn(() => adminBuilder) } as never)

    const response = await POST(
      new Request('http://localhost/api/whatsapp/config', {
        method: 'POST',
        body: JSON.stringify(validBody),
      }),
    )

    expect(response.status).toBe(200)
    expect(requireRole).toHaveBeenCalledWith('admin')
    expect(context.supabase.from).toHaveBeenCalled()
  })

  it.each(['agent', 'viewer'] as const)('%s is rejected before posting', async (role) => {
    const context = makeContext(role)
    vi.mocked(requireRole).mockRejectedValue({
      message: "This action requires the 'admin' role or higher",
      status: 403,
    })

    const response = await POST(
      new Request('http://localhost/api/whatsapp/config', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    )

    expect(response.status).toBe(403)
    expect(context.supabase.from).not.toHaveBeenCalled()
    expect(verifyPhoneNumber).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/whatsapp/config authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['owner', 'admin'] as const)('%s can delete configuration', async (role) => {
    const context = makeContext(role)
    vi.mocked(requireRole).mockResolvedValue(context as never)

    const response = await DELETE()

    expect(response.status).toBe(200)
    expect(requireRole).toHaveBeenCalledWith('admin')
    expect(context.supabase.from).toHaveBeenCalled()
  })

  it.each(['agent', 'viewer'] as const)('%s is rejected before deleting', async (role) => {
    const context = makeContext(role)
    vi.mocked(requireRole).mockRejectedValue({
      message: "This action requires the 'admin' role or higher",
      status: 403,
    })

    const response = await DELETE()

    expect(response.status).toBe(403)
    expect(context.supabase.from).not.toHaveBeenCalled()
  })
})
