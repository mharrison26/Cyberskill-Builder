import { describe, expect, it } from 'vitest';

import {
  INCIDENT_NOTIFICATION_MIN_DRAFT_LENGTH,
  evaluateIncidentNotificationDeterministic,
  extractIncidentNotificationSubmission,
  isIncidentNotificationTicketType,
  parseIncidentFacts,
  parseIncidentNotificationExpectedState,
  parseIncidentNotificationPolicyRules,
} from '@/lib/scoring/incidentNotification';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-inc-notify-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'incident_notification',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      'ISSO-02: Draft incident notifications and identify required recipients/deadlines.',
    initial_state: {
      ticketCode: 'ISSO-02',
      incident: {
        id: 'INC-2026-0412',
        title: 'Unauthorized access to billing API',
        discoveredAt: '2026-04-12T14:05:00Z',
        summary:
          'SOC detected anomalous API keys accessing the billing service.',
        system: 'prod-billing-api',
        impact: 'Possible exposure of customer invoice metadata.',
        classification: 'Confirmed unauthorized access',
      },
      policy: {
        title: 'Agency Incident Notification Timeline',
        rules: [
          {
            recipientId: 'issm',
            recipientLabel: 'ISSM',
            deadlineHours: 1,
            description: 'Report confirmed incidents to the ISSM within 1 hour.',
          },
          {
            recipientId: 'ao',
            recipientLabel: 'Authorizing Official',
            deadlineHours: 24,
            description: 'Notify the AO within 24 hours.',
          },
          {
            recipientId: 'us-cert',
            recipientLabel: 'US-CERT / CISA',
            deadlineHours: 72,
            description: 'Report to US-CERT within 72 hours.',
          },
          {
            recipientId: 'privacy-officer',
            recipientLabel: 'Privacy Officer',
            deadlineHours: 24,
            description: 'Notify Privacy Officer only if PII is confirmed.',
          },
        ],
      },
    },
    expected_state: {
      requiredNotifications: [
        { recipientId: 'issm', deadlineHours: 1 },
        { recipientId: 'ao', deadlineHours: 24 },
        { recipientId: 'us-cert', deadlineHours: 72 },
      ],
      minDraftLength: 120,
      allowExtraRecipients: false,
    },
    dcwf_code: '722',
    sort_order: 1,
    ...overrides,
  };
}

const goodDraft = `
INC-2026-0412: At 14:05 UTC on 12 Apr 2026, SOC confirmed unauthorized API
access to prod-billing-api with possible exposure of customer invoice metadata.
Containment is underway. Per policy, ISSM notified within 1 hour, AO within
24 hours, and US-CERT within 72 hours of discovery.
`.trim();

const goodNotifications = [
  { recipientId: 'issm', deadlineHours: 1 },
  { recipientId: 'ao', deadlineHours: 24 },
  { recipientId: 'us-cert', deadlineHours: 72 },
];

describe('incidentNotification scorer', () => {
  it('registers incident_notification aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('incident_notification');
    expect(registered).toContain('incident_reporting');
    expect(registered).toContain('isso_incident_notify');
    expect(getTicketScorer('incident_notification')).toBeTruthy();
    expect(getTicketScorer('incident_reporting')).toBe(
      getTicketScorer('incident_notification')
    );
    expect(isIncidentNotificationTicketType('grc.isso_incident_notify')).toBe(
      true
    );
  });

  it('parses incident facts and policy rules from initial_state', () => {
    const facts = parseIncidentFacts(ticket().initial_state);
    expect(facts).toMatchObject({
      id: 'INC-2026-0412',
      discoveredAt: '2026-04-12T14:05:00Z',
      system: 'prod-billing-api',
    });

    const rules = parseIncidentNotificationPolicyRules(ticket().initial_state);
    expect(rules.map((r) => r.recipientId)).toEqual([
      'issm',
      'ao',
      'us-cert',
      'privacy-officer',
    ]);
    expect(rules.find((r) => r.recipientId === 'us-cert')?.deadlineHours).toBe(
      72
    );
  });

  it('parses expected_state knobs', () => {
    const parsed = parseIncidentNotificationExpectedState({
      requiredNotifications: [
        { recipientId: 'ISSM', deadlineHours: 1 },
        { recipient_id: 'us_cert', deadline_hours: 72 },
      ],
      minDraftLength: 120,
      allowExtraRecipients: false,
    });

    expect(parsed).toMatchObject({
      minDraftLength: 120,
      allowExtraRecipients: false,
      requiredNotifications: [
        { recipientId: 'issm', deadlineHours: 1 },
        { recipientId: 'us-cert', deadlineHours: 72 },
      ],
    });
  });

  it('extracts notifications and draft', () => {
    const parsed = extractIncidentNotificationSubmission({
      type: 'incident_notification',
      notifications: [
        { recipientId: ' issm ', deadlineHours: 1 },
        { recipientId: 'us-cert', deadline_hours: '72' },
      ],
      draft: '  hello draft  ',
    });

    expect(parsed).toEqual({
      type: 'incident_notification',
      notifications: [
        { recipientId: 'issm', deadlineHours: 1 },
        { recipientId: 'us-cert', deadlineHours: 72 },
      ],
      draft: 'hello draft',
    });
  });

  it('fails when fields are missing', () => {
    const missing = evaluateIncidentNotificationDeterministic({}, ticket());
    expect(missing.ok).toBe(false);
    expect(missing.structured.reason).toBe('missing_fields');
  });

  it('fails when a required recipient is missing', () => {
    const result = evaluateIncidentNotificationDeterministic(
      {
        notifications: [
          { recipientId: 'issm', deadlineHours: 1 },
          { recipientId: 'us-cert', deadlineHours: 72 },
        ],
        draft: goodDraft,
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_recipients');
    expect(result.structured.missingRecipientIds).toEqual(['ao']);
    expect(result.feedback).toMatch(/ao/i);
  });

  it('fails when a deadline does not match policy', () => {
    const result = evaluateIncidentNotificationDeterministic(
      {
        notifications: [
          { recipientId: 'issm', deadlineHours: 1 },
          { recipientId: 'ao', deadlineHours: 48 },
          { recipientId: 'us-cert', deadlineHours: 72 },
        ],
        draft: goodDraft,
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('wrong_deadlines');
    expect(result.structured.wrongDeadlineRecipientIds).toEqual(['ao']);
    expect(result.feedback).toMatch(/expected 24h/i);
  });

  it('fails when an extra recipient is selected', () => {
    const result = evaluateIncidentNotificationDeterministic(
      {
        notifications: [
          ...goodNotifications,
          { recipientId: 'privacy-officer', deadlineHours: 24 },
        ],
        draft: goodDraft,
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('extra_recipients');
    expect(result.structured.extraRecipientIds).toEqual(['privacy-officer']);
  });

  it('fails when draft is too short even if notifications are correct', () => {
    const result = evaluateIncidentNotificationDeterministic(
      {
        notifications: goodNotifications,
        draft: 'Too short.',
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('draft_too_short');
    expect(result.structured.notificationsOk).toBe(true);
    expect(result.structured.draftLengthOk).toBe(false);
    expect(result.feedback).toMatch(
      new RegExp(String(INCIDENT_NOTIFICATION_MIN_DRAFT_LENGTH))
    );
  });

  it('passes when all required recipient+deadline pairs match and draft is long enough', () => {
    const result = evaluateIncidentNotificationDeterministic(
      {
        type: 'incident_notification',
        notifications: [
          { recipientId: 'us-cert', deadlineHours: 72 },
          { recipientId: 'issm', deadlineHours: 1 },
          { recipientId: 'ao', deadlineHours: 24 },
        ],
        draft: goodDraft,
      },
      ticket()
    );

    expect(result.ok).toBe(true);
    expect(result.structured).toMatchObject({
      style: 'incident_notification',
      notificationsOk: true,
      draftLengthOk: true,
      missingRecipientIds: [],
      wrongDeadlineRecipientIds: [],
      extraRecipientIds: [],
    });
  });

  it('scores resolved via registered scorer', async () => {
    const scorer = getTicketScorer('incident_notification');
    expect(scorer).toBeTruthy();
    const outcome = await scorer!.score(
      {
        type: 'incident_notification',
        notifications: goodNotifications,
        draft: goodDraft,
      },
      ticket()
    );
    expect(outcome.status).toBe('resolved');
  });
});
