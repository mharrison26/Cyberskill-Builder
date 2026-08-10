/**
 * Server-oriented feedback builders that resolve NIST control text from the
 * pinned OSCAL catalog (Node fs). Do not import this module from Client
 * Components — use `@/lib/feedback` / `@/lib/feedback/types` instead.
 */

export {
  buildChecklistOptionFeedback,
  buildChecklistTrainingFeedback,
  type ChecklistOptionInput,
} from '@/lib/feedback/buildChecklistFeedback';
export {
  controlCatalogHref,
  extractControlIdFromText,
  resolveControlLink,
} from '@/lib/feedback/controlLink';
