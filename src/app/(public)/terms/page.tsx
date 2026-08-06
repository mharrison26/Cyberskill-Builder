import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Terms of Service</h1>
      <div className="prose prose-sm mt-6 max-w-none text-muted-foreground">
        <p>
          By using CyberSkill Builder, you agree to use the platform for
          authorized training purposes only. Simulated environments must not
          contain classified or sensitive operational data.
        </p>
        <p className="mt-4">
          This is placeholder legal content for the UI foundation. Replace with
          finalized terms before production launch.
        </p>
      </div>
    </div>
  );
}
