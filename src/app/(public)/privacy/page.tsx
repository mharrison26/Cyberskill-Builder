import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <div className="prose prose-sm mt-6 max-w-none text-muted-foreground">
        <p>
          CyberSkill Builder collects account information necessary to provide
          training services. Assessment artifacts submitted during lessons are
          stored for grading and portfolio purposes.
        </p>
        <p className="mt-4">
          This is placeholder legal content for the UI foundation. Replace with
          finalized policy language before production launch.
        </p>
      </div>
    </div>
  );
}
