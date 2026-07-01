FROM oven/bun:1 as base
WORKDIR /usr/src/app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

EXPOSE 9100/tcp
ENTRYPOINT [ "bun", "run", "dist/server.js" ]
