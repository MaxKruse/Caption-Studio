FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# --- Runtime ---
FROM oven/bun:1-alpine
WORKDIR /app

# Copy standalone server output
COPY --from=builder /app/.next/standalone ./

# Copy static assets (CSS, JS bundles) and public files
COPY --from=builder /app/.next/static .next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
