FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["bun", "start"]
