/**
 * An error we expect and can explain to the user (validation failure, not
 * found, rule violation...). The error handler turns it into a JSON response:
 *   { "error": { "code": "...", "message": "...", "details": ... } }
 * Anything that is NOT an AppError is treated as a bug: the user gets a
 * generic message and the details only go to the server log.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'VALIDATION_FAILED', message, details);

export const unauthenticated = (message = 'Please sign in to continue.') =>
  new AppError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = "You don't have access to this.") =>
  new AppError(403, 'FORBIDDEN', message);

/** Also used for records that exist but belong to someone else, so we never reveal they exist. */
export const notFound = (message = "We couldn't find that.") =>
  new AppError(404, 'NOT_FOUND', message);

export const conflict = (code: string, message: string) => new AppError(409, code, message);

export const ruleViolation = (code: string, message: string, details?: unknown) =>
  new AppError(422, code, message, details);
