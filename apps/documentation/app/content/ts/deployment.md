# Deployment

Running Radiant in production requires a few configuration changes from development. This page covers building, environment setup, and production guardrails.

## Building for Production

Compile your TypeScript to a standalone bundle:

```bash
bun build src/index.ts --outdir dist --target bun
```

This produces `dist/index.js` — a single bundled file with all dependencies inlined. Run it with:

```bash
bun dist/index.js
```

Or add a build script to `package.json`:

```json
{
  "scripts": {
    "dev": "bun run --hot src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "start": "bun dist/index.js"
  }
}
```

## Environment Variables

Production requires several environment variables to be set. Create a production `.env` or set them in your hosting platform:

```bash
# Required
NODE_ENV=production
DATABASE_URL=postgres://user:pass@db-host:5432/mydb
JWT_SECRET=<strong-random-secret>

# Optional (depending on features used)
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
REDIS_HOST=<redis-host>          # for Queue Manager
RESEND_API_KEY=<key>             # for Resend email
SMTP_HOST=<smtp-host>            # for Nodemailer email
SMTP_PORT=465
SMTP_USER=<user>
SMTP_PASS=<password>
AWS_ACCESS_KEY_ID=<key>          # for S3 storage
AWS_SECRET_ACCESS_KEY=<secret>
```

> **Never commit `.env` to git.** Use your hosting platform's secret management or a tool like [doppler](https://www.doppler.com/).

## Production Guardrails

### Memory Cache Check

Radiant refuses to start in production (`NODE_ENV=production`) if the cache is set to `MemoryCacheStore`. In-memory cache doesn't work across multiple server instances and causes inconsistent data.

Use a Redis-backed cache for production:

```typescript
import { createRadiant } from "../radiant/runtime";
import { postgres } from "@codesordinatestudio/radiant-plugin-postgres";
import { redis } from "@codesordinatestudio/radiant-plugin-redis-db";

export const app = createRadiant({
  adapter: postgres({ url: process.env.DATABASE_URL! }),
  cache: redisCache({ url: process.env.REDIS_URL! }),  // distributed cache
});
```

### Database Sync Safety

In production, automatic schema sync (`syncDatabaseSchema` on startup) is **additive only** — it creates missing tables and adds missing columns but never drops anything, even if `migrate.dropOrphan` is set to `true` in the DSL. Destructive changes require explicit `radiant db:sync --force`.

### Rate Limiting

Rate limits configured in `security.rateLimit` are enforced in production. Use a Redis-backed KV store for distributed rate limiting across multiple instances.

## Deploying on Vercel

Vercel Functions run Bun natively. Set the entry point in `vercel.json`:

```json
{
  "functions": {
    "api/index.ts": {
      "runtime": "@vercel/bun"
    }
  }
}
```

Move your server start logic to `api/index.ts` and export the handler.

## Deploying with Docker

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY . .

# Build
RUN bun run build

# Run
EXPOSE 3000
CMD ["bun", "dist/index.js"]
```

```bash
docker build -t my-radiant-app .
docker run -p 3000:3000 --env-file .env my-radiant-app
```

## Deploying on a VPS

```bash
# On the server
git clone <repo>
cd my-app
bun install --production
bun run build

# Run with a process manager (pm2, systemd, etc.)
NODE_ENV=production bun dist/index.js
```

### Using systemd

```ini
# /etc/systemd/system/radiant-app.service
[Unit]
Description=Radiant App
After=network.target

[Service]
Type=simple
User=app
WorkingDirectory=/home/app/my-app
EnvironmentFile=/home/app/my-app/.env
ExecStart=/usr/local/bin/bun dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable radiant-app
sudo systemctl start radiant-app
```

## Health Checks & Monitoring

If you configured `monitoring.enabled: true` in your DSL, the runtime serves a health check endpoint and monitoring API:

```bash
# Health check (no auth required by default)
curl http://localhost:3000/health
# → { "status": "ok", ... }

# Monitoring metrics (requires API key)
curl -H "Authorization: Bearer $MONITORING_API_KEY" \
  http://localhost:3000/api/monitor/metrics
# → { "total": 1523, "byType": { ... }, "requests": { ... } }
```

Use the health endpoint for load balancer health checks (AWS ALB, Kubernetes liveness/readiness probes, Docker healthcheck):

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

For external monitoring tools and Radiant Desktop, use the SSE stream endpoint for live event feeds:

```bash
curl -N -H "Authorization: Bearer $MONITORING_API_KEY" \
  http://localhost:3000/api/monitor/stream
```

See [Monitoring](./monitoring) for the full endpoint reference and exporter guide.

## Production Checklist

- [ ] `NODE_ENV=production` is set
- [ ] `JWT_SECRET` is a strong, random string (not the dev default)
- [ ] `DATABASE_URL` points to a production database (not local SQLite)
- [ ] Cache is Redis-backed (not in-memory)
- [ ] Rate limiter uses Redis KV (not in-memory) for multi-instance
- [ ] `radiant db:sync` has been run to create/migrate tables
- [ ] CORS `origin` in config.radiant lists production domains (not localhost)
- [ ] Email transport is configured (if using auth flows)
- [ ] File storage uses S3 (not local disk) if running multiple instances
- [ ] Queue Manager is initialised with Redis (if using background jobs)
- [ ] Health check endpoint is configured for your load balancer
- [ ] Monitoring API key is set (if monitoring is enabled)
- [ ] `csrfTrustedOrigins` lists any cross-origin cookie-authenticated frontends
- [ ] Security headers are enabled (`security.headers.enabled: true`)
- [ ] Process manager (systemd, pm2, Docker) is set up with restart on failure

## Related

- [Project Structure](./project-structure) — What gets built and what you run
- [Database Sync](./database-sync) — Migrating schema changes to production
- [Environment Variables](./environment-variables) — All env vars
- [Plugins](./database-plugins) — Database and storage plugin configuration