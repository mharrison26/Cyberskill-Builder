import { randomUUID } from 'node:crypto';

import {
  NIST_800_171_FRAMEWORK,
  NIST_800_171_REV3_SUBSET,
  SSP_RESPONSIBLE_ROLES,
  type ImplementationStatus,
  type Nist800171Requirement,
  type SspResponsibleRole,
} from '@/lib/oscal/nist800171Subset';

export type SspRequirementAnswer = {
  /** Human 800-171 id (03.01.01) or OSCAL control-id (r03.01.01). */
  requirementId: string;
  implementationStatus: ImplementationStatus;
  responsibleRoleId: string;
  implementationNarrative: string;
};

export type BuildSspFragmentOptions = {
  answers: SspRequirementAnswer[];
  requirements?: readonly Nist800171Requirement[];
  roles?: readonly SspResponsibleRole[];
  systemName?: string;
  title?: string;
  /** Inject for deterministic tests. Defaults to crypto.randomUUID. */
  uuid?: () => string;
  /** Fixed timestamp for tests (must include timezone, ISO-8601). */
  lastModified?: string;
};

export type OscalSspDocument = {
  'system-security-plan': Record<string, unknown>;
};

function requireRequirement(
  answer: SspRequirementAnswer,
  requirements: readonly Nist800171Requirement[]
): Nist800171Requirement {
  const key = answer.requirementId.trim().toLowerCase();
  const found = requirements.find(
    (req) =>
      req.id.toLowerCase() === key || req.oscalControlId.toLowerCase() === key
  );
  if (!found) {
    throw new Error(
      `Unknown NIST SP 800-171 requirement id: ${answer.requirementId}`
    );
  }
  return found;
}

/**
 * Compile student form answers into a minimal OSCAL SSP JSON document
 * that validates against the official OSCAL SSP JSON Schema (v1.1.2).
 */
export function buildSspFragment(
  options: BuildSspFragmentOptions
): OscalSspDocument {
  const uuid = options.uuid ?? randomUUID;
  const requirements = options.requirements ?? NIST_800_171_REV3_SUBSET;
  const roles = options.roles ?? SSP_RESPONSIBLE_ROLES;
  const lastModified = options.lastModified ?? new Date().toISOString();
  const systemName = options.systemName ?? 'Training Lab Information System';
  const title =
    options.title ??
    'Student SSP fragment — NIST SP 800-171 Rev 3 curated subset';

  if (!Array.isArray(options.answers) || options.answers.length === 0) {
    throw new Error('At least one requirement answer is required');
  }

  const componentUuid = uuid();
  const userUuid = uuid();

  const implementedRequirements = options.answers.map((answer) => {
    const requirement = requireRequirement(answer, requirements);
    const narrative = answer.implementationNarrative.trim();
    if (!narrative) {
      throw new Error(
        `Implementation narrative required for ${requirement.id}`
      );
    }

    return {
      uuid: uuid(),
      'control-id': requirement.oscalControlId,
      props: [
        { name: 'label', value: requirement.id },
        { name: 'framework', value: NIST_800_171_FRAMEWORK },
      ],
      'responsible-roles': [{ 'role-id': answer.responsibleRoleId }],
      'by-components': [
        {
          'component-uuid': componentUuid,
          uuid: uuid(),
          description: narrative,
          'implementation-status': {
            state: answer.implementationStatus,
          },
          'responsible-roles': [{ 'role-id': answer.responsibleRoleId }],
        },
      ],
    };
  });

  return {
    'system-security-plan': {
      uuid: uuid(),
      metadata: {
        title,
        'last-modified': lastModified,
        version: '1.0.0',
        'oscal-version': '1.1.2',
        roles: roles.map((role) => ({
          id: role.id,
          title: role.title,
        })),
      },
      'import-profile': {
        href: '#nist-sp-800-171-rev3-subset',
        remarks:
          'Training profile reference for the curated NIST SP 800-171 Rev 3 requirement subset.',
      },
      'system-characteristics': {
        'system-ids': [{ id: 'lab-ssp-demo' }],
        'system-name': systemName,
        description:
          'Minimal system characteristics scaffolding for student OSCAL SSP practice.',
        'system-information': {
          'information-types': [
            {
              title: 'Controlled Unclassified Information',
              description:
                'CUI processed, stored, or transmitted by the training lab system.',
            },
          ],
        },
        status: { state: 'operational' },
        'authorization-boundary': {
          description:
            'The authorization boundary includes the lab application and supporting identity services used in this exercise.',
        },
      },
      'system-implementation': {
        users: [
          {
            uuid: userUuid,
            title: 'Privileged Administrator',
            'role-ids': ['system-admin'],
          },
        ],
        components: [
          {
            uuid: componentUuid,
            type: 'this-system',
            title: systemName,
            description: 'Primary system component for the lab SSP fragment.',
            status: { state: 'operational' },
          },
        ],
      },
      'control-implementation': {
        description:
          'Implemented requirements for a curated NIST SP 800-171 Rev 3 subset, authored by the student.',
        'implemented-requirements': implementedRequirements,
      },
    },
  };
}
