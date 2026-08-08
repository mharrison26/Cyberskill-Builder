import { describe, expect, it } from 'vitest';

import {
  parseKbSourceTicketTypes,
  parseMinArticles,
} from '@/lib/helpdesk/compileKnowledgeBase';
import { DEFAULT_KB_SOURCE_TICKET_TYPES } from '@/lib/helpdesk/ticketCodes';

describe('parseKbSourceTicketTypes', () => {
  it('defaults to kb_writeup family', () => {
    expect(parseKbSourceTicketTypes({})).toEqual([
      ...DEFAULT_KB_SOURCE_TICKET_TYPES,
    ]);
  });

  it('honors sourceTicketTypes override', () => {
    expect(
      parseKbSourceTicketTypes({
        sourceTicketTypes: ['kb_writeup', 'helpdesk.knowledge_article'],
      })
    ).toEqual(['kb_writeup', 'knowledge_article']);
  });

  it('accepts GRC-style sourceArtifacts', () => {
    expect(
      parseKbSourceTicketTypes({
        sourceArtifacts: [
          {
            code: 'HD-03',
            ticketTypes: ['kb_writeup', 'resolution_writeup'],
            label: 'KB articles',
          },
        ],
      })
    ).toEqual(['kb_writeup', 'resolution_writeup']);
  });
});

describe('parseMinArticles', () => {
  it('defaults to 1 and honors expected_state', () => {
    expect(parseMinArticles({})).toBe(1);
    expect(parseMinArticles({ minArticles: 2 })).toBe(2);
    expect(parseMinArticles({}, { minArticles: 3 })).toBe(3);
  });
});
