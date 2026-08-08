import { describe, expect, it } from 'vitest';

import { buildCustomerReplyGradingPrompt } from '@/lib/grading/buildCustomerReplyGradingPrompt';
import { retrieveCustomerCommunicationRubric } from '@/lib/helpdesk/getCustomerCommunicationRubric';

describe('buildCustomerReplyGradingPrompt', () => {
  it('includes retrieved rubric text and forbids parametric knowledge', () => {
    const rubric = retrieveCustomerCommunicationRubric(
      'acknowledge frustration next steps plain language professional tone'
    );
    const prompt = buildCustomerReplyGradingPrompt(rubric, {
      reply:
        "I'm sorry this has been frustrating. I will unlock your account within 15 minutes and email a reset link.",
      customerEmailSubject: 'Still locked out!',
      customerEmailBody: 'Fix this NOW after three days.',
      scenarioBrief: 'De-escalate an angry lockout email.',
    });

    expect(prompt).toContain('Use only the retrieved rubric sections');
    expect(prompt).toContain('Do not rely on outside knowledge');
    expect(prompt).toContain('Pinned path:');
    expect(prompt).toContain('### acknowledge-frustration');
    expect(prompt).toContain('### state-next-steps');
    expect(prompt).toContain('Still locked out!');
    expect(prompt).toContain('Fix this NOW after three days.');
    expect(prompt).toContain('De-escalate an angry lockout email.');
    expect(prompt).toContain('unlock your account within 15 minutes');
  });
});
