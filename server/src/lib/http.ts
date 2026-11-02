export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Please sign in to continue.') => new HttpError(401, msg, 'UNAUTHENTICATED');
export const forbidden = (msg = 'You do not have access to this resource.') => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Not found.') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg: string) => new HttpError(409, msg, 'CONFLICT');
export const unprocessable = (msg: string, details?: unknown) => new HttpError(422, msg, 'UNPROCESSABLE', details);

export function paginate(query: Record<string, unknown>, defaults = { pageSize: 24, max: 100 }) {
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(defaults.max, Math.max(1, Number.parseInt(String(query.pageSize ?? defaults.pageSize), 10) || defaults.pageSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
