const TRACK_DESCRIPTIONS: Record<string, string> = {
  grc: 'Governance, risk, and compliance training aligned to NIST SP 800-53 Rev. 5 and DoD RMF. Practice control assessment, evidence review, and CCCER finding documentation.',
};

export function getTrackDescription(slug: string, name: string): string {
  return (
    TRACK_DESCRIPTIONS[slug] ??
    `Structured compliance training for the ${name} learning track.`
  );
}
