import type { RetrievedBackupDrChecklist } from '@/lib/backup/getBackupDrChecklist';
import { formatRetrievedBackupDrChecklist } from '@/lib/backup/getBackupDrChecklist';

export type BackupDrPlanForGrading = {
  backupFrequency: string;
  retention: string;
  rpoTargets: string;
  rtoTargets: string;
  restoreTestingCadence: string;
  planNotes?: string;
  scenarioBrief?: string;
  businessContextText?: string;
};

/**
 * F26 RAG grading prompt: include ONLY retrieved backup/DR checklist text + student work.
 * The model must not rely on parametric knowledge of NIST, ISO, or vendor defaults.
 */
export function buildBackupDrPlanGradingPrompt(
  checklist: RetrievedBackupDrChecklist,
  submission: BackupDrPlanForGrading
): string {
  const checklistText = formatRetrievedBackupDrChecklist(checklist);

  const scenarioBlock = submission.scenarioBrief?.trim()
    ? `## Scenario brief (ticket context)

${submission.scenarioBrief.trim()}

`
    : '';

  const contextBlock = submission.businessContextText?.trim()
    ? `## Fictional business systems inventory (ticket context)

${submission.businessContextText.trim()}

`
    : '';

  const notesBlock = submission.planNotes?.trim()
    ? `**Overall plan notes**
${submission.planNotes.trim()}

`
    : '';

  return `You are evaluating a student's backup and disaster recovery (DR) plan against a pinned best-practices checklist ONLY.

Use only the retrieved checklist sections provided below. Do not rely on outside knowledge of NIST, ISO, CIS, or vendor product defaults beyond what the student wrote and the ticket context below.

Source document: ${checklist.document} — ${checklist.title}
Pinned path: ${checklist.catalogPath}

## Retrieved backup / DR checklist

${checklistText}

${scenarioBlock}${contextBlock}## Student backup / DR plan

**Backup frequency**
${submission.backupFrequency}

**Retention**
${submission.retention}

**RPO targets**
${submission.rpoTargets}

**RTO targets**
${submission.rtoTargets}

**Restore-testing cadence**
${submission.restoreTestingCadence}

${notesBlock}## Instructions

Evaluate whether the plan is defensible for the fictional small business based solely on the retrieved checklist above. Consider whether the student:
- sets backup frequency that matches change rate and criticality per major system;
- defines retention that supports recovery from delayed discovery / ransomware-style loss;
- states numeric RPO targets tied to backup cadence and business impact;
- states numeric RTO targets that are realistic for the restore method and system priority;
- includes a restore-testing cadence with success criteria (not backups-only);
- covers the inventoried systems (file server, SaaS CRM, on-prem DB, endpoints) when scope sections were retrieved.

Return structured JSON via the submit_grading tool with:
- finding_state: "satisfied", "insufficient_evidence", or "not_satisfied"
- feedback: concise overall assessment for the student
- strengths: specific strengths observed relative to the checklist
- gaps: specific gaps or weaknesses relative to the checklist (for example vague "regular backups", one RPO for all systems with no rationale, no restore tests)`;
}
