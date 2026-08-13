import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ScheduleList } from './schedule-list';

const schedule = { id: 'schedule-a', account_id: 'account-a', doctor_id: 'doctor-a', day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', slot_duration_minutes: 30, is_active: true, created_at: '', updated_at: '' };
const callbacks = { onCreate: vi.fn(), onEdit: vi.fn(), onToggle: vi.fn() };

describe('ScheduleList', () => {
  it('renders doctor, day, local time, slot, and status', () => { const html = renderToStaticMarkup(<ScheduleList schedules={[schedule]} doctorNames={new Map([['doctor-a', 'Dr. Ada']])} canEdit onCreate={callbacks.onCreate} onEdit={callbacks.onEdit} onToggle={callbacks.onToggle} />); expect(html).toContain('Dr. Ada'); expect(html).toContain('Monday'); expect(html).toContain('09:00'); expect(html).toContain('30 min'); expect(html).toContain('Active'); });
  it('renders the empty state and gated action', () => { const html = renderToStaticMarkup(<ScheduleList schedules={[]} doctorNames={new Map()} canEdit={false} onCreate={callbacks.onCreate} onEdit={callbacks.onEdit} onToggle={callbacks.onToggle} />); expect(html).toContain('No schedules yet'); expect(html).toContain('Add schedule'); expect(html).toContain('disabled'); });
});
