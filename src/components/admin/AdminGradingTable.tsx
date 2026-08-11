'use client';

import { GradingReviewForm } from '@/app/(app)/admin/grading/GradingReviewForm';
import { AdminRerunGradingButton } from '@/components/admin/AdminRerunGradingButton';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import type { AdminGradingRow } from '@/types';

const columns: DataTableColumn<AdminGradingRow>[] = [
  { key: 'studentEmail', header: 'Student', sortable: true },
  { key: 'lessonTitle', header: 'Lesson', sortable: true },
  { key: 'controlId', header: 'Control ID', sortable: true },
  {
    key: 'findingState',
    header: 'Finding',
    sortable: true,
    render: (row) => <StatusBadge status={row.findingState} />,
  },
  {
    key: 'aiFeedbackPreview',
    header: 'AI feedback',
    render: (row) =>
      row.aiFeedbackPreview ? (
        <span className="text-sm text-muted-foreground">
          {row.aiFeedbackPreview}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      ),
  },
  {
    key: 'submissionPreview',
    header: 'Submission',
    render: (row) =>
      row.submissionPreview ? (
        <span className="text-sm">{row.submissionPreview}</span>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      ),
  },
  {
    key: 'isReviewed',
    header: 'Reviewed',
    sortable: true,
    render: (row) => (
      <Badge
        variant="outline"
        className={
          row.isReviewed
            ? 'border-status-satisfied-foreground/20 bg-status-satisfied text-status-satisfied-foreground'
            : 'border-status-insufficient-foreground/20 bg-status-insufficient text-status-insufficient-foreground'
        }
      >
        {row.isReviewed ? 'Yes' : 'No'}
      </Badge>
    ),
  },
  {
    key: 'lessonId',
    header: 'Actions',
    render: (row) =>
      row.rowKind === 'pending_submission' && row.lessonId && row.studentId ? (
        <AdminRerunGradingButton
          lessonId={row.lessonId}
          studentId={row.studentId}
        />
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      ),
  },
];

type AdminGradingTableProps = {
  rows: AdminGradingRow[];
};

export function AdminGradingTable({ rows }: AdminGradingTableProps) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      searchKeys={[
        'studentEmail',
        'lessonTitle',
        'trackName',
        'controlId',
        'findingState',
      ]}
      searchPlaceholder="Search by student, lesson, or control…"
      expandable
      emptyMessage="No findings to review yet."
      renderExpanded={(row) => (
        <div className="grid gap-6 lg:grid-cols-2">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium text-muted-foreground">Track</dt>
              <dd>{row.trackName}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                Student submission
              </dt>
              <dd className="mt-1 whitespace-pre-wrap">
                {row.submissionFull || 'No submission text recorded.'}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">AI feedback</dt>
              <dd className="mt-1 whitespace-pre-wrap">
                {row.aiFeedback || 'No AI feedback yet.'}
              </dd>
            </div>
            {row.gradingError ? (
              <div>
                <dt className="font-medium text-muted-foreground">
                  Grading error
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-destructive">
                  {row.gradingError}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="rounded-lg border border-border bg-muted/20 p-4">
            {row.rowKind === 'pending_submission' ? (
              <div className="space-y-3 text-sm">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">
                    {row.gradingError
                      ? 'AI grading failed'
                      : 'Pending AI grading'}
                  </h3>
                  <p className="text-muted-foreground">
                    This free-text submission is saved on lesson progress but
                    does not have an OSCAL finding yet.
                    {row.gradingJobStatus
                      ? ` Job status: ${row.gradingJobStatus}.`
                      : ''}{' '}
                    Use <span className="font-medium">Re-run AI grading</span>{' '}
                    in the Actions column, or ask the student to retry.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <h3 className="mb-4 text-sm font-medium">Review finding</h3>
                <GradingReviewForm
                  findingId={row.id}
                  findingState={row.findingState}
                  feedback={row.aiFeedback}
                />
              </>
            )}
          </div>
        </div>
      )}
    />
  );
}
