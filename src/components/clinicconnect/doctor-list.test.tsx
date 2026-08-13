import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DoctorList } from './doctor-list';

const doctor = { id: 'doctor-a', account_id: 'account-a', name: 'Dr. Ada', specialization: 'Cardiology', qualification: null, display_name: null, phone: null, email: null, bio: null, is_active: true, created_at: '', updated_at: '' };
const callbacks = { onCreate: vi.fn(), onEdit: vi.fn(), onToggle: vi.fn() };

describe('DoctorList', () => {
  it('renders doctor details and active status', () => {
    const html = renderToStaticMarkup(<DoctorList doctors={[doctor]} canEdit onCreate={callbacks.onCreate} onEdit={callbacks.onEdit} onToggle={callbacks.onToggle} />);
    expect(html).toContain('Dr. Ada');
    expect(html).toContain('Cardiology');
    expect(html).toContain('Active');
    expect(html).toContain('Deactivate');
  });
  it('renders the empty state and gated create action', () => {
    const html = renderToStaticMarkup(<DoctorList doctors={[]} canEdit={false} onCreate={callbacks.onCreate} onEdit={callbacks.onEdit} onToggle={callbacks.onToggle} />);
    expect(html).toContain('No doctors yet');
    expect(html).toContain('Add doctor');
    expect(html).toContain('disabled');
  });
});
