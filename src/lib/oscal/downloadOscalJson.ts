import {
  toAssessmentFinding,
  type OscalFindingRow,
} from './toAssessmentFinding';

export function downloadOscalJson(finding: OscalFindingRow): void {
  const payload = toAssessmentFinding(finding);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${finding.control_id}-finding.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
