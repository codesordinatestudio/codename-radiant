FROM oven/bun:1

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

# Required environment variables:
# API_BASE_URL (default: http://localhost:3000)

CMD ["bun", "run", "src/index.ts"]
