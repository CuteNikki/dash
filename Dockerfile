# Built with Bun, run on Node: Next's own standalone server, with just what it needs.
FROM oven/bun:1.4.0-alpine AS build
WORKDIR /app
# Dependencies first, so a change to the code alone reuses them
COPY package.json bun.lock prisma.config.ts ./
COPY prisma ./prisma
# Prisma's migrations engine isn't needed to generate its client, nor by the
# dashboard, only by the migrate stage below. Saying it's there keeps Prisma
# from downloading it, which from Docker's network, with no IPv6, can time out
ENV PRISMA_SCHEMA_ENGINE_BINARY=/bin/true
RUN bun install --frozen-lockfile
COPY . .
# The server's name, shown in the browser too, so it's built in
ARG NEXT_PUBLIC_SERVER_NAME
RUN bun run build

# The database's migrations, which compose's migrate runs before the dashboard starts:
# Prisma and the migrations alone, at the versions package.json names, with
# its engine downloaded here, as it's built. Otherwise each run downloads it
# afresh, and when Prisma's host doesn't answer, as it now and then doesn't
# from Docker's network, the migration fails and the dashboard doesn't start;
# a build that fails leaves the one that's running. A few tries if need be,
# each checking the engine came, as Prisma's own download fails quietly
FROM oven/bun:1.4.0-alpine AS migrate
WORKDIR /app
COPY package.json ./app.json
RUN echo '{ "private": true, "trustedDependencies": ["prisma", "@prisma/engines"] }' > package.json \
  && for try in 1 2 3 4; do \
    bun add \
      prisma@$(bun -e 'console.log(require("./app.json").devDependencies.prisma)') \
      dotenv@$(bun -e 'console.log(require("./app.json").devDependencies.dotenv)') \
    && ls node_modules/@prisma/engines/schema-engine-* >/dev/null 2>&1 \
    && break; \
    [ "$try" = 4 ] && { echo "Couldn't download Prisma's engine" >&2; exit 1; }; \
    rm -rf node_modules; \
    sleep 5; \
  done
COPY prisma.config.ts ./
COPY prisma ./prisma
CMD ["bunx", "prisma", "migrate", "deploy"]

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
