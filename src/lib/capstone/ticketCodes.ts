/**
 * GRC track ticket codes for the authorization-package capstone.
 *
 * Prefer `ticket_type` (and optional `initial_state.ticketCode`) over title matching.
 * Sibling features should align with these codes / types when they land.
 *
 * | Code   | ticket_type(s)              | Artifact                         |
 * |--------|-----------------------------|----------------------------------|
 * | GRC-03 | oscal_ssp                   | OSCAL SSP fragment (form ticket) |
 * | GRC-04 | poam, poam_draft            | POA&M entries (`poam_items`)     |
 * | GRC-09 | oscal_generator, capstone_oscal | Generated OSCAL via WebContainer |
 * | GRC-10 | authorization_package       | Compiled package view            |
 * | GRC-11 | ao_review                   | AO risk-acceptance Q&A           |
 */

export const GRC_TICKET_CODES = {
  SSP: 'GRC-03',
  POAM: 'GRC-04',
  OSCAL_GENERATOR: 'GRC-09',
  AUTHORIZATION_PACKAGE: 'GRC-10',
  AO_REVIEW: 'GRC-11',
} as const;

export type GrcTicketCode =
  (typeof GRC_TICKET_CODES)[keyof typeof GRC_TICKET_CODES];

/** Canonical ticket_type values (bare or track-prefixed `grc.*`). */
export const GRC_TICKET_TYPES = {
  SSP: 'oscal_ssp',
  POAM: 'poam',
  POAM_DRAFT: 'poam_draft',
  OSCAL_GENERATOR: 'oscal_generator',
  /** Alias used by the WebContainer OSCAL generator capstone. */
  CAPSTONE_OSCAL: 'capstone_oscal',
  AUTHORIZATION_PACKAGE: 'authorization_package',
  AO_REVIEW: 'ao_review',
} as const;

export type CapstoneSourceArtifactDef = {
  code: GrcTicketCode;
  /** Matching ticket_type bases (after stripping track prefix). */
  ticketTypes: readonly string[];
  label: string;
  /** Optional table supplement (e.g. poam_items). */
  table?: 'poam_items';
};

/** Default sources compiled into the GRC-10 package / GRC-11 AO review. */
export const DEFAULT_CAPSTONE_SOURCE_ARTIFACTS: readonly CapstoneSourceArtifactDef[] =
  [
    {
      code: GRC_TICKET_CODES.SSP,
      ticketTypes: [GRC_TICKET_TYPES.SSP],
      label: 'SSP fragment (OSCAL)',
    },
    {
      code: GRC_TICKET_CODES.POAM,
      ticketTypes: [GRC_TICKET_TYPES.POAM, GRC_TICKET_TYPES.POAM_DRAFT],
      label: 'POA&M entries',
      table: 'poam_items',
    },
    {
      code: GRC_TICKET_CODES.OSCAL_GENERATOR,
      ticketTypes: [
        GRC_TICKET_TYPES.OSCAL_GENERATOR,
        GRC_TICKET_TYPES.CAPSTONE_OSCAL,
      ],
      label: 'OSCAL generator artifacts',
    },
  ] as const;

export function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isAuthorizationPackageTicketType(ticketType: string): boolean {
  return ticketTypeBase(ticketType) === GRC_TICKET_TYPES.AUTHORIZATION_PACKAGE;
}

export function isAoReviewTicketType(ticketType: string): boolean {
  return ticketTypeBase(ticketType) === GRC_TICKET_TYPES.AO_REVIEW;
}

export function isOscalSspTicketType(ticketType: string): boolean {
  return ticketTypeBase(ticketType) === GRC_TICKET_TYPES.SSP;
}

export function isOscalGeneratorTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === GRC_TICKET_TYPES.OSCAL_GENERATOR ||
    base === GRC_TICKET_TYPES.CAPSTONE_OSCAL
  );
}
