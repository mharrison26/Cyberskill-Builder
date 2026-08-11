import { computeSlaDueAt, wasResolvedWithinSla } from '@/lib/tickets/sla';
import type {
  MockControl,
  MockDefenseRecording,
  MockFinding,
  MockGradingQueueItem,
  MockLesson,
  MockTrack,
  MockTrackTicket,
  MockUser,
} from '@/types';

export const MOCK_USER: MockUser = {
  id: 'user-001',
  name: 'Jordan Chen',
  email: 'jordan.chen@example.mil',
  isAdmin: true,
};

export const MOCK_PUBLIC_USER = {
  name: 'Alex Rivera',
  slug: 'alex-rivera',
  title: 'Cybersecurity Analyst',
  organization: 'Defense Contracting Program',
};

export const MOCK_TRACKS: MockTrack[] = [
  {
    id: 'track-grc',
    slug: 'grc-fundamentals',
    name: 'GRC Fundamentals',
    description:
      'Governance, risk, and compliance foundations aligned to NIST SP 800-53 Rev. 5 and DoD RMF.',
  },
  {
    id: 'track-rmf',
    slug: 'rmf-practitioner',
    name: 'RMF Practitioner',
    description:
      'Hands-on Risk Management Framework workflow for authorizing information systems.',
  },
];

export const MOCK_LESSONS: MockLesson[] = [
  {
    id: 'lesson-001',
    trackSlug: 'grc-fundamentals',
    tier: 'foundation',
    lessonType: 'conceptual',
    sortOrder: 1,
    title: 'Introduction to NIST SP 800-53 Control Families',
    learningObjectives: [
      'Identify the 20 control families in NIST SP 800-53 Rev. 5',
      'Describe the relationship between control baselines and system categorization',
      'Explain how control selection supports RMF Step 2 (Select)',
    ],
    dcwfCode: 'RMF-001',
    status: 'satisfied',
    content: `## Control Family Overview

NIST SP 800-53 organizes security and privacy controls into **20 families**, each identified by a two-letter acronym (e.g., AC for Access Control).

### Key Concepts

- **Baseline tailoring**: Organizations select controls based on FIPS 199 impact levels (Low, Moderate, High).
- **Control enhancement**: Optional additions that increase control strength for high-impact systems.
- **Inheritance**: Common controls provided by the ISSO or cloud service provider reduce assessment scope.

### Access Control (AC) Family

The AC family defines policies for granting users access to system resources. AC-1 establishes policy and procedures; AC-2 covers account management.`,
  },
  {
    id: 'lesson-002',
    trackSlug: 'grc-fundamentals',
    tier: 'foundation',
    lessonType: 'artifact_lab',
    sortOrder: 2,
    title: 'Draft AC-1 Policy Statement',
    learningObjectives: [
      'Analyze a sample system security plan excerpt',
      'Draft a CCCER finding for AC-1 policy gaps',
      'Map evidence artifacts to OSCAL assessment results',
    ],
    dcwfCode: 'RMF-002',
    status: 'insufficient_evidence',
    evidenceJson: JSON.stringify(
      {
        uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        title: 'AC-1 Access Control Policy Assessment',
        description:
          'Automated assessment of access control policy documentation',
        start: '2026-01-15T09:00:00Z',
        end: '2026-01-15T09:45:00Z',
        status: 'partial',
        result: {
          control_id: 'ac-1',
          finding: 'insufficient_evidence',
          observations: [
            {
              uuid: 'obs-001',
              description:
                'Policy document exists but lacks annual review date',
              methods: ['EXAMINE'],
              collected: '2026-01-15T09:30:00Z',
            },
          ],
        },
      },
      null,
      2
    ),
  },
  {
    id: 'lesson-003',
    trackSlug: 'grc-fundamentals',
    tier: 'intermediate',
    lessonType: 'tool_walkthrough',
    sortOrder: 3,
    title: 'eMASS Control Assessment Workflow',
    learningObjectives: [
      'Navigate eMASS control inheritance views',
      'Upload evidence artifacts to the correct control',
      'Submit a control for assessor review',
    ],
    dcwfCode: 'RMF-003',
    status: 'not_started',
  },
  {
    id: 'lesson-004',
    trackSlug: 'grc-fundamentals',
    tier: 'intermediate',
    lessonType: 'conceptual',
    sortOrder: 4,
    title: 'Continuous Monitoring Strategy',
    learningObjectives: [
      'Define POA&M lifecycle stages',
      'Identify metrics for ongoing authorization',
    ],
    dcwfCode: 'RMF-004',
    status: 'not_satisfied',
    content: `## Continuous Monitoring

Continuous monitoring (ConMon) is RMF Step 6. It ensures security controls remain effective throughout the system lifecycle.

Organizations must establish a ConMon strategy that includes vulnerability scanning frequency, configuration baseline reviews, and POA&M tracking.`,
  },
  {
    id: 'lesson-005',
    trackSlug: 'rmf-practitioner',
    tier: 'foundation',
    lessonType: 'artifact_lab',
    sortOrder: 1,
    title: 'Security Authorization Package Review',
    learningObjectives: [
      'Evaluate a sample SAR for completeness',
      'Identify missing artifacts in the authorization package',
    ],
    dcwfCode: 'RMF-010',
    status: 'not_started',
    evidenceJson: JSON.stringify(
      {
        package_id: 'SAP-2026-0042',
        system_name: 'Enterprise Collaboration Platform',
        impact_level: 'Moderate',
        artifacts: ['SSP', 'SAR', 'POA&M'],
        missing: ['Privacy Impact Assessment'],
      },
      null,
      2
    ),
  },
];

export const MOCK_CONTROLS: MockControl[] = [
  {
    id: 'AC-1',
    family: 'Access Control',
    title: 'Policy and Procedures',
    statement:
      'Develop, document, and disseminate access control policy and procedures.',
  },
  {
    id: 'AC-2',
    family: 'Access Control',
    title: 'Account Management',
    statement:
      'Define and document the types of accounts allowed and specifically prohibited for use on the system.',
  },
  {
    id: 'AC-3',
    family: 'Access Control',
    title: 'Access Enforcement',
    statement:
      'Enforce approved authorizations for logical access to information and system resources.',
  },
  {
    id: 'AU-2',
    family: 'Audit and Accountability',
    title: 'Event Logging',
    statement:
      'Identify the types of events that the system is capable of logging.',
  },
  {
    id: 'AU-6',
    family: 'Audit and Accountability',
    title: 'Audit Record Review, Analysis, and Reporting',
    statement:
      'Review and analyze system audit records for indications of inappropriate or unusual activity.',
  },
  {
    id: 'CM-2',
    family: 'Configuration Management',
    title: 'Baseline Configuration',
    statement:
      'Develop, document, and maintain under configuration control, a current baseline configuration of the system.',
  },
  {
    id: 'IA-2',
    family: 'Identification and Authentication',
    title: 'Identification and Authentication (Organizational Users)',
    statement:
      'Uniquely identify and authenticate organizational users and associate that unique identification with processes.',
  },
  {
    id: 'IR-4',
    family: 'Incident Response',
    title: 'Incident Handling',
    statement:
      'Implement an incident handling capability for incidents that includes preparation, detection, analysis, containment, recovery, and user response activities.',
  },
  {
    id: 'RA-5',
    family: 'Risk Assessment',
    title: 'Vulnerability Monitoring and Scanning',
    statement:
      'Monitor and scan for vulnerabilities in the system and hosted applications.',
  },
  {
    id: 'SC-7',
    family: 'System and Communications Protection',
    title: 'Boundary Protection',
    statement:
      'Monitor and control communications at the external managed interfaces to the system and key internal managed interfaces.',
  },
];

/** Placeholder defense clip (silent generated tone via data URL is impractical; use empty until recorded). */
export const MOCK_DEFENSE_SAMPLE: MockDefenseRecording = {
  id: 'defense-001',
  url: '',
  mediaType: 'audio',
  durationSeconds: 94,
  isPublic: true,
  createdAt: '2026-07-18T14:22:00.000Z',
};

const MOCK_AO_PROMPT_QUESTIONS = [
  {
    id: 'q1',
    prompt:
      'Given the residual risk on AC-2 privileged access reviews, what compensating controls make authorization acceptable until the POA&M closes?',
    focus: 'residual risk',
  },
  {
    id: 'q2',
    prompt:
      'Walk through why the scheduled completion date on the AC-2 POA&M item is credible and who owns the milestone.',
    focus: 'POA&M adequacy',
  },
];

export const MOCK_FINDINGS: MockFinding[] = [
  {
    id: 'finding-001',
    controlId: 'AC-1',
    findingState: 'satisfied',
    dcwfCode: '722',
    dcwfTitle: 'Information Systems Security Manager',
    narrative:
      'Access control policy is documented, approved by the AO, and disseminated to all system users. Annual review completed 2025-11-01.',
    createdAt: '2026-07-12T16:05:00.000Z',
    isPublic: true,
    defense: MOCK_DEFENSE_SAMPLE,
    promptQuestions: MOCK_AO_PROMPT_QUESTIONS,
  },
  {
    id: 'finding-002',
    controlId: 'AC-2',
    findingState: 'insufficient_evidence',
    dcwfCode: '722',
    dcwfTitle: 'Information Systems Security Manager',
    narrative:
      'Account management procedures exist but evidence of quarterly access reviews for privileged accounts was not provided.',
    createdAt: '2026-07-14T11:30:00.000Z',
    isPublic: false,
    defense: null,
    promptQuestions: MOCK_AO_PROMPT_QUESTIONS,
  },
  {
    id: 'finding-003',
    controlId: 'AU-6',
    findingState: 'not_satisfied',
    dcwfCode: '612',
    dcwfTitle: 'Security Control Assessor',
    narrative:
      'Audit log review procedures are documented but no evidence of automated alerting for failed authentication attempts.',
    createdAt: '2026-07-20T09:15:00.000Z',
    isPublic: true,
    defense: null,
  },
  {
    id: 'finding-004',
    controlId: 'CM-2',
    findingState: 'not_started',
    dcwfCode: '612',
    dcwfTitle: 'Security Control Assessor',
    narrative:
      'Baseline configuration documentation has not yet been submitted for assessor review.',
    createdAt: '2026-08-01T13:45:00.000Z',
    isPublic: false,
    defense: null,
  },
];

/** Minutes ago → ISO started_at for SLA demos. */
function startedMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** Closed-ticket SLA fields so console countdown widgets stay frozen. */
function closedSlaFields(
  startedMinutes: number,
  resolvedAfterMinutes: number,
  slaMinutes: number
): Pick<MockTrackTicket, 'startedAt' | 'resolvedAt' | 'slaDueAt' | 'slaMet'> {
  const startedAt = startedMinutesAgo(startedMinutes);
  const resolvedAt = startedMinutesAgo(startedMinutes - resolvedAfterMinutes);
  return {
    startedAt,
    resolvedAt,
    slaDueAt: computeSlaDueAt(startedAt, slaMinutes),
    slaMet: wasResolvedWithinSla(startedAt, resolvedAt, slaMinutes),
  };
}

/**
 * Placeholder track tickets for console UIs.
 * useTrackTickets returns these until the RLS Supabase query is wired.
 */
export const MOCK_TRACK_TICKETS: MockTrackTicket[] = [
  {
    id: 'grc-tkt-001',
    trackSlug: 'grc',
    title: 'AC-2 privileged account review gap',
    subtitle: 'Finding · Engagement Q3-2026 ConMon',
    ticketType: 'cccer_exception',
    difficulty: 'high',
    slaMinutes: 240,
    startedAt: startedMinutesAgo(95),
    status: 'in_progress',
    controlFamily: 'Access Control',
    controlId: 'AC-2',
    severity: 'high',
    poamDueAt: '2026-08-20',
    dcwfCode: '722',
    sortOrder: 1,
  },
  {
    id: 'grc-tkt-002',
    trackSlug: 'grc',
    title: 'AU-6 audit log review evidence package',
    subtitle: 'Finding · Engagement Q3-2026 ConMon',
    ticketType: 'audit_workpaper',
    difficulty: 'critical',
    slaMinutes: 120,
    startedAt: startedMinutesAgo(140),
    status: 'in_progress',
    controlFamily: 'Audit and Accountability',
    controlId: 'AU-6',
    severity: 'critical',
    poamDueAt: '2026-08-12',
    dcwfCode: '612',
    sortOrder: 2,
  },
  {
    id: 'grc-tkt-003',
    trackSlug: 'grc',
    title: 'CM-2 baseline configuration attestation',
    subtitle: 'POA&M milestone · ISSO-04',
    ticketType: 'poam',
    difficulty: 'medium',
    slaMinutes: 480,
    startedAt: null,
    status: 'new',
    controlFamily: 'Configuration Management',
    controlId: 'CM-2',
    severity: 'medium',
    poamDueAt: '2026-09-01',
    dcwfCode: '722',
    sortOrder: 3,
  },
  {
    id: 'grc-tkt-004',
    trackSlug: 'grc',
    title: 'IA-2 MFA enforcement for organizational users',
    subtitle: 'Control assessment · Tier 2',
    ticketType: 'control_assessment',
    difficulty: 'high',
    slaMinutes: 360,
    startedAt: startedMinutesAgo(30),
    status: 'in_progress',
    controlFamily: 'Identification and Authentication',
    controlId: 'IA-2',
    severity: 'high',
    poamDueAt: null,
    dcwfCode: '722',
    sortOrder: 4,
  },
  {
    id: 'grc-tkt-005',
    trackSlug: 'grc',
    title: 'RA-5 vulnerability scan exception review',
    subtitle: 'Finding · Closed pending AO',
    ticketType: 'ao_review',
    difficulty: 'medium',
    slaMinutes: 720,
    ...closedSlaFields(600, 90, 720),
    status: 'resolved',
    controlFamily: 'Risk Assessment',
    controlId: 'RA-5',
    severity: 'medium',
    poamDueAt: '2026-08-28',
    dcwfCode: '612',
    sortOrder: 5,
  },
  {
    id: 'grc-tkt-006',
    trackSlug: 'grc',
    title: 'SC-7 boundary protection ConMon metric',
    subtitle: 'Continuous monitoring · Monthly',
    ticketType: 'conmon_strategy',
    difficulty: 'low',
    slaMinutes: 1440,
    ...closedSlaFields(200, 45, 1440),
    status: 'reviewed',
    controlFamily: 'System and Communications Protection',
    controlId: 'SC-7',
    severity: 'low',
    poamDueAt: null,
    dcwfCode: '722',
    sortOrder: 6,
  },
  {
    id: 'grc-tkt-007',
    trackSlug: 'grc',
    title: 'IR-4 incident handling tabletop evidence',
    subtitle: 'Engagement · Annual IR exercise',
    ticketType: 'incident_response',
    difficulty: 'high',
    slaMinutes: 180,
    startedAt: null,
    status: 'new',
    controlFamily: 'Incident Response',
    controlId: 'IR-4',
    severity: 'high',
    poamDueAt: '2026-08-15',
    dcwfCode: '531',
    sortOrder: 7,
  },

  // —— HelpDesk ——
  {
    id: 'hd-tkt-001',
    trackSlug: 'helpdesk',
    title: 'Unable to reset CAC PIN before shift',
    subtitle: 'HD-03 · Account unlock',
    ticketType: 'account_unlock',
    difficulty: 'high',
    slaMinutes: 30,
    startedAt: startedMinutesAgo(22),
    status: 'in_progress',
    requester: 'SSgt Maya Ortiz',
    queueBucket: 'my_queue',
    dcwfCode: '411',
    sortOrder: 1,
  },
  {
    id: 'hd-tkt-002',
    trackSlug: 'helpdesk',
    title: 'VPN disconnects every ~12 minutes',
    subtitle: 'HD-05 · Remote access',
    ticketType: 'vpn_triage',
    difficulty: 'medium',
    slaMinutes: 60,
    startedAt: startedMinutesAgo(18),
    status: 'in_progress',
    requester: 'LT Chris Nguyen',
    queueBucket: 'my_queue',
    dcwfCode: '411',
    sortOrder: 2,
  },
  {
    id: 'hd-tkt-003',
    trackSlug: 'helpdesk',
    title: 'New contractor needs AD group + mailbox',
    subtitle: 'HD-02 · Onboarding',
    ticketType: 'onboarding',
    difficulty: 'medium',
    slaMinutes: 240,
    startedAt: null,
    status: 'new',
    requester: 'HR Desk',
    queueBucket: 'unassigned',
    dcwfCode: '411',
    sortOrder: 3,
  },
  {
    id: 'hd-tkt-004',
    trackSlug: 'helpdesk',
    title: 'Shared drive permissions broken after move',
    subtitle: 'HD-04 · File access',
    ticketType: 'permissions',
    difficulty: 'low',
    slaMinutes: 120,
    startedAt: null,
    status: 'new',
    requester: 'Logistics NCO',
    queueBucket: 'unassigned',
    dcwfCode: '411',
    sortOrder: 4,
  },
  {
    id: 'hd-tkt-005',
    trackSlug: 'helpdesk',
    title: 'Phish report — credential harvest attempt',
    subtitle: 'HD-07 · Escalated to SOC',
    ticketType: 'security_escalation',
    difficulty: 'critical',
    slaMinutes: 15,
    startedAt: startedMinutesAgo(28),
    status: 'in_progress',
    requester: 'Anon tip line',
    queueBucket: 'escalated',
    dcwfCode: '411',
    sortOrder: 5,
  },
  {
    id: 'hd-tkt-006',
    trackSlug: 'helpdesk',
    title: 'Printer queue stuck — building 210',
    subtitle: 'HD-01 · Hardware',
    ticketType: 'hardware',
    difficulty: 'low',
    slaMinutes: 480,
    ...closedSlaFields(90, 35, 480),
    status: 'resolved',
    requester: 'Admin Support',
    queueBucket: 'my_queue',
    dcwfCode: '411',
    sortOrder: 6,
  },

  // —— Sysadmin / IT Admin ——
  {
    id: 'sa-tkt-001',
    trackSlug: 'sysadmin',
    title: 'Disk pressure on app-db-03',
    subtitle: 'ALERT · Filesystem > 92%',
    ticketType: 'disk_pressure',
    difficulty: 'critical',
    slaMinutes: 45,
    startedAt: startedMinutesAgo(38),
    status: 'in_progress',
    hostname: 'app-db-03.corp.local',
    severity: 'critical',
    dcwfCode: '451',
    sortOrder: 1,
  },
  {
    id: 'sa-tkt-002',
    trackSlug: 'sysadmin',
    title: 'NTP drift on edge switches',
    subtitle: 'ALERT · Clock skew > 5s',
    ticketType: 'ntp_drift',
    difficulty: 'high',
    slaMinutes: 60,
    startedAt: startedMinutesAgo(25),
    status: 'in_progress',
    hostname: 'sw-edge-07.corp.local',
    severity: 'high',
    dcwfCode: '451',
    sortOrder: 2,
  },
  {
    id: 'sa-tkt-003',
    trackSlug: 'sysadmin',
    title: 'Cert expiry — wildcard.internal',
    subtitle: 'WARNING · 9 days remaining',
    ticketType: 'cert_renewal',
    difficulty: 'medium',
    slaMinutes: 720,
    startedAt: null,
    status: 'new',
    hostname: 'lb-front-01.corp.local',
    severity: 'medium',
    dcwfCode: '451',
    sortOrder: 3,
  },
  {
    id: 'sa-tkt-004',
    trackSlug: 'sysadmin',
    title: 'Failed Ansible run — patch window',
    subtitle: 'INCIDENT · Playbook exit 2',
    ticketType: 'config_drift',
    difficulty: 'high',
    slaMinutes: 120,
    startedAt: startedMinutesAgo(55),
    status: 'in_progress',
    hostname: 'cfg-mgmt.corp.local',
    severity: 'high',
    dcwfCode: '451',
    sortOrder: 4,
  },
  {
    id: 'sa-tkt-005',
    trackSlug: 'sysadmin',
    title: 'Backup job missed RPO',
    subtitle: 'ALERT · nightly-sql',
    ticketType: 'backup_miss',
    difficulty: 'medium',
    slaMinutes: 180,
    startedAt: null,
    status: 'new',
    hostname: 'bak-vault-02.corp.local',
    severity: 'medium',
    dcwfCode: '451',
    sortOrder: 5,
  },

  // —— IT Auditor ——
  {
    id: 'aud-tkt-001',
    trackSlug: 'auditor',
    title: 'Sample privileged access reviews',
    subtitle: 'WP-AC-02 · Population 48',
    ticketType: 'audit_workpaper',
    difficulty: 'high',
    slaMinutes: 1440,
    startedAt: startedMinutesAgo(200),
    status: 'in_progress',
    engagementTitle: 'FY26 Q3 Internal IT Audit',
    controlFamily: 'Access Control',
    controlId: 'AC-2',
    workpaperItems: [
      { id: 'w1', label: 'Obtain admin group membership extract', done: true },
      { id: 'w2', label: 'Select sample (n=25) per methodology', done: true },
      { id: 'w3', label: 'Test evidence of quarterly review', done: false },
      { id: 'w4', label: 'Document exceptions in CCCER', done: false },
    ],
    dcwfCode: '612',
    sortOrder: 1,
  },
  {
    id: 'aud-tkt-002',
    trackSlug: 'auditor',
    title: 'Change ticket completeness test',
    subtitle: 'WP-CM-03 · CAB samples',
    ticketType: 'audit_workpaper',
    difficulty: 'medium',
    slaMinutes: 1440,
    startedAt: null,
    status: 'new',
    engagementTitle: 'FY26 Q3 Internal IT Audit',
    controlFamily: 'Configuration Management',
    controlId: 'CM-3',
    workpaperItems: [
      { id: 'w1', label: 'Pull closed change tickets (period)', done: false },
      { id: 'w2', label: 'Verify approvals before deploy', done: false },
      { id: 'w3', label: 'Trace post-implementation review', done: false },
    ],
    dcwfCode: '612',
    sortOrder: 2,
  },
  {
    id: 'aud-tkt-003',
    trackSlug: 'auditor',
    title: 'Vendor SOC 2 bridge letter review',
    subtitle: 'WP-SA-01 · Cloud IdP',
    ticketType: 'audit_workpaper',
    difficulty: 'medium',
    slaMinutes: 2880,
    ...closedSlaFields(400, 120, 2880),
    status: 'resolved',
    engagementTitle: 'FY26 External Assurance Readiness',
    controlFamily: 'System and Services Acquisition',
    controlId: 'SA-9',
    workpaperItems: [
      { id: 'w1', label: 'Obtain current SOC 2 Type II', done: true },
      { id: 'w2', label: 'Map CUECs to internal controls', done: true },
      { id: 'w3', label: 'File bridge letter in workpapers', done: true },
    ],
    dcwfCode: '612',
    sortOrder: 3,
  },
  {
    id: 'aud-tkt-004',
    trackSlug: 'auditor',
    title: 'Logging retention walkthrough',
    subtitle: 'WP-AU-04 · SIEM',
    ticketType: 'audit_workpaper',
    difficulty: 'low',
    slaMinutes: 960,
    startedAt: null,
    status: 'new',
    engagementTitle: 'FY26 External Assurance Readiness',
    controlFamily: 'Audit and Accountability',
    controlId: 'AU-11',
    workpaperItems: [
      { id: 'w1', label: 'Confirm retention policy in SSP', done: false },
      { id: 'w2', label: 'Observe SIEM retention setting', done: false },
    ],
    dcwfCode: '612',
    sortOrder: 4,
  },

  // —— ISSO (operational steward — distinct from GRC assessor UI) ——
  {
    id: 'isso-tkt-001',
    trackSlug: 'isso',
    title: 'Collect AC-2 quarterly access review evidence',
    subtitle: 'Implementation task · due this week',
    ticketType: 'evidence_collection',
    difficulty: 'high',
    slaMinutes: 360,
    startedAt: startedMinutesAgo(80),
    status: 'in_progress',
    systemName: 'CASE-MGMT-PROD',
    controlId: 'AC-2',
    controlFamily: 'Access Control',
    severity: 'high',
    poamDueAt: '2026-08-14',
    dcwfCode: '722',
    sortOrder: 1,
  },
  {
    id: 'isso-tkt-002',
    trackSlug: 'isso',
    title: 'Close POA&M item — MFA for service accounts',
    subtitle: 'POA&M · milestone overdue',
    ticketType: 'poam',
    difficulty: 'critical',
    slaMinutes: 120,
    startedAt: startedMinutesAgo(110),
    status: 'in_progress',
    systemName: 'CASE-MGMT-PROD',
    controlId: 'IA-2',
    controlFamily: 'Identification and Authentication',
    severity: 'critical',
    poamDueAt: '2026-08-08',
    dcwfCode: '722',
    sortOrder: 2,
  },
  {
    id: 'isso-tkt-003',
    trackSlug: 'isso',
    title: 'Update SSP inheritance for shared SIEM',
    subtitle: 'ATO maintenance · documentation',
    ticketType: 'ssp_update',
    difficulty: 'medium',
    slaMinutes: 720,
    startedAt: null,
    status: 'new',
    systemName: 'PORTAL-WEB',
    controlId: 'AU-2',
    controlFamily: 'Audit and Accountability',
    severity: 'medium',
    poamDueAt: null,
    dcwfCode: '722',
    sortOrder: 3,
  },
  {
    id: 'isso-tkt-004',
    trackSlug: 'isso',
    title: 'Validate weekly vuln scan ConMon metric',
    subtitle: 'ConMon · RA-5',
    ticketType: 'conmon_metric',
    difficulty: 'medium',
    slaMinutes: 240,
    startedAt: startedMinutesAgo(20),
    status: 'in_progress',
    systemName: 'PORTAL-WEB',
    controlId: 'RA-5',
    controlFamily: 'Risk Assessment',
    severity: 'medium',
    poamDueAt: null,
    dcwfCode: '722',
    sortOrder: 4,
  },
  {
    id: 'isso-tkt-005',
    trackSlug: 'isso',
    title: 'Prepare incident notification package',
    subtitle: 'IR drill follow-up',
    ticketType: 'incident_notification',
    difficulty: 'high',
    slaMinutes: 90,
    startedAt: null,
    status: 'new',
    systemName: 'CASE-MGMT-PROD',
    controlId: 'IR-6',
    controlFamily: 'Incident Response',
    severity: 'high',
    poamDueAt: '2026-08-16',
    dcwfCode: '722',
    sortOrder: 5,
  },

  // —— ISSM (program oversight — distinct from ISSO ops) ——
  {
    id: 'issm-tkt-001',
    trackSlug: 'issm',
    title: 'Escalation: overdue POA&M on CASE-MGMT-PROD',
    subtitle: 'From ISSO · critical risk',
    ticketType: 'issm_escalation',
    difficulty: 'critical',
    slaMinutes: 60,
    startedAt: startedMinutesAgo(45),
    status: 'in_progress',
    systemName: 'CASE-MGMT-PROD',
    packageStage: 'Risk acceptance pending',
    severity: 'critical',
    poamDueAt: '2026-08-08',
    dcwfCode: '722',
    sortOrder: 1,
  },
  {
    id: 'issm-tkt-002',
    trackSlug: 'issm',
    title: 'Authorization package gate — PORTAL-WEB',
    subtitle: 'RMF Step 5 · AO package',
    ticketType: 'authorization_package',
    difficulty: 'high',
    slaMinutes: 1440,
    startedAt: startedMinutesAgo(300),
    status: 'in_progress',
    systemName: 'PORTAL-WEB',
    packageStage: 'Package assembly',
    severity: 'high',
    dcwfCode: '722',
    sortOrder: 2,
  },
  {
    id: 'issm-tkt-003',
    trackSlug: 'issm',
    title: 'Cross-system ConMon exception trend review',
    subtitle: 'Program metrics · monthly',
    ticketType: 'conmon_strategy',
    difficulty: 'medium',
    slaMinutes: 480,
    startedAt: null,
    status: 'new',
    systemName: 'PORTFOLIO',
    packageStage: 'Oversight',
    severity: 'medium',
    dcwfCode: '722',
    sortOrder: 3,
  },
  {
    id: 'issm-tkt-004',
    trackSlug: 'issm',
    title: 'Approve inheritance boundary change',
    subtitle: 'Common control provider update',
    ticketType: 'inheritance_review',
    difficulty: 'medium',
    slaMinutes: 360,
    startedAt: startedMinutesAgo(70),
    status: 'in_progress',
    systemName: 'SHARED-SIEM',
    packageStage: 'ISSM decision',
    severity: 'medium',
    dcwfCode: '722',
    sortOrder: 4,
  },
  {
    id: 'issm-tkt-005',
    trackSlug: 'issm',
    title: 'Resource conflict — assessor surge request',
    subtitle: 'Program staffing',
    ticketType: 'resource_request',
    difficulty: 'low',
    slaMinutes: 2880,
    startedAt: null,
    status: 'new',
    systemName: 'PORTFOLIO',
    packageStage: 'Planning',
    severity: 'low',
    dcwfCode: '722',
    sortOrder: 5,
  },
  {
    id: 'issm-tkt-006',
    trackSlug: 'issm',
    title: 'ATO continuous authorization decision memo',
    subtitle: 'Closed · archived',
    ticketType: 'ao_review',
    difficulty: 'high',
    slaMinutes: 720,
    ...closedSlaFields(900, 800, 720),
    status: 'reviewed',
    systemName: 'TRAINING-LMS',
    packageStage: 'Authorized',
    severity: 'low',
    dcwfCode: '722',
    sortOrder: 6,
  },
];

const TRACK_SLUG_ALIASES: Record<string, string[]> = {
  grc: ['grc', 'grc-fundamentals'],
  helpdesk: ['helpdesk', 'help-desk'],
  sysadmin: ['sysadmin', 'it-admin', 'it-admin-sysadmin'],
  auditor: ['auditor', 'it-auditor'],
  isso: ['isso'],
  issm: ['issm'],
};

export function getMockTicketsByTrack(trackSlug: string): MockTrackTicket[] {
  const normalized = trackSlug.trim().toLowerCase();
  const aliases = new Set(
    TRACK_SLUG_ALIASES[normalized] ??
      Object.values(TRACK_SLUG_ALIASES).find((list) =>
        list.includes(normalized)
      ) ?? [normalized]
  );

  return MOCK_TRACK_TICKETS.filter((t) => aliases.has(t.trackSlug)).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

/** Sysadmin NOC wall mock health tiles (not ticket rows). */
export const MOCK_NOC_SYSTEMS = [
  {
    id: 'noc-1',
    name: 'Identity (Entra)',
    hostname: 'id-p01.corp.local',
    status: 'healthy' as const,
    metric: '99.98% avail',
  },
  {
    id: 'noc-2',
    name: 'App DB cluster',
    hostname: 'app-db-03.corp.local',
    status: 'critical' as const,
    metric: 'Disk 93%',
  },
  {
    id: 'noc-3',
    name: 'Edge load balancers',
    hostname: 'lb-front-01.corp.local',
    status: 'degraded' as const,
    metric: 'Cert 9d',
  },
  {
    id: 'noc-4',
    name: 'Config management',
    hostname: 'cfg-mgmt.corp.local',
    status: 'degraded' as const,
    metric: 'Ansible fail',
  },
  {
    id: 'noc-5',
    name: 'Backup vault',
    hostname: 'bak-vault-02.corp.local',
    status: 'warning' as const,
    metric: 'RPO miss',
  },
  {
    id: 'noc-6',
    name: 'Core DNS',
    hostname: 'dns-core-01.corp.local',
    status: 'healthy' as const,
    metric: '12ms p95',
  },
];

/** ISSO systems under stewardship. */
export const MOCK_ISSO_SYSTEMS = [
  {
    id: 'sys-case',
    name: 'CASE-MGMT-PROD',
    atoStatus: 'ATO — continuous',
    openPoams: 3,
    conmon: 'Amber',
  },
  {
    id: 'sys-portal',
    name: 'PORTAL-WEB',
    atoStatus: 'ATO — annual',
    openPoams: 1,
    conmon: 'Green',
  },
  {
    id: 'sys-lms',
    name: 'TRAINING-LMS',
    atoStatus: 'Pending package',
    openPoams: 0,
    conmon: 'N/A',
  },
];

/** ISSM portfolio authorization board. */
export const MOCK_ISSM_PORTFOLIO = [
  {
    id: 'pf-case',
    name: 'CASE-MGMT-PROD',
    stage: 'Continuous ATO',
    risk: 'High',
    isso: 'J. Chen',
  },
  {
    id: 'pf-portal',
    name: 'PORTAL-WEB',
    stage: 'Package assembly',
    risk: 'Moderate',
    isso: 'A. Rivera',
  },
  {
    id: 'pf-siem',
    name: 'SHARED-SIEM',
    stage: 'Common control',
    risk: 'Low',
    isso: 'Shared',
  },
  {
    id: 'pf-lms',
    name: 'TRAINING-LMS',
    stage: 'Authorized',
    risk: 'Low',
    isso: 'M. Santos',
  },
];

export const MOCK_GRADING_QUEUE: MockGradingQueueItem[] = [
  {
    id: 'grade-001',
    studentName: 'Maria Santos',
    studentEmail: 'maria.santos@example.mil',
    lessonTitle: 'Draft AC-1 Policy Statement',
    trackName: 'GRC Fundamentals',
    aiFindingState: 'insufficient_evidence',
    reviewed: false,
  },
  {
    id: 'grade-002',
    studentName: 'David Kim',
    studentEmail: 'david.kim@example.mil',
    lessonTitle: 'Security Authorization Package Review',
    trackName: 'RMF Practitioner',
    aiFindingState: 'satisfied',
    reviewed: true,
  },
  {
    id: 'grade-003',
    studentName: 'Priya Patel',
    studentEmail: 'priya.patel@example.mil',
    lessonTitle: 'eMASS Control Assessment Workflow',
    trackName: 'GRC Fundamentals',
    aiFindingState: 'not_satisfied',
    reviewed: false,
  },
  {
    id: 'grade-004',
    studentName: 'James Wilson',
    studentEmail: 'james.wilson@example.mil',
    lessonTitle: 'Continuous Monitoring Strategy',
    trackName: 'GRC Fundamentals',
    aiFindingState: 'insufficient_evidence',
    reviewed: false,
  },
];

export const MOCK_ADMIN_LESSONS = MOCK_LESSONS.map((lesson) => ({
  id: lesson.id,
  title: lesson.title,
  trackName:
    MOCK_TRACKS.find((t) => t.slug === lesson.trackSlug)?.name ??
    lesson.trackSlug,
  tier: lesson.tier,
  lessonType: lesson.lessonType,
  sortOrder: lesson.sortOrder,
  published: true,
}));

export function getLessonsByTrack(trackSlug: string): MockLesson[] {
  return MOCK_LESSONS.filter((l) => l.trackSlug === trackSlug).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export function getLesson(
  trackSlug: string,
  lessonId: string
): MockLesson | undefined {
  return MOCK_LESSONS.find(
    (l) => l.trackSlug === trackSlug && l.id === lessonId
  );
}

export function getTrack(slug: string): MockTrack | undefined {
  return MOCK_TRACKS.find((t) => t.slug === slug);
}
