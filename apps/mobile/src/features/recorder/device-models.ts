import type { CreateAssignmentInput } from '@aptly/contracts';

export type RecorderModel = CreateAssignmentInput['model'];

export const recorderModels: Record<RecorderModel, { name: string }> = {
  notepins: { name: 'Plaud NotePin S' },
  notepro: { name: 'Plaud Note Pro' },
};
