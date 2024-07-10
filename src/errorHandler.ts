import { Request, Response, NextFunction } from 'express';

interface ErrorWithStatus extends Error {
  status?: number;
}

export async function openAiErrorHandler(err: ErrorWithStatus, req: Request, res: Response) {
  const status = err.status || 500;
  const message = err.message || 'Something went wrong';

  let errorType: string;
  switch (status) {
    case 400:
      errorType = 'invalid_request_error';
      break;
    case 401:
      errorType = 'authentication_error';
      break;
    case 403:
      errorType = 'permission_error';
      break;
    case 404:
      errorType = 'not_found_error';
      break;
    case 429:
      errorType = 'rate_limit_error';
      break;
    default: // 500 by default
      errorType = 'server_error';
  }

  console.error({
    message,
    errorType,
    statusCode: status,
    endpoint: req.originalUrl,
    method: req.method,
    params: req.params,
    query: req.query,
    body: req.body,
    headers: req.headers,
    stack: err.stack
  });

  return res.status(status).json({
    error: {
      message: message,
      type: errorType,
      param: null,
      code: null
    }
  });
}

export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
