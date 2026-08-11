/** @vitest-environment happy-dom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PriorityBadge } from '@/components/tickets/PriorityBadge';
import { SeverityBadge } from '@/components/tickets/SeverityBadge';

describe('PriorityBadge / SeverityBadge null safety', () => {
  it('PriorityBadge renders Unknown when difficulty is nullish', () => {
    render(<PriorityBadge difficulty={null} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('SeverityBadge renders Unrated when severity is nullish', () => {
    render(<SeverityBadge severity={undefined} />);
    expect(screen.getByText('Unrated')).toBeInTheDocument();
  });

  it('SeverityBadge still renders rated severities', () => {
    render(<SeverityBadge severity="high" />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });
});
