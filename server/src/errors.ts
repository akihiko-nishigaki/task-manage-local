// API エラー表現。ハンドラ内から throw し、中央のエラーハンドラが JSON 化する。

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const validationError = (message: string): HttpError => new HttpError(400, 'validation', message);
export const notFoundError = (message: string): HttpError => new HttpError(404, 'not_found', message);
export const conflictError = (message: string): HttpError => new HttpError(409, 'conflict', message);
