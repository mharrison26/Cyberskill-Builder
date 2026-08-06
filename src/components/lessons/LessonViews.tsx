import { CCCERForm } from '@/components/CCCERForm';
import { EvidenceCodeBlock } from '@/components/EvidenceCodeBlock';
import { StatusBadge } from '@/components/StatusBadge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { MockLesson } from '@/types';

function MarkdownContent({ content }: { content: string }) {
  const sections = content.split('\n\n');
  return (
    <div className="prose prose-sm max-w-none text-foreground">
      {sections.map((section, index) => {
        if (section.startsWith('## ')) {
          return (
            <h2 key={index} className="mt-6 text-lg font-semibold first:mt-0">
              {section.replace('## ', '')}
            </h2>
          );
        }
        if (section.startsWith('### ')) {
          return (
            <h3 key={index} className="mt-4 text-base font-semibold">
              {section.replace('### ', '')}
            </h3>
          );
        }
        const formatted = section
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/^- /gm, '• ');
        return (
          <p
            key={index}
            className="mt-3 leading-relaxed text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: formatted }}
          />
        );
      })}
    </div>
  );
}

export function ConceptualLessonView({ lesson }: { lesson: MockLesson }) {
  return (
    <article className="rounded-lg border border-border bg-card p-6">
      {lesson.content ? (
        <MarkdownContent content={lesson.content} />
      ) : (
        <p className="text-muted-foreground">No content available.</p>
      )}
    </article>
  );
}

export function ArtifactLabLessonView({ lesson }: { lesson: MockLesson }) {
  return (
    <div className="space-y-8">
      {lesson.evidenceJson ? (
        <EvidenceCodeBlock
          code={lesson.evidenceJson}
          language="json"
          title="OSCAL assessment result"
        />
      ) : null}
      <div className="rounded-lg border border-border bg-card p-6">
        <CCCERForm />
      </div>
    </div>
  );
}

export function ToolWalkthroughLessonView({ lesson }: { lesson: MockLesson }) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Evidence upload</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload screenshots or exports from the tool walkthrough. Accepted
          formats: PDF, PNG, JSON (mock — no file will be uploaded).
        </p>
        <div className="mt-4">
          <Label htmlFor="evidence-upload">Upload evidence</Label>
          <input
            id="evidence-upload"
            type="file"
            accept=".pdf,.png,.json"
            className="mt-2 block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-secondary/80"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Reflection</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe the steps you completed and any challenges encountered.
        </p>
        <div className="mt-4 space-y-2">
          <Label htmlFor="reflection">Your reflection</Label>
          <Textarea
            id="reflection"
            rows={5}
            placeholder="Document your tool walkthrough experience…"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>Lesson status:</span>
        <StatusBadge status={lesson.status} />
      </div>
    </div>
  );
}

export function LessonContentView({ lesson }: { lesson: MockLesson }) {
  switch (lesson.lessonType) {
    case 'conceptual':
      return <ConceptualLessonView lesson={lesson} />;
    case 'artifact_lab':
      return <ArtifactLabLessonView lesson={lesson} />;
    case 'tool_walkthrough':
      return <ToolWalkthroughLessonView lesson={lesson} />;
    default:
      return null;
  }
}
