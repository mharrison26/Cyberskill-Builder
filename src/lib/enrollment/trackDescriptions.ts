const TRACK_DESCRIPTIONS: Record<string, string> = {
  grc: 'Governance, risk, and compliance training aligned to NIST SP 800-53 Rev. 5 and DoD RMF. Practice control assessment, evidence review, and CCCER finding documentation.',
  helpdesk:
    'IT service desk workflows — triage, SLA handling, directory actions, and escalation paths that mirror live helpdesk operations.',
  sysadmin:
    'IT admin / sysadmin operations — NOC monitoring, incident response, configuration, and host-level troubleshooting in a sandbox.',
  auditor:
    'IT audit engagements — workpaper procedures, sampling, evidence examination, and CCCER documentation across control families.',
  isso: 'Information System Security Officer track — day-to-day system stewardship, evidence collection, POA&M closure, and ConMon for systems you own.',
  issm: 'Information Systems Security Manager track — portfolio authorization oversight, ISSO escalations, and package decision gates.',
};

export function getTrackDescription(slug: string, name: string): string {
  return (
    TRACK_DESCRIPTIONS[slug] ??
    `Structured compliance training for the ${name} learning track.`
  );
}
