# The Config Block

The `config {}` block defines framework-wide settings: API configuration, security policies, monitoring, admin UI, database migration behaviour, and output directory. It appears once across all `.radiant` files.

## Syntax

```radiant
config {
  // Top-level keys (each is optional):
  core: { ... }
  security: { ... }
  monitoring: { ... }
  adminUI: { ... }
  apiPrefix: "..."
  migrate: { ... }
  output: "..."
}
```

## Allowed Keys

Only these top-level keys are valid inside `config {}`. Unknown keys produce a compile-time error:

| Key | Type | Description |
|---|---|---|
| `core` | Object | Core framework settings (API, OpenAPI, uploads). |
| `security` | Object | Authentication, CORS, rate limiting, headers, secrets, audit. |
| `monitoring` | Object | Health checks, request ID tracking. |
| `adminUI` | Object | Admin dashboard configuration. |
| `apiPrefix` | String | Shorthand for `core.api.prefix`. |
| `migrate` | Object | Database migration behaviour. |
| `output` | String | Output directory for generated files (relative to `radiant/`). |

## `core`

Core framework settings. Allowed keys: `api`, `openapi`, `upload`.

### `api`

```radiant
config {
  core: {
    api: {
      prefix: "/api"          // API route prefix
      maxBodyBytes: 1048576   // Max request body size in bytes
      trustedProxies: ["127.0.0.1"]  // Trusted proxy IPs
    }
  }
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `prefix` | String | `"/api"` | Prefix for all generated API routes. |
| `maxBodyBytes` | Number | `1048576` (1MB) | Maximum request body size. |
| `trustedProxies` | String[] | `[]` | IP addresses of trusted proxies for header forwarding. |

### `openapi`

```radiant
config {
  core: {
    openapi: {
      enabled: true
      path: "/api/docs"
    }
  }
}
```

When enabled, the runtime serves an OpenAPI/Swagger specification at the configured path.

### `upload`

```radiant
config {
  core: {
    upload: {
      maxFileSize: 10485760  // 10MB
      allowedTypes: ["image/png", "image/jpeg"]
    }
  }
}
```

## `security`

Security policies. Allowed keys: `auth`, `cors`, `rateLimit`, `headers`, `secrets`, `audit`, `csrfTrustedOrigins`.

### `auth`

```radiant
config {
  security: {
    auth: {
      strategies: ["jwt", "session"]
      jwt: {
        accessTokenExpiry: env("JWT_EXPIRY", "15m")
        refreshTokenExpiry: "7d"
        cookies: {
          enabled: true
        }
      }
      passwordPolicy: {
        minLength: 8
        requireUppercase: true
        requireNumber: true
      }
      lockout: {
        maxAttempts: env("LOGIN_ATTEMPTS", 5)
        durationMinutes: 15
      }
    }
  }
}
```

| Sub-property | Type | Description |
|---|---|---|
| `strategies` | String[] | Auth strategies to enable: `"jwt"`, `"session"`, `"apiKey"`. |
| `jwt` | Object | JWT settings: `accessTokenExpiry`, `refreshTokenExpiry`, `cookies`. |
| `session` | Object | Session-based auth settings. |
| `apiKey` | Object | API key auth settings: `header` (header name, defaults to `X-API-Key`), `enabled`. |
| `passwordPolicy` | Object | `minLength`, `requireUppercase`, `requireNumber`. |
| `lockout` | Object | `maxAttempts`, `durationMinutes` — lock accounts after repeated failures. |

### `cors`

```radiant
config {
  security: {
    cors: {
      origin: ["http://localhost:3000", "https://myapp.com"]
      credentials: true
    }
  }
}
```

| Property | Type | Description |
|---|---|---|
| `origin` | String[] | Allowed origin URLs. |
| `credentials` | Boolean | Whether to allow credentials (cookies, Authorization headers). |

### `rateLimit`

```radiant
config {
  security: {
    rateLimit: {
      write: {
        max: 100
        window: "15m"
      }
      login: {
        max: 5
        window: "15m"
      }
    }
  }
}
```

| Property | Type | Description |
|---|---|---|
| `write` | Object | Rate limit for write operations (POST, PUT, DELETE). `max` requests per `window`. |
| `login` | Object | Rate limit for login attempts. `max` attempts per `window`. |
| `max` | Number | Maximum number of requests in the window. |
| `window` | String | Time window (e.g., `"15m"`, `"1h"`, `"30s"`). |

### `headers`

```radiant
config {
  security: {
    headers: {
      enabled: true
    }
  }
}
```

When enabled, the runtime adds the following security headers to every response:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |

### `secrets`

```radiant
config {
  security: {
    secrets: {
      enabled: true
    }
  }
}
```

When enabled, the runtime provides a secret management API for storing and retrieving encrypted values.

### `audit`

```radiant
config {
  security: {
    audit: {
      enabled: true
    }
  }
}
```

When enabled, the runtime auto-creates a `radiant_audit_log` collection and logs all data mutations with HMAC-signed entries for tamper detection.

### `csrfTrustedOrigins`

```radiant
config {
  security: {
    csrfTrustedOrigins: ["https://myapp.com", "https://admin.myapp.com"]
  }
}
```

| Property | Type | Description |
|---|---|---|
| `csrfTrustedOrigins` | String[] | Origins allowed to make cookie-authenticated state-changing requests, bypassing same-origin CSRF checks. |

The runtime's CSRF guard activates on state-changing methods (POST, PUT, PATCH, DELETE) when a cookie is present. It checks the `Origin` or `Referer` header against the request `Host`. If the origin doesn't match, the request is rejected with `403 CSRF_ERROR` — unless the origin is listed in `csrfTrustedOrigins`. Requests carrying a custom header (`X-RADIANT-CSRF`, `X-CSRF-Token`, or `X-Requested-With`) bypass the origin check entirely, as custom headers cannot be sent cross-origin without CORS permission.

## `monitoring`

```radiant
config {
  monitoring: {
    enabled: true
    apiKey: env("MONITORING_API_KEY")
    healthCheck: {
      enabled: true
      path: "/health"
      requiresAuth: false
    }
    requestId: {
      enabled: true
    }
  }
}
```

| Property | Type | Description |
|---|---|---|
| `enabled` | Boolean | Enable monitoring endpoints and request instrumentation. |
| `apiKey` | String | Bearer token required to access monitoring endpoints. If unset, endpoints are insecure (a warning is logged). |
| `healthCheck.enabled` | Boolean | Enable the health check endpoint. Defaults to `true` when monitoring is enabled. |
| `healthCheck.path` | String | URL path for the health check (e.g., `"/health"`). Defaults to `/{apiPrefix}/monitor/health`. |
| `healthCheck.requiresAuth` | Boolean | Whether the health check requires the monitoring API key. Defaults to `false`. |
| `requestId.enabled` | Boolean | Generate a unique request ID for each request (honours incoming `X-Request-ID` header). |

When monitoring is enabled, the runtime exposes four endpoints under `{apiPrefix}/monitor`:

| Endpoint | Method | Description |
|---|---|---|
| `/monitor/events` | GET | Query buffered monitoring events with filters (`?type=`, `?severity=`, `?since=`, `?limit=`). |
| `/monitor/metrics` | GET | Aggregate summary: event counts by type/severity, request totals, average duration. |
| `/monitor/health` | GET | Database + cache health check. Returns `200` (ok/degraded) or `503` (error). |
| `/monitor/stream` | GET | Server-Sent Events live stream with backlog replay and 30s heartbeat. Supports same query filters as `/events`. |

See [Monitoring](./monitoring) for the full guide on exporters, SSE streams, and external tool integration.

## `adminUI`

```radiant
config {
  adminUI: {
    enabled: true
    user: "users"
  }
}
```

| Property | Type | Description |
|---|---|---|
| `enabled` | Boolean | Enable the admin dashboard. |
| `user` | String | The collection slug used for admin authentication. |

## `apiPrefix`

A shorthand for `core.api.prefix`:

```radiant
config {
  apiPrefix: "/api"
}
```

## `migrate`

```radiant
config {
  migrate: {
    dropOrphan: true
  }
}
```

| Property | Type | Description |
|---|---|---|
| `dropOrphan` | Boolean | Drop orphaned tables and columns during `db:sync` without requiring `--force`. |

## `output`

Controls where generated files are written. The path is relative to the `radiant/` directory:

```radiant
config {
  output: "../src/generated"
}
```

If not specified, generated files go to `radiant/runtime/` (schema.json, runtime.ts) and the project root (`radiant-types.ts`).

## Complete Example

```radiant
config {
  core: {
    api: {
      prefix: "/api"
      maxBodyBytes: 1048576
      trustedProxies: ["127.0.0.1"]
    }
    openapi: {
      enabled: true
    }
  }

  security: {
    auth: {
      strategies: ["jwt", "session"]
      jwt: {
        accessTokenExpiry: env("JWT_EXPIRY", "15m")
        refreshTokenExpiry: "7d"
        cookies: { enabled: true }
      }
      passwordPolicy: {
        minLength: 8
        requireUppercase: true
        requireNumber: true
      }
      lockout: {
        maxAttempts: 5
        durationMinutes: 15
      }
    }
    cors: {
      origin: ["http://localhost:3000"]
      credentials: true
    }
    rateLimit: {
      write: { max: 100, window: "15m" }
      login: { max: 5, window: "15m" }
    }
    headers: { enabled: true }
    secrets: { enabled: true }
    audit: { enabled: false }
    csrfTrustedOrigins: ["https://myapp.com"]
  }

  monitoring: {
    enabled: true
    apiKey: env("MONITORING_API_KEY")
    healthCheck: {
      enabled: true
      path: "/health"
      requiresAuth: false
    }
    requestId: { enabled: true }
  }

  adminUI: {
    enabled: true
    user: "users"
  }
}
```