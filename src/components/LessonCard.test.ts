import { describe, expect, it } from 'vitest';

import { lessonDetailHref } from '@/components/LessonCard';

describe('lessonDetailHref', () => {
  it('builds the track lesson detail path from slug + lesson id', () => {
    expect(
      lessonDetailHref('grc', '11111111-1111-1111-1111-111111111111')
    ).toBe('/tracks/grc/lessons/11111111-1111-1111-1111-111111111111');
  });
});
