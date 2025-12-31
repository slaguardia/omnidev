/**
 * Shared API response helpers for consistent error handling and responses
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Create a standardized 500 internal server error response
 */
export function serverError(error: unknown, message = 'Internal server error'): NextResponse {
  return NextResponse.json(
    {
      error: message,
      details: getErrorMessage(error),
    },
    { status: 500 }
  );
}

/**
 * Create a standardized 400 bad request error response
 */
export function badRequest(message: string, details?: string): NextResponse {
  const body: { error: string; details?: string } = { error: message };
  if (details !== undefined) {
    body.details = details;
  }
  return NextResponse.json(body, { status: 400 });
}

/**
 * Create a standardized 404 not found error response
 */
export function notFound(message: string, details?: string): NextResponse {
  const body: { error: string; details?: string } = { error: message };
  if (details !== undefined) {
    body.details = details;
  }
  return NextResponse.json(body, { status: 404 });
}

/**
 * Create a standardized 503 service unavailable error response
 */
export function serviceUnavailable(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 503 });
}

/**
 * Create a standardized 409 conflict error response
 */
export function conflict(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 });
}

/**
 * Parse JSON request body with standardized error handling
 * Returns the parsed body or a bad request response
 */
export async function parseJsonBody<T = unknown>(
  request: NextRequest,
  logPrefix?: string
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  try {
    const body = await request.json();
    return { success: true, data: body as T };
  } catch (error) {
    if (logPrefix) {
      console.error(`[${logPrefix}] Failed to parse request body:`, error);
    }
    return {
      success: false,
      response: badRequest('Invalid request body'),
    };
  }
}

/**
 * Request timer for tracking API request duration
 */
export interface RequestTimer {
  /** Get elapsed time in milliseconds */
  elapsed: () => number;
  /** Log completion message with elapsed time */
  logComplete: () => void;
  /** Log failure message with elapsed time and error */
  logError: (error: unknown) => void;
}

/**
 * Create a request timer for consistent timing and logging
 */
export function createRequestTimer(logPrefix: string): RequestTimer {
  const startTime = Date.now();
  console.log(`[${logPrefix}] Request started at ${new Date().toISOString()}`);

  return {
    elapsed: () => Date.now() - startTime,
    logComplete: () => {
      const totalTime = Date.now() - startTime;
      console.log(`[${logPrefix}] Completed in ${totalTime}ms`);
    },
    logError: (error: unknown) => {
      const totalTime = Date.now() - startTime;
      console.error(`[${logPrefix}] Failed after ${totalTime}ms:`, {
        error: getErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
    },
  };
}
