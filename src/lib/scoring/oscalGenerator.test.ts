import { describe, expect, it } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateOscalGenerator,
  oscalGeneratorTicketScorer,
  runStaticScriptChecks,
} from '@/lib/scoring/oscalGenerator';

const UUID = '11111111-1111-4111-8111-111111111111';
const NOW = '2024-01-15T12:00:00Z';

const GOOD_SCRIPT = `#!/usr/bin/env node
const fs = require('fs');

function buildSsp(input) {
  const uuid = '11111111-1111-4111-8111-111111111111';
  return {
    'system-security-plan': {
      uuid,
      metadata: {
        title: input.systemName + ' SSP',
        'last-modified': '2024-01-15T12:00:00Z',
        version: '1.0',
        'oscal-version': '1.1.2',
      },
      'import-profile': { href: input.profileHref || '#profile' },
      'system-characteristics': {
        'system-ids': [{ id: input.systemId }],
        'system-name': input.systemName,
        description: input.description,
        'system-information': {
          'information-types': [{
            uuid,
            title: 'Business info',
            description: 'General business information.',
            categorizations: [{
              system: 'https://doi.org/10.6028/NIST.SP.800-60v2r1',
              'information-type-ids': ['C.2.8.12'],
            }],
            'confidentiality-impact': { base: 'fips-199-low' },
            'integrity-impact': { base: 'fips-199-low' },
            'availability-impact': { base: 'fips-199-low' },
          }],
        },
        'security-impact-level': {
          'security-objective-confidentiality': 'fips-199-low',
          'security-objective-integrity': 'fips-199-low',
          'security-objective-availability': 'fips-199-low',
        },
        status: { state: 'operational' },
        'authorization-boundary': { description: input.boundary },
      },
      'system-implementation': {
        users: [{ uuid, title: 'System Admin' }],
        components: [{
          uuid,
          type: 'system',
          title: input.systemName,
          description: input.description,
          status: { state: 'operational' },
        }],
      },
      'control-implementation': {
        description: 'Control implementation summary.',
        'implemented-requirements': [{ uuid, 'control-id': 'ac-1' }],
      },
    },
  };
}

const input = JSON.parse(fs.readFileSync('input/system.json', 'utf8'));
const ssp = buildSsp(input);
fs.mkdirSync('output', { recursive: true });
fs.writeFileSync('output/ssp.json', JSON.stringify(ssp, null, 2));
`;

const VALID_SSP = {
  'system-security-plan': {
    uuid: UUID,
    metadata: {
      title: 'Demo System SSP',
      'last-modified': NOW,
      version: '1.0',
      'oscal-version': '1.1.2',
    },
    'import-profile': { href: '#profile' },
    'system-characteristics': {
      'system-ids': [{ id: 'SYS-1' }],
      'system-name': 'Demo System',
      description: 'A demo system for the lab.',
      'system-information': {
        'information-types': [
          {
            uuid: UUID,
            title: 'Business info',
            description: 'General business information.',
            categorizations: [
              {
                system: 'https://doi.org/10.6028/NIST.SP.800-60v2r1',
                'information-type-ids': ['C.2.8.12'],
              },
            ],
            'confidentiality-impact': { base: 'fips-199-low' },
            'integrity-impact': { base: 'fips-199-low' },
            'availability-impact': { base: 'fips-199-low' },
          },
        ],
      },
      'security-impact-level': {
        'security-objective-confidentiality': 'fips-199-low',
        'security-objective-integrity': 'fips-199-low',
        'security-objective-availability': 'fips-199-low',
      },
      status: { state: 'operational' },
      'authorization-boundary': { description: 'Boundary description.' },
    },
    'system-implementation': {
      users: [{ uuid: UUID, title: 'System Admin' }],
      components: [
        {
          uuid: UUID,
          type: 'system',
          title: 'Demo System',
          description: 'A demo system for the lab.',
          status: { state: 'operational' },
        },
      ],
    },
    'control-implementation': {
      description: 'Control implementation summary.',
      'implemented-requirements': [{ uuid: UUID, 'control-id': 'ac-1' }],
    },
  },
};

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-oscal',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 3,
    ticket_type: 'oscal_generator',
    difficulty: 'high',
    sla_minutes: 90,
    scenario_brief: 'Capstone: generate a minimal OSCAL SSP',
    initial_state: {},
    expected_state: {
      documentKind: 'ssp',
      scriptPath: 'generate_ssp.js',
      inputPath: 'input/system.json',
      outputPath: 'output/ssp.json',
    },
    dcwf_code: '612',
    sort_order: 90,
    ...overrides,
  };
}

describe('runStaticScriptChecks', () => {
  it('passes a reasonably structured generator script', () => {
    const checks = runStaticScriptChecks({
      scriptPath: 'generate_ssp.js',
      scriptSource: GOOD_SCRIPT,
      inputPath: 'input/system.json',
      outputPath: 'output/ssp.json',
    });
    expect(checks.every((c) => c.passed)).toBe(true);
  });

  it('fails empty stubs and scripts that never touch I/O', () => {
    const checks = runStaticScriptChecks({
      scriptPath: 'generate_ssp.js',
      scriptSource: '// TODO\n',
      inputPath: 'input/system.json',
      outputPath: 'output/ssp.json',
      minScriptChars: 80,
    });
    expect(checks.find((c) => c.id === 'min_length')?.passed).toBe(false);
    expect(checks.find((c) => c.id === 'reads_input')?.passed).toBe(false);
    expect(checks.find((c) => c.id === 'writes_json')?.passed).toBe(false);
  });
});

describe('evaluateOscalGenerator / oscalGeneratorTicketScorer', () => {
  it('resolves when static checks and schema validation both pass', async () => {
    const result = await oscalGeneratorTicketScorer.score(
      {
        files: {
          'generate_ssp.js': GOOD_SCRIPT,
          'input/system.json': JSON.stringify({
            systemId: 'SYS-1',
            systemName: 'Demo System',
          }),
          'output/ssp.json': JSON.stringify(VALID_SSP),
        },
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'oscal_generator',
      staticPassed: true,
      schemaValid: true,
      documentKind: 'ssp',
    });
  });

  it('needs revision when OSCAL output fails schema validation', () => {
    const structured = evaluateOscalGenerator(
      {
        files: {
          'generate_ssp.js': GOOD_SCRIPT,
          'input/system.json': '{}',
          'output/ssp.json': JSON.stringify({
            'system-security-plan': { uuid: UUID },
          }),
        },
      },
      ticket()
    );

    expect(structured.staticPassed).toBe(true);
    expect(structured.schemaValid).toBe(false);
    expect(structured.schemaErrors.length).toBeGreaterThan(0);
  });

  it('needs revision when generated output is missing', async () => {
    const result = await oscalGeneratorTicketScorer.score(
      {
        files: {
          'generate_ssp.js': GOOD_SCRIPT,
          'input/system.json': '{}',
        },
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      reason: 'missing_output',
    });
  });
});
