export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string = code,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);
export const badRequest = (message: string, code = 'bad_request') => new HttpError(400, code, message);
export const conflict = (message: string, code = 'conflict') => new HttpError(409, code, message);
export const forbidden = (message = 'Forbidden') => new HttpError(403, 'forbidden', message);
