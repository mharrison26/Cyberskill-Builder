import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Home',
  description:
    'Build audit-ready compliance skills with structured GRC and RMF training.',
};

const FEATURES = [
  {
    title: 'Structured learning tracks',
    description:
      'Progress through GRC and RMF curricula aligned to NIST SP 800-53 and DCWF work roles.',
  },
  {
    title: 'Evidence-based assessment',
    description:
      'Practice drafting CCCER findings against realistic OSCAL assessment artifacts.',
  },
  {
    title: 'Portfolio-ready outcomes',
    description:
      'Document control assessments and export findings for professional portfolios.',
  },
];

export default function LandingPage() {
  return (
    <div>
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Compliance training built for audit professionals
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              CyberSkill Builder provides structured GRC and RMF training for
              working professionals and DoD-adjacent students. Practice control
              assessment, evidence review, and finding documentation in a
              credible, audit-aligned environment.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up">
                <Button size="lg">Create account</Button>
              </Link>
              <Link href="/sign-in">
                <Button variant="outline" size="lg">
                  Sign in
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-xl font-semibold">Platform capabilities</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          A focused training environment — not gamified. Build the skills
          assessors and ISSOs use every day.
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <CardTitle className="text-base">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-secondary/50">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="text-lg font-semibold">Sample public portfolio</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            View how completed assessments appear in a shareable portfolio.
          </p>
          <Link
            href="/portfolio/alex-rivera"
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline focus:outline-none focus-visible:underline"
          >
            View Alex Rivera&apos;s portfolio →
          </Link>
        </div>
      </section>
    </div>
  );
}
