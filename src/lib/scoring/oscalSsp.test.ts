import { describe, expect, it, vi } from 'vitest';

import { buildSspFragment } from '@/lib/oscal/buildSspFragment';
import { NIST_800_171_REV3_SUBSET } from '@/lib/oscal/nist800171Subset';
import { validateOscalSsp } from '@/lib/oscal/validateSsp';
import type { ScorableTicket } from '@/lib/scoring/index';
import { oscalSspTicketScorer } from '@/lib/scoring/oscalSsp';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-ssp',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'oscal_ssp',
    difficulty: 'medium',
    sla_minutes: 60,
    scenario_brief:
      'Author an OSCAL SSP fragment for selected 800-171 requirements.',
    initial_state: {
      requirements: NIST_800_171_REV3_SUBSET.map((req) => ({ ...req })),
    },
    expected_state: {},
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

function completeAnswers() {
  return NIST_800_171_REV3_SUBSET.map((req) => ({
    requirementId: req.id,
    implementationStatus: 'implemented' as const,
    responsibleRoleId: 'system-admin',
    implementationNarrative:
      `The organization implements ${req.title} through documented procedures, ` +
      'central tooling, and periodic review of evidence for the lab system.',
  }));
}

describe('buildSspFragment + validateOscalSsp', () => {
  it('builds a minimal SSP that validates against the OSCAL SSP schema', () => {
    let n = 0;
    const ssp = buildSspFragment({
      answers: completeAnswers(),
      lastModified: '2026-08-08T12:00:00.000Z',
      uuid: () => {
        n += 1;
        // Valid UUID v4 pattern required by OSCAL UUIDDatatype.
        return `aaaaaaaa-bbbb-4ccc-8ddd-${String(n).padStart(12, '0')}`;
      },
    });

    const validation = validateOscalSsp(ssp);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);

    const implemented =
      (
        ssp['system-security-plan']['control-implementation'] as {
          'implemented-requirements': Array<{ 'control-id': string }>;
        }
      )['implemented-requirements'] ?? [];
    expect(implemented).toHaveLength(NIST_800_171_REV3_SUBSET.length);
    expect(implemented[0]?.['control-id']).toBe('r03.01.01');
  });

  it('fails schema validation when required SSP assemblies are removed', () => {
    const ssp = buildSspFragment({
      answers: completeAnswers().slice(0, 1),
      requirements: [NIST_800_171_REV3_SUBSET[0]!],
      lastModified: '2026-08-08T12:00:00.000Z',
    });

    delete (ssp['system-security-plan'] as Record<string, unknown>)[
      'control-implementation'
    ];

    const validation = validateOscalSsp(ssp);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
    expect(
      validation.errors.some((error) =>
        error.message.toLowerCase().includes('required')
      )
    ).toBe(true);
  });
});

describe('oscalSspTicketScorer', () => {
  it('returns needs_revision with field errors when answers are missing', async () => {
    const result = await oscalSspTicketScorer.score({ answers: [] }, ticket());
    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult.style).toBe('oscal_ssp');
    expect(result.feedback).toMatch(/incomplete/i);
  });

  it('returns needs_revision when narratives are too short', async () => {
    const answers = completeAnswers();
    answers[0] = {
      ...answers[0]!,
      implementationStatus: 'implemented',
      implementationNarrative: 'too short',
    };

    const result = await oscalSspTicketScorer.score({ answers }, ticket());
    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toMatch(/implementationNarrative/i);
  });

  it('surfaces schema errors in ticket feedback when validation fails', async () => {
    vi.resetModules();
    vi.doMock('@/lib/oscal/validateSsp', async () => {
      const actual = await vi.importActual<
        typeof import('@/lib/oscal/validateSsp')
      >('@/lib/oscal/validateSsp');
      return {
        ...actual,
        validateOscalSsp: () => ({
          valid: false,
          errors: [
            {
              instancePath: '/system-security-plan/control-implementation',
              schemaPath: '#/required',
              message: 'must have required property "description"',
              keyword: 'required',
            },
          ],
        }),
      };
    });

    const { oscalSspTicketScorer: mockedScorer } =
      await import('@/lib/scoring/oscalSsp');
    const result = await mockedScorer.score(
      { answers: completeAnswers() },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toMatch(/schema validation failed/i);
    expect(result.feedback).toMatch(/description/);
    expect(
      (result.structuredResult as { schemaErrors?: unknown[] }).schemaErrors
        ?.length
    ).toBeGreaterThan(0);

    vi.doUnmock('@/lib/oscal/validateSsp');
    vi.resetModules();
  });

  it('resolves when all answers compile to a schema-valid SSP', async () => {
    const result = await oscalSspTicketScorer.score(
      { answers: completeAnswers() },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'oscal_ssp',
      valid: true,
      answeredCount: NIST_800_171_REV3_SUBSET.length,
      requiredCount: NIST_800_171_REV3_SUBSET.length,
    });
    expect(result.feedback).toMatch(/accepted/i);

    const ssp = (result.structuredResult as { ssp?: unknown }).ssp;
    expect(ssp).toBeTruthy();
    expect(validateOscalSsp(ssp).valid).toBe(true);
  });

  it('lists missing requirement ids in feedback', async () => {
    const answers = completeAnswers().slice(0, 2);
    const result = await oscalSspTicketScorer.score({ answers }, ticket());
    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toMatch(/03\.05\.01/);
    expect(
      (result.structuredResult as { missingRequirementIds?: string[] })
        .missingRequirementIds
    ).toContain('03.05.01');
  });

  it('accepts the GRC-03 Northwind two-requirement SSP after schema validation', async () => {
    const acRequirements = NIST_800_171_REV3_SUBSET.filter((req) =>
      ['03.01.01', '03.01.02'].includes(req.id)
    );
    const systemDescription =
      'Northwind CUI enclave for the DoD subcontract. Enclave boundary: isolated VPC. User population: 12 engineers, 3 admins. Existing controls: SSO with MFA; quarterly access review.';

    const result = await oscalSspTicketScorer.score(
      {
        answers: acRequirements.map((req) => ({
          requirementId: req.id,
          implementationStatus: 'implemented' as const,
          responsibleRoleId: 'system-admin',
          implementationNarrative:
            `For the Northwind CUI enclave, ${req.title} is implemented via SSO with MFA, ` +
            'documented account types, and quarterly access reviews for the 12 engineers and 3 admins.',
        })),
      },
      ticket({
        scenario_brief:
          'OSCAL SSP: Northwind CUI enclave — complete 03.01.01 and 03.01.02',
        initial_state: {
          ticketCode: 'GRC-03',
          systemName: 'Northwind CUI Enclave',
          systemDescription,
          authorizationBoundary:
            'Isolated VPC enclave that processes, stores, and transmits CUI for Northwind\'s DoD subcontract.',
          sspTitle:
            'Northwind CUI Enclave — NIST SP 800-171 Rev 3 SSP fragment (03.01.01, 03.01.02)',
          requirements: acRequirements.map((req) => ({ ...req })),
        },
      })
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'oscal_ssp',
      valid: true,
      answeredCount: 2,
      requiredCount: 2,
    });

    const ssp = (result.structuredResult as { ssp?: OscalSspShape }).ssp;
    expect(ssp).toBeTruthy();
    expect(validateOscalSsp(ssp).valid).toBe(true);
    expect(
      ssp?.['system-security-plan']?.['system-characteristics']?.description
    ).toBe(systemDescription);
    const implemented =
      ssp?.['system-security-plan']?.['control-implementation']?.[
        'implemented-requirements'
      ] ?? [];
    expect(implemented).toHaveLength(2);
    expect(implemented.map((row) => row['control-id'])).toEqual([
      'r03.01.01',
      'r03.01.02',
    ]);
  });
});

type OscalSspShape = {
  'system-security-plan': {
    'system-characteristics'?: { description?: string };
    'control-implementation'?: {
      'implemented-requirements'?: Array<{ 'control-id': string }>;
    };
  };
};
