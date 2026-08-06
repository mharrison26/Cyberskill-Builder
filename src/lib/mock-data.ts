import type {
  MockControl,
  MockFinding,
  MockGradingQueueItem,
  MockLesson,
  MockTrack,
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

export const MOCK_FINDINGS: MockFinding[] = [
  {
    id: 'finding-001',
    controlId: 'AC-1',
    findingState: 'satisfied',
    dcwfCode: 'RMF-002',
    narrative:
      'Access control policy is documented, approved by the AO, and disseminated to all system users. Annual review completed 2025-11-01.',
  },
  {
    id: 'finding-002',
    controlId: 'AC-2',
    findingState: 'insufficient_evidence',
    dcwfCode: 'RMF-002',
    narrative:
      'Account management procedures exist but evidence of quarterly access reviews for privileged accounts was not provided.',
  },
  {
    id: 'finding-003',
    controlId: 'AU-6',
    findingState: 'not_satisfied',
    dcwfCode: 'RMF-004',
    narrative:
      'Audit log review procedures are documented but no evidence of automated alerting for failed authentication attempts.',
  },
  {
    id: 'finding-004',
    controlId: 'CM-2',
    findingState: 'not_started',
    dcwfCode: 'RMF-003',
    narrative:
      'Baseline configuration documentation has not yet been submitted for assessor review.',
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
