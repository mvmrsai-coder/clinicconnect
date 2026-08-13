import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ServiceList } from './service-list';

const service = { id: 'service-a', account_id: 'account-a', name: 'Consultation', description: 'General visit', duration_minutes: 30, price: 1250.5, is_active: true, created_at: '', updated_at: '' };
const callbacks = { onCreate: vi.fn(), onEdit: vi.fn(), onToggle: vi.fn() };

describe('ServiceList', () => {
  it('renders service details, duration, price, and active status', () => { const html = renderToStaticMarkup(<ServiceList services={[service]} canEdit onCreate={callbacks.onCreate} onEdit={callbacks.onEdit} onToggle={callbacks.onToggle} />); expect(html).toContain('Consultation'); expect(html).toContain('30 min'); expect(html).toContain('1250.50'); expect(html).toContain('Active'); });
  it('renders an empty state with a gated create action', () => { const html = renderToStaticMarkup(<ServiceList services={[]} canEdit={false} onCreate={callbacks.onCreate} onEdit={callbacks.onEdit} onToggle={callbacks.onToggle} />); expect(html).toContain('No services yet'); expect(html).toContain('Add service'); expect(html).toContain('disabled'); });
});
