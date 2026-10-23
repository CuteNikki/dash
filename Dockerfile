# Built with Bun, run on Node: Next's own standalone server, with just what it needs.
FROM oven/bun:1.4.0-alpine AS build
WORKDIR /app
# Dependencies first, so a change to the code alone reuses them
COPY package.json bun.lock prisma.config.ts ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:24-alpine
WORKDIR /app
# Next listens on HOSTNAME, which Docker sets to the container's id; every address instead
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# There's no public/: the icons are app/'s own. Should it get files, copy it here.
EXPOSE 3000
# Runs as root, as meant: the Docker socket and pid: host it needs give it
# root's reach over the server anyway
CMD ["node", "server.js"]
