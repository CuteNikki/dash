# Built with Bun, run on Node: Next's own standalone server, with just what it needs.
FROM oven/bun:1.4.0-alpine AS build
WORKDIR /app
# Dependencies first, so a change to the code alone reuses them
COPY package.json bun.lock prisma.config.ts ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile
COPY . .
# The server's name, shown in the browser too, so it's built in
ARG NEXT_PUBLIC_SERVER_NAME
RUN bun run build

# The database's migrations, which compose's migrate runs before the dashboard starts:
# Prisma and the migrations alone, at the versions package.json names
FROM oven/bun:1.4.0-alpine AS migrate
WORKDIR /app
COPY package.json ./app.json
RUN echo '{ "private": true }' > package.json \
  && bun add \
    prisma@$(bun -e 'console.log(require("./app.json").devDependencies.prisma)') \
    dotenv@$(bun -e 'console.log(require("./app.json").devDependencies.dotenv)')
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
