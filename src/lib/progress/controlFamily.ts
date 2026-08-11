/**
 * Derive NIST SP 800-53 control family from a control id.
 * Examples: AC-2 → AC, ia-5.1 → IA, AC-2(1) → AC, CC6.1 → CC (SOC2-ish).
 */
export function controlFamilyFromId(
  controlId: string | null | undefined
): string | null {
  if (!controlId) return null;
  const trimmed = controlId.trim().toUpperCase();
  if (!trimmed) return null;

  const nist = trimmed.match(/^([A-Z]{2})\s*[-_]/);
  if (nist) return nist[1];

  const dotted = trimmed.match(/^([A-Z]{2})\./);
  if (dotted) return dotted[1];

  const soc = trimmed.match(/^(CC|A|C|PI|P)\d/i);
  if (soc) return soc[1].toUpperCase();

  return null;
}

export function familySkillKey(family: string): string {
  return `family:${family.toUpperCase()}`;
}

export function dcwfSkillKey(code: string): string {
  return `dcwf:${code.trim()}`;
}

export function familyLabel(family: string): string {
  const labels: Record<string, string> = {
    AC: 'Access Control',
    AT: 'Awareness & Training',
    AU: 'Audit & Accountability',
    CA: 'Assessment & Authorization',
    CM: 'Configuration Management',
    CP: 'Contingency Planning',
    IA: 'Identification & Authentication',
    IR: 'Incident Response',
    MA: 'Maintenance',
    MP: 'Media Protection',
    PE: 'Physical & Environmental',
    PL: 'Planning',
    PM: 'Program Management',
    PS: 'Personnel Security',
    PT: 'PII Processing & Transparency',
    RA: 'Risk Assessment',
    SA: 'System & Services Acquisition',
    SC: 'System & Communications Protection',
    SI: 'System & Information Integrity',
    SR: 'Supply Chain Risk Management',
    CC: 'SOC 2 Common Criteria',
  };
  const key = family.toUpperCase();
  return labels[key] ?? `${key} family`;
}
