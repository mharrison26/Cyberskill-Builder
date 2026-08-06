export type ProgressStatus =
  'satisfied' | 'insufficient_evidence' | 'not_satisfied' | 'not_started';

export type FindingState =
  'satisfied' | 'insufficient_evidence' | 'not_satisfied' | 'not_started';

export type LessonType =
  'conceptual' | 'catalog_lab' | 'artifact_lab' | 'tool_walkthrough';

export type LessonTier = 'foundation' | 'intermediate' | 'advanced';

export interface Lesson {
  id: string;
  track_id: string;
  tier: LessonTier | string;
  lesson_type: LessonType;
  sort_order: number;
  title: string;
  learning_objectives: string | null;
  dcwf_code: string | null;
}

export interface MockUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
}

export interface MockTrack {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export interface MockLesson {
  id: string;
  trackSlug: string;
  tier: LessonTier;
  lessonType: LessonType;
  sortOrder: number;
  title: string;
  learningObjectives: string[];
  dcwfCode: string;
  status: ProgressStatus;
  content?: string;
  evidenceJson?: string;
}

export interface MockControl {
  id: string;
  family: string;
  title: string;
  statement: string;
}

export interface MockFinding {
  id: string;
  controlId: string;
  findingState: FindingState;
  dcwfCode: string;
  narrative: string;
}

export interface MockGradingQueueItem {
  id: string;
  studentName: string;
  studentEmail: string;
  lessonTitle: string;
  trackName: string;
  aiFindingState: FindingState;
  reviewed: boolean;
}

export interface CCCERValues {
  condition: string;
  criteria: string;
  cause: string;
  effect: string;
  recommendation: string;
}
