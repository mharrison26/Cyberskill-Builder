import { describe, expect, it } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateOscalGenerator,
  oscalGeneratorTicketScorer,
  parseJsonFromStdout,
  runStaticScriptChecks,
} from '@/lib/scoring/oscalGenerator';

const UUID = '11111111-1111-4111-8111-111111111111';
const NOW = '2024-01-15T12:00:00Z';

const SAMPLE_INPUT = {
  system_name: 'Northwind CUI Enclave',
  fips_199_category: 'moderate',
  controls: [
    {
      id: 'ac-2',
      status: 'implemented',
      narrative: 'Accounts provisioned via SSO with MFA.',
    },
    {
      id: 'ia-5',
      status: 'partial',
      narrative: 'Password complexity enforced; hardware tokens planned.',
    },
  ],
};

const GOOD_SCRIPT = `#!/usr/bin/env node
const fs = require('fs');

function buildSsp(input) {
  const uuid = '11111111-1111-4111-8111-111111111111';
  const impact = 'fips-199-' + (input.fips_199_category || 'moderate');
  return {
    'system-security-plan': {
      uuid,
      metadata: {
        title: input.system_name + ' SSP',
        'last-modified': '2024-01-15T12:00:00Z',
        version: '1.0',
        'oscal-version': '1.1.2',
      },
      'import-profile': { href: '#profile' },
      'system-characteristics': {
        'system-ids': [{ id: 'NW-CUI-01' }],
        'system-name': input.system_name,
        description: 'Generated from sample JSON template.',
        'system-information': {
          'information-types': [{
            uuid,
            title: 'CUI',
            description: 'Controlled unclassified information.',
            categorizations: [{
              system: 'https://doi.org/10.6028/NIST.SP.800-60v2r1',
              'information-type-ids': ['C.2.8.12'],
            }],
            'confidentiality-impact': { base: impact },
            'integrity-impact': { base: impact },
            'availability-impact': { base: impact },
          }],
        },
        'security-impact-level': {
          'security-objective-confidentiality': impact,
          'security-objective-integrity': impact,
          'security-objective-availability': impact,
        },
        status: { state: 'operational' },
        'authorization-boundary': { description: 'Isolated VPC enclave.' },
      },
      'system-implementation': {
        users: [{ uuid, title: 'System Admin' }],
        components: [{
          uuid,
          type: 'system',
          title: input.system_name,
          description: 'Generated component.',
          status: { state: 'operational' },
        }],
      },
      'control-implementation': {
        description: 'Control implementation summary.',
        'implemented-requirements': (input.controls || []).map((c, i) => ({
          uuid: '11111111-1111-4111-8111-11111111111' + i,
          'control-id': c.id,
        })),
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
      title: 'Northwind CUI Enclave SSP',
      'last-modified': NOW,
      version: '1.0',
      'oscal-version': '1.1.2',
    },
    'import-profile': { href: '#profile' },
    'system-characteristics': {
      'system-ids': [{ id: 'NW-CUI-01' }],
      'system-name': 'Northwind CUI Enclave',
      description: 'Generated from sample JSON template.',
      'system-information': {
        'information-types': [
          {
            uuid: UUID,
            title: 'CUI',
            description: 'Controlled unclassified information.',
            categorizations: [
              {
                system: 'https://doi.org/10.6028/NIST.SP.800-60v2r1',
                'information-type-ids': ['C.2.8.12'],
              },
            ],
            'confidentiality-impact': { base: 'fips-199-moderate' },
            'integrity-impact': { base: 'fips-199-moderate' },
            'availability-impact': { base: 'fips-199-moderate' },
          },
        ],
      },
      'security-impact-level': {
        'security-objective-confidentiality': 'fips-199-moderate',
        'security-objective-integrity': 'fips-199-moderate',
        'security-objective-availability': 'fips-199-moderate',
      },
      status: { state: 'operational' },
      'authorization-boundary': { description: 'Isolated VPC enclave.' },
    },
    'system-implementation': {
      users: [{ uuid: UUID, title: 'System Admin' }],
      components: [
        {
          uuid: UUID,
          type: 'system',
          title: 'Northwind CUI Enclave',
          description: 'Generated component.',
          status: { state: 'operational' },
        },
      ],
    },
    'control-implementation': {
      description: 'Control implementation summary.',
      'implemented-requirements': [{ uuid: UUID, 'control-id': 'ac-2' }],
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
    initial_state: {
      sheetId: 'GRC-09',
      sampleJsonTemplate: SAMPLE_INPUT,
      files: {
        'input/system.json': JSON.stringify(SAMPLE_INPUT, null, 2),
      },
    },
    expected_state: {
      documentKind: 'ssp',
      scriptPath: 'generate_ssp.js',
      inputPath: 'input/system.json',
      outputPath: 'output/ssp.json',
      requireStaticChecks: true,
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
    expect(checks.find((c) => c.id === 'handles_missing_field')?.passed).toBe(
      false
    );
  });
});

describe('parseJsonFromStdout', () => {
  it('parses a trailing JSON object from noisy stdout', () => {
    const doc = parseJsonFromStdout(
      `Wrote output/ssp.json\n${JSON.stringify(VALID_SSP)}`
    );
    expect(doc).toMatchObject({
      'system-security-plan': { uuid: UUID },
    });
  });
});

describe('evaluateOscalGenerator / oscalGeneratorTicketScorer', () => {
  it('resolves when SSP schema validation and static checks both pass', async () => {
    const result = await oscalGeneratorTicketScorer.score(
      {
        files: {
          'generate_ssp.js': GOOD_SCRIPT,
          'input/system.json': JSON.stringify(SAMPLE_INPUT),
          'output/ssp.json': JSON.stringify(VALID_SSP),
        },
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'oscal_generator',
      schemaValid: true,
      staticPassed: true,
      documentKind: 'ssp',
    });
    expect(result.feedback).toMatch(/Capstone accepted/i);
    expect(result.feedback).toMatch(/structure checks passed/i);
  });

  it('needs revision when OSCAL output fails SSP schema validation', async () => {
    const structured = evaluateOscalGenerator(
      {
        files: {
          'generate_ssp.js': GOOD_SCRIPT,
          'input/system.json': JSON.stringify(SAMPLE_INPUT),
          'output/ssp.json': JSON.stringify({
            'system-security-plan': { uuid: UUID },
          }),
        },
      },
      ticket()
    );

    expect(structured.schemaValid).toBe(false);
    expect(structured.schemaErrors.length).toBeGreaterThan(0);

    const result = await oscalGeneratorTicketScorer.score(
      {
        files: {
          'generate_ssp.js': GOOD_SCRIPT,
          'input/system.json': JSON.stringify(SAMPLE_INPUT),
          'output/ssp.json': JSON.stringify({
            'system-security-plan': { uuid: UUID },
          }),
        },
      },
      ticket()
    );
    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toMatch(/schema validation/i);
  });

  it('accepts valid SSP JSON from stdout when output file is missing', async () => {
    const result = await oscalGeneratorTicketScorer.score(
      {
        files: {
          'generate_ssp.js': GOOD_SCRIPT,
          'input/system.json': JSON.stringify(SAMPLE_INPUT),
        },
        stdout: JSON.stringify(VALID_SSP),
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      schemaValid: true,
      staticPassed: true,
      outputSource: 'stdout',
    });
  });

  it('needs revision when sandbox run failed', async () => {
    const result = await oscalGeneratorTicketScorer.score(
      {
        files: {
          'generate_ssp.js': GOOD_SCRIPT,
          'input/system.json': JSON.stringify(SAMPLE_INPUT),
          'output/ssp.json': JSON.stringify(VALID_SSP),
        },
        sandboxRunFailed: true,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      reason: 'sandbox_run_failed',
    });
    expect(result.feedback).toMatch(/sandbox failed/i);
  });

  it('needs revision when generated output is missing', async () => {
    const result = await oscalGeneratorTicketScorer.score(
      {
        files: {
          'generate_ssp.js': GOOD_SCRIPT,
          'input/system.json': JSON.stringify(SAMPLE_INPUT),
        },
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      reason: 'missing_output',
    });
    expect(result.feedback).toMatch(/could not find generated OSCAL/i);
  });

  it('needs revision when schema is valid but static structure checks fail', async () => {
    const stubScript = `const fs = require('fs');
fs.writeFileSync('output/ssp.json', '{}');
`;
    const result = await oscalGeneratorTicketScorer.score(
      {
        files: {
          'generate_ssp.js': stubScript,
          'input/system.json': JSON.stringify(SAMPLE_INPUT),
          'output/ssp.json': JSON.stringify(VALID_SSP),
        },
      },
      ticket({
        expected_state: {
          documentKind: 'ssp',
          scriptPath: 'generate_ssp.js',
          inputPath: 'input/system.json',
          outputPath: 'output/ssp.json',
          requireStaticChecks: true,
          minScriptChars: 80,
        },
      })
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      schemaValid: true,
      staticPassed: false,
    });
    expect(result.feedback).toMatch(/Script structure checks failed/i);
    expect(result.feedback).not.toMatch(/Capstone accepted/i);
  });

  it('treats static checks as advisory when requireStaticChecks is false', async () => {
    const stubScript = `const fs = require('fs');
const input = JSON.parse(fs.readFileSync('input/system.json','utf8'));
fs.mkdirSync('output',{recursive:true});
fs.writeFileSync('output/ssp.json', JSON.stringify({ ok: true }));
`;

    const result = await oscalGeneratorTicketScorer.score(
      {
        files: {
          'generate_ssp.js': stubScript,
          'input/system.json': JSON.stringify(SAMPLE_INPUT),
          'output/ssp.json': JSON.stringify(VALID_SSP),
        },
      },
      ticket({
        expected_state: {
          documentKind: 'ssp',
          scriptPath: 'generate_ssp.js',
          inputPath: 'input/system.json',
          outputPath: 'output/ssp.json',
          requireStaticChecks: false,
        },
      })
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      schemaValid: true,
      staticPassed: false,
    });
    expect(result.feedback).toMatch(/Advisory script notes/i);
  });
});
