/**
 * Curated NIST SP 800-171 Rev 3 requirement subset for OSCAL SSP tickets.
 *
 * OSCAL `control-id` values must be TokenDatatype (start with a letter), so
 * numeric labels like `03.01.01` are stored as `label` props and mapped to
 * `r03.01.01` control ids (NIST-recommended pattern).
 */

export const NIST_800_171_FRAMEWORK = 'nist_sp_800_171_rev3' as const;

/** Minimum implementation narrative length for form + scorer checks. */
export const OSCAL_SSP_MIN_NARRATIVE_LENGTH = 20;

export const IMPLEMENTATION_STATUSES = [
  'implemented',
  'partial',
  'planned',
  'alternative',
  'not-applicable',
] as const;

export type ImplementationStatus = (typeof IMPLEMENTATION_STATUSES)[number];

export type SspResponsibleRole = {
  id: string;
  title: string;
};

/** Roles offered in the SSP form / emitted into metadata.roles. */
export const SSP_RESPONSIBLE_ROLES: readonly SspResponsibleRole[] = [
  { id: 'system-owner', title: 'System Owner' },
  { id: 'isso', title: 'Information System Security Officer' },
  { id: 'system-admin', title: 'System Administrator' },
  { id: 'authorizing-official', title: 'Authorizing Official' },
] as const;

export type Nist800171Requirement = {
  /** Human-facing 800-171 Rev 3 requirement label (e.g. 03.01.01). */
  id: string;
  /** OSCAL-safe control-id token (e.g. r03.01.01). */
  oscalControlId: string;
  family: string;
  title: string;
  statement: string;
};

export const NIST_800_171_REV3_SUBSET: readonly Nist800171Requirement[] = [
  {
    id: '03.01.01',
    oscalControlId: 'r03.01.01',
    family: 'Access Control',
    title: 'Account Management',
    statement:
      'Define and document the types of system accounts required for the system and manage system accounts, including establishing, activating, modifying, disabling, and removing accounts.',
  },
  {
    id: '03.01.02',
    oscalControlId: 'r03.01.02',
    family: 'Access Control',
    title: 'Access Enforcement',
    statement:
      'Enforce approved authorizations for logical access to CUI in accordance with applicable access control policies.',
  },
  {
    id: '03.05.01',
    oscalControlId: 'r03.05.01',
    family: 'Identification and Authentication',
    title: 'User Identification and Authentication',
    statement:
      'Uniquely identify and authenticate system users and associate that unique identification with processes acting on behalf of those users.',
  },
  {
    id: '03.11.01',
    oscalControlId: 'r03.11.01',
    family: 'Risk Assessment',
    title: 'Risk Assessment',
    statement:
      'Periodically assess the risk to organizational operations, organizational assets, and individuals resulting from the operation of the system and the processing, storage, or transmission of CUI.',
  },
  {
    id: '03.14.01',
    oscalControlId: 'r03.14.01',
    family: 'System and Information Integrity',
    title: 'Flaw Remediation',
    statement:
      'Identify, report, and correct system flaws in a timely manner and install security-relevant software and firmware updates.',
  },
] as const;

export function isImplementationStatus(
  value: unknown
): value is ImplementationStatus {
  return (
    typeof value === 'string' &&
    (IMPLEMENTATION_STATUSES as readonly string[]).includes(value)
  );
}

export function isKnownResponsibleRoleId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    SSP_RESPONSIBLE_ROLES.some((role) => role.id === value)
  );
}

/** Map a human 800-171 id or OSCAL control-id to the curated requirement. */
export function findSubsetRequirement(
  id: string,
  requirements: readonly Nist800171Requirement[] = NIST_800_171_REV3_SUBSET
): Nist800171Requirement | undefined {
  const key = id.trim().toLowerCase();
  return requirements.find(
    (req) =>
      req.id.toLowerCase() === key || req.oscalControlId.toLowerCase() === key
  );
}
