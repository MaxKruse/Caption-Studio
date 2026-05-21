# -----------------------------------------------------------
# Stage 1 — Install dependencies
# -----------------------------------------------------------
FROM oven/bun:alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# -----------------------------------------------------------
# Stage 2 — Build the application
# -----------------------------------------------------------
FROM oven/bun:alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Pass NEXT_PUBLIC_* args through as env vars so next build picks them up
ARG NEXT_PUBLIC_CAPTION_API_URL
ENV NEXT_PUBLIC_CAPTION_API_URL=${NEXT_PUBLIC_CAPTION_API_URL}

RUN bun run build

# -----------------------------------------------------------
# Stage 3 — Production runtime (standalone)
# -----------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
