import { z } from 'zod';

export const recorderModelSchema = z.enum(['notepro', 'notepins'], {
  error: 'Choose Plaud Note Pro or Plaud NotePin S.',
});
export type RecorderModel = z.infer<typeof recorderModelSchema>;

// Plaud's documented deviceType mapping for SDK serial signing:
// https://docs.plaud.ai/plaud-embedded/advanced-android-sdk#device-security
export const recorderModels = {
  notepro: { label: 'Plaud Note Pro', serialPrefix: '881' },
  notepins: { label: 'Plaud NotePin S', serialPrefix: '882' },
} as const satisfies Record<RecorderModel, { label: string; serialPrefix: string }>;

// Preserve the existing application format, including alphanumeric serials.
// This is not a vendor assertion that every recorder has a fixed serial length.
export const recorderSerialSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{2,60}[0-9]{4}$/, {
    error: 'Enter the complete serial number, including any letters, ending in four digits.',
  });

/** Used for new assignments and connection preflight, never to rewrite saved identities. */
export const recorderIdentitySchema = z
  .strictObject({ model: recorderModelSchema, serial: recorderSerialSchema })
  .superRefine(({ model, serial }, context) => {
    if (!recorderSerialSchema.safeParse(serial).success) return;
    if (serial.startsWith(recorderModels[model].serialPrefix)) return;
    const detected = Object.values(recorderModels).find(({ serialPrefix }) =>
      serial.startsWith(serialPrefix),
    );
    context.addIssue({
      code: 'custom',
      path: ['serial'],
      message: detected
        ? `This serial is for a ${detected.label}. Change the recorder model or check the serial number.`
        : 'This serial does not match a supported recorder. Note Pro serials start with 881; NotePin S serials start with 882.',
    });
  });
