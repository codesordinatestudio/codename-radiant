// Radiant - Error Classes & Helpers
// Version: 0.0.4

// ============================================================================
// RadiantError
// ============================================================================

export class RadiantError extends Error {
  public code: string;
  public status: number;

  constructor(message: string, code: string = "INTERNAL_ERROR", status: number = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
    };
  }

  static BadRequest = (message = "Bad request") => new RadiantError(message, "BAD_REQUEST", 400);
  static Unauthorized = (message = "Unauthorized") => new RadiantError(message, "UNAUTHORIZED", 401);
  static NotImplemented = (message = "Not implemented") => new RadiantError(message, "NOT_IMPLEMENTED", 501);
  static NotConfigured = (message = "Not configured") => new RadiantError(message, "NOT_CONFIGURED", 428);
  static Forbidden = (message = "Forbidden") => new RadiantError(message, "FORBIDDEN", 403);
  static NotFound = (message = "Not found") => new RadiantError(message, "NOT_FOUND", 404);
  static Conflict = (message = "Conflict") => new RadiantError(message, "CONFLICT", 409);
  static TooManyRequests = (message = "Too many requests") => new RadiantError(message, "TOO_MANY_REQUESTS", 429);
  static SubscriptionRequired = (message = "Subscription required") =>
    new RadiantError(message, "SUBSCRIPTION_REQUIRED", 402);
  static Internal = (message = "An unexpected error occurred. Please try again later.") =>
    new RadiantError(message, "INTERNAL_ERROR", 500);
}

// ============================================================================
// Error Response Types
// ============================================================================

export interface RadiantErrorResponse {
  code: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path?: string;
}

// ============================================================================
// Database Constraint Error Parsing
// ============================================================================

import type { ConstraintType, ParsedConstraintError, RadiantAdapter } from "../../core";

/**
 * Parse a database constraint error message and extract structured information.
 * Relies on the provided database adapter to parse its specific errors.
 */
export function parseConstraintError(error: unknown, adapter?: RadiantAdapter): ParsedConstraintError | null {
  if (adapter?.parseConstraintError) {
    return adapter.parseConstraintError(error);
  }
  return null;
}


/**
 * Get a user-friendly message for a parsed constraint error.
 */
export function getConstraintErrorMessage(parsed: ParsedConstraintError): string {
  switch (parsed.type) {
    case "foreign_key":
      if (parsed.referencedTable) {
        return `The value "${parsed.column}" references a non-existent record in "${parsed.referencedTable}". Please ensure the referenced record exists.`;
      }
      return "This operation violates a foreign key constraint. The referenced record does not exist.";

    case "unique":
      if (parsed.column) {
        return `A record with this "${parsed.column}" value already exists. Please use a different value.`;
      }
      return "A record with this value already exists. Please use a different value.";

    case "not_null":
      return `The field "${parsed.column}" is required and cannot be empty.`;

    case "check":
      return `The value violates a validation rule (constraint: ${parsed.constraint}).`;

    case "exclusion":
      return "This value conflicts with an existing record.";

    default:
      return parsed.rawMessage;
  }
}

/**
 * Get the appropriate HTTP status code for a constraint error type.
 */
export function getConstraintErrorStatus(type: ConstraintType): number {
  switch (type) {
    case "foreign_key":
    case "unique":
    case "check":
    case "exclusion":
      return 409; // Conflict
    case "not_null":
      return 400; // Bad Request
    default:
      return 500;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract pathname from a URL string without allocating a URL object.
 */
function extractPathname(urlStr: string): string {
  const protocolIdx = urlStr.indexOf("://");
  const rootIdx = protocolIdx !== -1 ? urlStr.indexOf("/", protocolIdx + 3) : 0;
  const qIdx = urlStr.indexOf("?", rootIdx !== -1 ? rootIdx : 0);
  if (rootIdx === -1) return "/";
  return (qIdx === -1 ? urlStr.substring(rootIdx) : urlStr.substring(rootIdx, qIdx)) || "/";
}

/**
 * Build a structured error response body from any thrown value.
 * - RadiantError → uses its code/status/message directly.
 * - Plain Error  → exposes message only in development (hides internals in production).
 * - Database constraint errors → parsed and converted to user-friendly messages.
 * - Unknown      → generic 500 message.
 */
export function buildErrorResponse(error: unknown, request?: Request, adapter?: RadiantAdapter): RadiantErrorResponse {
  const timestamp = new Date().toISOString();
  const path = request ? extractPathname(request.url) : undefined;

  let statusCode = 500;
  let code = "INTERNAL_ERROR";
  let message = "An unexpected error occurred. Please try again later.";

  if (error instanceof RadiantError) {
    statusCode = error.status;
    code = error.code;
    message = error.message;
  } else if (error instanceof Error) {
    // Check for database constraint errors first using the adapter
    const parsedConstraint = adapter ? parseConstraintError(error, adapter) : null;
    if (parsedConstraint) {
      statusCode = getConstraintErrorStatus(parsedConstraint.type);
      code = `CONSTRAINT_${parsedConstraint.type.toUpperCase()}`;
      // Use user-friendly message, but include raw message in dev mode
      message = getConstraintErrorMessage(parsedConstraint);
      if (process.env.NODE_ENV !== "production") {
        message += ` (${parsedConstraint.rawMessage})`;
      }
    } else {
      // Only expose raw error details outside of production
      if (process.env.NODE_ENV !== "production") {
        message = error.message;
      }
    }
  }

  return { code, message, statusCode, timestamp, ...(path ? { path } : {}) };
}

/**
 * Convert any thrown value to a JSON `Response` with the correct HTTP status.
 */
export function toErrorResponse(error: unknown, request?: Request, adapter?: RadiantAdapter): Response {
  const body = buildErrorResponse(error, request, adapter);
  return new Response(JSON.stringify(body), {
    status: body.statusCode,
    headers: { "Content-Type": "application/json" },
  });
}
