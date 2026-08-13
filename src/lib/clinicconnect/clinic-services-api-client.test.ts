import { describe, expect, it, vi } from 'vitest';
import { fetchServices, saveServiceRequest } from './clinic-services-api-client';

const service = { id: 'service-a', account_id: 'account-a', name: 'Consultation', description: null, duration_minutes: 30, price: null, is_active: true, created_at: '', updated_at: '' };
const write = { name: 'Consultation', description: null, duration_minutes: 30, price: null, is_active: true };

describe('clinic service API client', () => {
  it('renders account-scoped service list without account_id in the URL', async () => { const fetcher = vi.fn(async (input: RequestInfo | URL) => { expect(String(input)).toBe('/api/clinicconnect/services'); expect(String(input)).not.toContain('account_id'); return new Response(JSON.stringify({ services: [service] }), { status: 200 }); }); await expect(fetchServices(fetcher)).resolves.toEqual([service]); });
  it('renders an empty service state', async () => { const fetcher = vi.fn(async () => new Response(JSON.stringify({ services: [] }), { status: 200 })); await expect(fetchServices(fetcher)).resolves.toEqual([]); });
  it('creates and updates services through scoped endpoints', async () => { const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { expect(String(input)).toBe('/api/clinicconnect/services/service-a'); expect(init?.method).toBe('PUT'); expect(JSON.parse(String(init?.body))).toEqual({ ...write, is_active: false }); return new Response(JSON.stringify({ service: { ...service, is_active: false } }), { status: 200 }); }); await expect(saveServiceRequest({ ...write, is_active: false }, 'service-a', fetcher)).resolves.toMatchObject({ is_active: false }); });
  it('maps unauthorized mutations to a safe error', async () => { const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })); await expect(saveServiceRequest(write, undefined, fetcher)).rejects.toMatchObject({ status: 403 }); });
});
