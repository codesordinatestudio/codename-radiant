export class RadiantError extends Error {
  constructor(
    public override message: string,
    public code: string = "INTERNAL_ERROR",
    public status: number = 500,
  ) {
    super(message);
    this.name = "RadiantError";
  }

  static BadRequest(message: string): RadiantError {
    return new RadiantError(message, "BAD_REQUEST", 400);
  }

  static Unauthorized(message: string = "Unauthorized"): RadiantError {
    return new RadiantError(message, "UNAUTHORIZED", 401);
  }

  static Forbidden(message: string = "Forbidden"): RadiantError {
    return new RadiantError(message, "FORBIDDEN", 403);
  }

  static NotFound(message: string = "Not found"): RadiantError {
    return new RadiantError(message, "NOT_FOUND", 404);
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
    };
  }
}
