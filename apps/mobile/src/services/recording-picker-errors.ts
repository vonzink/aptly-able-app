export const pickerCleanupWarning =
  'A temporary import copy could not be removed. Try importing again to retry cleanup.';

export class PickerCleanupError extends Error {
  readonly cleanupWarning = pickerCleanupWarning;
  constructor(cause: unknown) {
    super('The selected file could not be imported.', { cause });
  }
}

export function pickerFailureMessage(error: unknown, fallback: string): string {
  return error instanceof PickerCleanupError ? `${fallback} ${error.cleanupWarning}` : fallback;
}
