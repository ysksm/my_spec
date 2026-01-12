import { Context, Next } from 'hono';
import { SSHToolError } from '@ssh-tool/core';

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    console.error('Error:', error);

    if (error instanceof SSHToolError) {
      return c.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        500
      );
    }

    if (error instanceof Error) {
      return c.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: error.message,
          },
        },
        500
      );
    }

    return c.json(
      {
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'An unknown error occurred',
        },
      },
      500
    );
  }
}
