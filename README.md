# dash

A dashboard for one home server: every Docker container as a tile, with its
status, usage and live numbers, and a window to manage it: start, stop and
restart it, read and type into its logs, edit its files, commit and push its
git changes, and redeploy it. New services can be added from templates, and
get a site in Caddy if they have a domain.

It runs on the server it shows, as a container of its own, behind Caddy.

## What it does

- **Tiles and a list** of every container, in groups, arranged by dragging and
  resizing, for each screen width separately. A tile's name, icon, group,
  description and addresses can be edited, and websites hosted elsewhere can
  be added as tiles with an up/down check.
- **Live numbers** on the tiles of apps it knows: Sonarr, Radarr, Prowlarr,
  Jellyfin, Jellyseerr, qBittorrent, Gluetun, FlareSolverr, Stalwart,
  Minecraft, PostgreSQL, Garage, Caddy and the stream relay.
- **A service's window**: CPU and memory over the last ten minutes, its logs
  (and console, for one that takes input), its folder's files in an editor,
  with compose files and `.env` checked by Compose before saving, and its git
  changes, history and branches.
- **The server itself**: CPU, memory, disk and network, its processes, and
  what's using its disk.
- **New services**: from one of about 200 templates (LinuxServer.io's
  catalogue, fetched daily, plus a few big apps it doesn't package), any image
  on Docker Hub, or a compose file of your own. dash makes its folder, starts
  it, and for a domain writes a Caddy site for it and reloads Caddy, undoing
  it all if a step fails.
- **One account**, signed in with a password or a passkey.

## How it fits together

dash is a Next.js app. On the server it has the Docker socket and the home
folder mounted at the same path as on the host, so it can list and run
containers and reach their files where Compose expects them. It runs Compose
and git in short-lived containers of the official images, so its own image
needs neither.

It expects the server laid out like this:

```
~/services/
  <name>/            one folder per stack: its compose file, .env and data
  caddy/
    Caddyfile        import sites/*.caddy
    sites/<name>.caddy
```

Tiles, layouts and the account are kept in PostgreSQL, through Prisma.
Uploaded icons go to an S3 bucket (Garage, on the same server).

A container's tile starts from its
[Homepage](https://gethomepage.dev) labels (`homepage.name`, `homepage.icon`,
`homepage.group`, `homepage.description`, `homepage.href`) until it's edited
in dash. Live numbers are read for an app known by its image's name, or by a
`dash.app` label for one whose image is named otherwise.

## Developing

You need [Bun](https://bun.sh) and SSH access to the server (as `vps.niso.moe`,
set in `scripts/`). In development dash still works on the real server: its
containers, files and database.

1. `bun install`
2. Copy `.env.example` to `.env.local` and fill it in. Each setting says where
   to find its value.
3. Once, on the server, start the helper container that lets dash read the
   server's CPU, memory and processes from outside it (the command is in
   `.env.example`), and set `HOST_HELPER_CONTAINER` to its name.
4. `bun run tunnels`, in a terminal of its own, and leave it running: it
   tunnels to the server's Docker and to the apps whose numbers show on tiles.
5. `bun dev`, and open http://localhost:3000.

With no account yet, the server prints a setup code in its log; make the
account at `/setup` with it.

## Deploying

`bun run deploy` sends what's committed (not uncommitted changes) to
`~/services/dash` on the server, then builds and starts it there with
`docker compose up -d --build`. The server's `.env` stays where it is and is
never in the repository. Database changes go in with `bun run db:migrate`.

## Scripts

| Script               | What it does                                             |
| -------------------- | -------------------------------------------------------- |
| `bun dev`            | The development server                                   |
| `bun run tunnels`    | Tunnels to the server's Docker and apps, for development |
| `bun run deploy`     | Builds and starts the committed version on the server    |
| `bun run typecheck`  | Type-checks the app and the scripts                      |
| `bun run lint`       | ESLint                                                   |
| `bun run format`     | Prettier                                                 |
| `bun run db:diff`    | The SQL that would bring the database up to the schema   |
| `bun run db:migrate` | Applies migrations                                       |

## Where things are

```
app/          pages and API routes
actions/      server actions, the changes a page asks for
components/
  auth/         sign-in and setup
  chrome/       the page's own: its name, theme and account menu
  dashboard/    tiles, the list, the board they're arranged on
  service/      a service's window: logs, details, status
  new-service/  adding a service, and its templates
  editor/       the file tree and code editor
  git/          changes, history, branches and diffs
  host/         the server's stats, processes and disk
  charts/       graphs and sparklines
  common/       scroll fades and loading placeholders
  ui/           buttons, dialogs, inputs and the rest
lib/          what runs on the server, and what the browser shares with it
  apps/         each app's widget and details: Jellyfin, Sonarr, Minecraft, …
  auth/         sign-in, sessions and setup
  dashboard/    the tiles, their groups, layout and status, websites' checks
  docker/       Docker's API, Compose, and runs in short-lived containers
  host/         the server's stats, processes, disk and files
  stacks/       adding and removing services, Caddy and domains
  templates/    the templates, Docker Hub search and docker run import
  icons/        finding icons
prisma/       the database schema and migrations
scripts/      deploy and tunnels
```
