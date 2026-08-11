/**
 * Unit-level smoke: the workbench crash class (missing catalog / null fields)
 * must not throw during the shared RSC resolve path used by every ticket page.
 */
import { describe, expect, it } from 'vitest';

import { extractControlRefs } from '@/lib/catalog/extractControlRefs';
import {
  getProcessedControl,
  loadProcessedControlCatalog,
  resetProcessedCatalogCacheForTests,
} from '@/lib/oscal/loadControlCatalog';
import { mapTicketToConsoleTicket } from '@/lib/tickets/mapTicketToConsole';
import { countOpenBySeverity } from '@/lib/tickets/openBySeverity';
import type { Ticket } from '@/types';

const GRC_FIXTURES: Array<
  Pick<Ticket, 'ticket_type' | 'scenario_brief' | 'initial_state'>
> = [
  {
    ticket_type: 'control_mapping',
    scenario_brief: 'Map AC-2 across SOC 2 and ISO 27001.',
    initial_state: { severity: 'medium', source_control_id: 'AC-2' },
  },
  {
    ticket_type: 'poam',
    scenario_brief: 'Draft POA&M entries for AC-2/IA-5 findings.',
    initial_state: {
      severity: 'medium',
      poam_due_at: '2026-08-20',
    },
  },
  {
    ticket_type: 'conmon_strategy',
    scenario_brief: 'ConMon strategy for the CUI enclave.',
    initial_state: {
      severity: 'medium',
      poam_due_at: '2026-08-18',
      controlFamilies: ['AC', 'AU'],
    },
  },
  {
    ticket_type: 'cmmc_gap_analysis',
    scenario_brief: 'CMMC Level 2 readiness estimate.',
    initial_state: { severity: 'high', poam_due_at: '2026-08-15' },
  },
  {
    ticket_type: 'tool_walkthrough',
    scenario_brief: 'SimpleRisk vendor onboarding risk assessment.',
    initial_state: { severity: 'medium' },
  },
  {
    ticket_type: 'assessment_procedures',
    scenario_brief: 'Draft Examine/Interview/Test for IA-5(1).',
    initial_state: { severity: 'medium', controlId: 'ia-5.1' },
  },
  {
    ticket_type: 'sec_materiality',
    scenario_brief: 'SEC 8-K materiality determination memo.',
    initial_state: { severity: 'high' },
  },
  {
    ticket_type: 'oscal_generator',
    scenario_brief: 'Generate a valid OSCAL SSP fragment.',
    initial_state: { severity: 'medium' },
  },
  {
    ticket_type: 'ao_review',
    scenario_brief: 'Defend residual risk to the AO.',
    initial_state: { severity: 'medium' },
  },
  {
    ticket_type: 'fips_199_impact_categorization',
    scenario_brief: 'FIPS 199: Categorize RiverWatch.',
    initial_state: { severity: 'medium' },
  },
  {
    ticket_type: 'ssp_gap_review',
    scenario_brief: 'Identify SSP quality gaps for AC-2 and CM-2.',
    initial_state: { severity: 'medium' },
  },
  {
    ticket_type: 'raci_matrix',
    scenario_brief: 'Complete the RACI matrix.',
    initial_state: { severity: 'low' },
  },
  {
    ticket_type: 'policy_section_draft',
    scenario_brief: 'Draft Acceptable Use policy section.',
    initial_state: { severity: 'low' },
  },
  {
    ticket_type: 'program_metrics_brief',
    scenario_brief: 'Select leadership KPIs.',
    initial_state: { severity: 'medium' },
  },
  {
    ticket_type: 'vendor_risk_rating',
    scenario_brief: 'Rate NimbusData Analytics vendor risk.',
    initial_state: { severity: 'high' },
  },
  {
    ticket_type: 'control_implementation_adequacy',
    scenario_brief: 'Judge AC-2 implementation adequacy.',
    initial_state: { severity: 'medium', controlId: 'AC-2' },
  },
];

function asTicket(
  fixture: (typeof GRC_FIXTURES)[number],
  index: number
): Ticket {
  return {
    id: `smoke-${index}`,
    tenant_id: 'tenant',
    track_id: 'track-grc',
    tier: 2,
    ticket_type: fixture.ticket_type,
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief: fixture.scenario_brief,
    initial_state: fixture.initial_state,
    expected_state: {},
    dcwf_code: '612',
    sort_order: index,
  };
}

describe('GRC ticket route smoke (shared RSC path)', () => {
  it('resolves control rail snippets for every GRC fixture without throwing', () => {
    resetProcessedCatalogCacheForTests();
    const catalog = loadProcessedControlCatalog();
    expect(catalog.controls.length).toBeGreaterThan(0);

    for (const [index, fixture] of GRC_FIXTURES.entries()) {
      const refs = extractControlRefs(
        fixture.scenario_brief,
        fixture.initial_state
      );
      const snippets = refs.slice(0, 4).flatMap((id) => {
        const entry = getProcessedControl(id);
        const statement =
          typeof entry?.statement === 'string' ? entry.statement.trim() : '';
        if (!entry || !statement) return [];
        return [
          {
            controlId: entry.control_id || id,
            title: entry.title,
            statement,
          },
        ];
      });
      expect(Array.isArray(snippets)).toBe(true);

      const mapped = mapTicketToConsoleTicket({
        ticket: asTicket(fixture, index),
        trackSlug: 'grc',
        status: 'new',
      });
      expect(mapped.workbenchHref).toContain('/tracks/grc/tickets/');
      expect(mapped.severity).toBe(fixture.initial_state.severity);
    }
  });

  it('maps null difficulty/severity without throwing and keeps unrated explicit', () => {
    const mapped = mapTicketToConsoleTicket({
      ticket: {
        ...asTicket(GRC_FIXTURES[0]!, 0),
        // @ts-expect-error intentional null for regression coverage
        difficulty: null,
        initial_state: {},
      },
      trackSlug: 'grc',
    });
    expect(mapped.difficulty).toBe('medium');
    expect(mapped.severity).toBeUndefined();

    const counts = countOpenBySeverity([
      { ...mapped, status: 'new', startedAt: null, slaMinutes: 45 },
    ]);
    expect(counts.unrated).toBe(1);
    expect(counts.counts.medium).toBe(0);
    expect(counts.openTotal).toBe(1);
  });

  it('covers 16 GRC fixture routes (one per live scenario type)', () => {
    expect(GRC_FIXTURES).toHaveLength(16);
  });
});
