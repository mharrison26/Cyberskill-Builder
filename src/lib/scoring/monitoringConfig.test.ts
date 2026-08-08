import { describe, expect, it } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';
import {
  evaluateMonitoringConfig,
  extractMonitoringConfigSubmission,
  monitoringConfigTicketScorer,
  parseMonitoringConfigExpectedState,
} from '@/lib/scoring/monitoringConfig';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-mon-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'monitoring_config',
    difficulty: 'medium',
    sla_minutes: 30,
    scenario_brief: 'Configure monitoring alerts for HarborCheckout.',
    initial_state: {
      prompt: 'Define alerts for disk, service down, and error rate.',
    },
    expected_state: {
      requiredAlerts: [
        {
          alertType: 'disk_space',
          thresholdMin: 80,
          thresholdMax: 95,
          acceptedRoutes: ['pagerduty', 'email_oncall'],
        },
        {
          alertType: 'service_down',
          thresholdMin: 1,
          thresholdMax: 3,
          acceptedRoutes: ['pagerduty', 'email_oncall'],
        },
        {
          alertType: 'high_error_rate',
          thresholdMin: 1,
          thresholdMax: 5,
          acceptedRoutes: ['pagerduty', 'slack_ops', 'email_oncall'],
        },
      ],
    },
    dcwf_code: null,
    sort_order: 0,
    ...overrides,
  };
}

const passingAlerts = [
  { alertType: 'disk_space', threshold: 90, route: 'pagerduty' },
  { alertType: 'service_down', threshold: 2, route: 'pagerduty' },
  { alertType: 'high_error_rate', threshold: 2, route: 'slack_ops' },
];

describe('monitoringConfig scorer', () => {
  it('registers monitoring_config and aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('monitoring_config');
    expect(registered).toContain('alert_config');
    expect(registered).toContain('monitoring_alerts');
    expect(getTicketScorer('monitoring_config')).toBeTruthy();
    expect(getTicketScorer('alert_config')).toBe(
      getTicketScorer('monitoring_config')
    );
  });

  it('parses requiredAlerts with aliases', () => {
    expect(
      parseMonitoringConfigExpectedState({
        required_alerts: [
          {
            type: 'Disk Usage',
            min: 80,
            max: 95,
            routes: ['PagerDuty', 'email'],
          },
        ],
      })
    ).toEqual({
      requiredAlerts: [
        {
          alertType: 'disk_space',
          thresholdMin: 80,
          thresholdMax: 95,
          acceptedRoutes: ['pagerduty', 'email_oncall'],
        },
      ],
    });
  });

  it('extracts submission alerts with snake_case aliases', () => {
    const parsed = extractMonitoringConfigSubmission({
      type: 'monitoring_config',
      alerts: [
        {
          alert_type: 'error_rate',
          value: '3',
          destination: 'slack',
        },
      ],
    });

    expect(parsed).toEqual({
      type: 'monitoring_config',
      alerts: [
        {
          alertType: 'high_error_rate',
          threshold: 3,
          route: 'slack_ops',
        },
      ],
    });
  });

  it('passes when all required alerts have sensible thresholds and routes', async () => {
    const result = await monitoringConfigTicketScorer.score(
      {
        type: 'monitoring_config',
        alerts: [
          ...passingAlerts,
          // Extra alert is tolerated.
          { alertType: 'cpu_saturation', threshold: 85, route: 'ticket_queue' },
        ],
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.feedback).toContain('covers all required alerts');
    expect(result.structuredResult).toMatchObject({
      style: 'monitoring_config',
      allRequiredCovered: true,
      requiredCount: 3,
    });
  });

  it('fails when a required alert type is missing', () => {
    const result = evaluateMonitoringConfig(
      {
        type: 'monitoring_config',
        alerts: [
          { alertType: 'disk_space', threshold: 90, route: 'pagerduty' },
          { alertType: 'service_down', threshold: 2, route: 'pagerduty' },
        ],
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.feedback).toContain('Missing required alert');
    expect(result.feedback).toMatch(/error rate/i);
    expect(result.structured.allRequiredCovered).toBe(false);
  });

  it('fails when a threshold is outside the acceptable range', () => {
    const result = evaluateMonitoringConfig(
      {
        type: 'monitoring_config',
        alerts: [
          { alertType: 'disk_space', threshold: 50, route: 'pagerduty' },
          { alertType: 'service_down', threshold: 2, route: 'pagerduty' },
          { alertType: 'high_error_rate', threshold: 2, route: 'slack_ops' },
        ],
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.feedback).toContain('threshold must be between 80 and 95');
    expect(result.feedback).toContain('50');
  });

  it('fails when routing is not an accepted destination', () => {
    const result = evaluateMonitoringConfig(
      {
        type: 'monitoring_config',
        alerts: [
          { alertType: 'disk_space', threshold: 90, route: 'ticket_queue' },
          { alertType: 'service_down', threshold: 2, route: 'pagerduty' },
          { alertType: 'high_error_rate', threshold: 2, route: 'slack_ops' },
        ],
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.feedback).toMatch(/must route to one of/i);
  });

  it('fails when expected_state is misconfigured', () => {
    const result = evaluateMonitoringConfig(
      { type: 'monitoring_config', alerts: passingAlerts },
      ticket({ expected_state: {} })
    );
    expect(result.ok).toBe(false);
    expect(result.feedback).toContain('missing requiredAlerts');
  });

  it('fails when alerts are missing from the submission', () => {
    const result = evaluateMonitoringConfig(
      { type: 'monitoring_config' },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.feedback).toContain('at least one alert');
  });
});
