/** Only fixed, public-safe messages belong in this error. */
export class PlaudDeviceError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
