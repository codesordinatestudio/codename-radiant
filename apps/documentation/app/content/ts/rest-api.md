# REST API

Every collection in your Radiant schema automatically gets a full set of REST endpoints. These endpoints handle CRUD operations, filtering, sorting, pagination, and authentication — no code required.

## Base URL

All API endpoints are mounted under the API prefix defined in your `config.radiant`:

```radiant
config {
  core: {
    api: {
      prefix: "/api"
    }
  }
}
```

If your prefix is `/api` and you have a collection called `todos`, the endpoints are at `/api/todos`.

## Collection Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/<prefix>/<slug>` | List records (with filtering, sorting, pagination) |
| `GET` | `/<prefix>/<slug>/:id` | Get a single record by ID |
| `POST` | `/<prefix>/<slug>` | Create a new record |
| `PATCH` | `/<prefix>/<slug>/:id` | Update a record |
| `DELETE` | `/<prefix>/<slug>/:id` | Delete a record |

## Authentication Endpoints

When a collection has `auth: true`, additional endpoints are generated:

| Method | Path | Description |
|---|---|---|
| `POST` | `/<prefix>/<slug>/register` | Register a new user |
| `POST` | `/<prefix>/<slug>/login` | Login with email/password |
| `POST` | `/<prefix>/<slug>/refresh` | Refresh an access token |
| `POST` | `/<prefix>/<slug>/logout` | Logout (revokes refresh token) |
| `POST` | `/<prefix>/<slug>/forgot-password` | Request a password reset email |
| `POST` | `/<prefix>/<slug>/reset-password` | Reset password with a token |

## Global Endpoints

Globals get two endpoints — one for reading, one for updating the singleton document:

| Method | Path | Description |
|---|---|---|
| `GET` | `/<prefix>/globals/<slug>` | Get the global document |
| `POST` / `PATCH` | `/<prefix>/globals/<slug>` | Create or update the global document |

## System Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/<prefix>/docs` | Interactive API docs (Scalar) |
| `GET` | `/<prefix>/docs/openapi.json` | OpenAPI specification |
| `POST` | `/<prefix>/upload` | Upload a file |
| `GET` | `/<prefix>/uploads/:filename` | Serve an uploaded file |
| `GET` | `/<prefix>/ws` | WebSocket connection (if realtime is enabled) |
| `GET` | `/<prefix>/sse` | Server-Sent Events (if realtime is enabled) |

## Querying

### Filter

Use `where` query parameter with JSON to filter records:

```bash
# Filter by exact match
GET /api/todos?where={"completed":{"eq":false}}

# Filter by multiple fields
GET /api/todos?where={"completed":{"eq":false},"priority":{"eq":"high"}}

# Using OR
GET /api/todos?where={"OR":[{"completed":{"eq":false}},{"priority":{"eq":"urgent"}}]}
```

### Filter Operators

| Operator | Description | Example |
|---|---|---|
| `eq` | Equals | `{"title":{"eq":"Buy milk"}}` |
| `neq` | Not equals | `{"completed":{"neq":true}}` |
| `gt` | Greater than | `{"price":{"gt":100}}` |
| `gte` | Greater than or equal | `{"price":{"gte":100}}` |
| `lt` | Less than | `{"price":{"lt":50}}` |
| `lte` | Less than or equal | `{"price":{"lte":50}}` |
| `in` | In array | `{"status":{"in":["draft","published"]}}` |
| `nin` | Not in array | `{"status":{"nin":["archived"]}}` |
| `like` | LIKE pattern | `{"title":{"like":"%grocer%"}}` |
| `nlike` | NOT LIKE | `{"title":{"nlike":"%test%"}}` |

### Sort

Prefix with `-` for descending:

```bash
GET /api/todos?sort=-createdAt        # newest first
GET /api/todos?sort=priority           # ascending
GET /api/todos?sort=-priority,createdAt # multiple fields
```

### Pagination

```bash
GET /api/todos?limit=10&page=1
```

### Populate Relationships

Use `depth` to populate relationship fields:

```bash
# depth=0 (default): author is just the ID
GET /api/todos?depth=0

# depth=1: author is the full user object
GET /api/todos?depth=1
```

## Response Format

### List Response

```json
{
  "docs": [
    { "id": "abc-123", "title": "Buy groceries", "completed": false, ... },
    { "id": "def-456", "title": "Walk the dog", "completed": true, ... }
  ],
  "totalDocs": 42,
  "limit": 10,
  "page": 1,
  "totalPages": 5,
  "hasNextPage": true,
  "hasPrevPage": false
}
```

### Single Record

```json
{
  "id": "abc-123",
  "title": "Buy groceries",
  "completed": false,
  "author": "user-uuid",
  "createdAt": "2026-07-01T12:00:00.000Z",
  "updatedAt": "2026-07-01T12:00:00.000Z"
}
```

### Create Response

Status `201 Created` — returns the created record.

### Delete Response

```json
{ "deleted": true }
```

## Authentication

When JWT auth is enabled, include the access token in the `Authorization` header:

```bash
# Authenticated request
curl -H "Authorization: Bearer <accessToken>" http://localhost:3000/api/todos
```

### Register

```bash
POST /api/users/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}
```

Response:

```json
{
  "user": { "id": "abc-123", "email": "user@example.com", "name": "John Doe" },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "message": "Registration successful"
}
```

### Login

```bash
POST /api/users/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}
```

### Refresh Token

```bash
POST /api/users/refresh
Content-Type: application/json

{ "refreshToken": "eyJ..." }
```

### Forgot Password

```bash
POST /api/users/forgot-password
Content-Type: application/json

{ "email": "user@example.com" }
```

Always returns `200` with a generic message to prevent email enumeration.

### Reset Password

```bash
POST /api/users/reset-password
Content-Type: application/json

{ "token": "reset-token-from-email", "password": "newpassword" }
```

## Caching

When a collection has `cache` configured, `GET` responses include an `X-Cache` header:

- `X-Cache: HIT` — served from cache
- `X-Cache: MISS` — fetched from database (and cached for subsequent requests)

Cache is automatically invalidated on create, update, or delete operations for that collection.

## Rate Limiting

When rate limiting is configured in `security.rateLimit`, requests exceeding the limit receive a `429 Too Many Requests` response.

## OpenAPI Documentation

Every Radiant server includes auto-generated API documentation at `/<prefix>/docs` (powered by Scalar). The OpenAPI JSON spec is available at `/<prefix>/docs/openapi.json`.

Custom routes with schema definitions and `detail` metadata are included in the spec.

## Related

- [Local API](./local-api) — Programmatic data access from TypeScript
- [Access Control](./access) — How access rules affect REST endpoints
- [Custom Endpoints](./custom-endpoints) — Adding routes beyond the CRUD API