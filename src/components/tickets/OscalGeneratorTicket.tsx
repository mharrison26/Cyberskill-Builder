'use client';

import { useMemo } from 'react';

import { CodeSandbox } from '@/components/CodeSandbox';
import { Badge } from '@/components/ui/badge';
import { initialStateToFiles } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type OscalGeneratorTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  > &
    Partial<Pick<Ticket, 'scenario_brief'>>;
  readOnly?: boolean;
  className?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Sheet/seed sample JSON template (object or string) from initial_state. */
export function sampleJsonTemplateFromInitialState(
  initialState: Record<string, unknown>
): Record<string, unknown> | null {
  const raw =
    initialState.sampleJsonTemplate ??
    initialState.sample_json_template ??
    initialState.sampleInput;

  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  return null;
}

function stringFromExpected(
  expected: Record<string, unknown>,
  key: string,
  fallback: string
): string {
  const value = expected[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/**
 * GRC-09 OSCAL automation capstone: WebContainer sandbox seeded with the
 * sample JSON template. On submit, the script is re-run against that sample
 * input; the server grades schema validation + basic script structure checks.
 */
export function OscalGeneratorTicket({
  ticket,
  readOnly = false,
  className,
}: OscalGeneratorTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const files = useMemo(
    () => initialStateToFiles(initialState),
    [ticket.initial_state]
  );

  const inputPath = stringFromExpected(
    expectedState,
    'inputPath',
    'input/system.json'
  );
  const scriptPath = stringFromExpected(
    expectedState,
    'scriptPath',
    'generate_ssp.js'
  );

  const sampleTemplate = sampleJsonTemplateFromInitialState(initialState);
  const inputContents =
    sampleTemplate !== null
      ? `${JSON.stringify(sampleTemplate, null, 2)}\n`
      : (files[inputPath] ??
        files['input/system.json'] ??
        '{\n  "system_name": "",\n  "fips_199_category": "",\n  "controls": []\n}\n');

  const prompt =
    (typeof initialState.prompt === 'string' && initialState.prompt.trim()
      ? initialState.prompt.trim()
      : null) ??
    (typeof ticket.scenario_brief === 'string' && ticket.scenario_brief.trim()
      ? ticket.scenario_brief.trim()
      : 'Write a script that reads the sample JSON input and generates a valid OSCAL SSP fragment.');

  return (
    <section
      aria-labelledby="oscal-generator-heading"
      className={cn('space-y-4', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="oscal-generator-heading" className="text-lg font-semibold">
          OSCAL SSP generator
        </h2>
        <Badge variant="outline">PI-04 · WebContainer</Badge>
        <Badge variant="outline">GRC-09</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      <p className="max-w-prose text-sm text-muted-foreground">
        Edit <code className="text-foreground">{scriptPath}</code> (or replace
        it with a Python{' '}
        <code className="text-foreground">generate_ssp.py</code>) to read{' '}
        <code className="text-foreground">{inputPath}</code> (sample template
        with <code className="text-foreground">system_name</code>,{' '}
        <code className="text-foreground">fips_199_category</code>, and{' '}
        <code className="text-foreground">controls</code>) and write a valid
        OSCAL SSP to <code className="text-foreground">output/ssp.json</code>.
        Submit re-runs your script against the sample input in the sandbox. You
        pass when the generated OSCAL schema-validates and the script passes
        basic structure checks (reads input, writes JSON, not a stub) — not a
        full code review.
      </p>

      <CodeSandbox
        ticketId={ticket.id}
        initialState={files}
        readOnly={readOnly}
        runOnSubmit={{
          inputPath,
          inputContents,
          scriptPath,
        }}
      />
    </section>
  );
}
