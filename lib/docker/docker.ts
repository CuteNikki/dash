import 'server-only';

import http from 'node:http';

/**
 * The Docker Engine API, spoken directly over its socket. DOCKER_HOST is
 * unix:///var/run/docker.sock in the container (the default), or
 * tcp://127.0.0.1:2375 in development, through an SSH tunnel to the server's
 * socket.
 */
const DOCKER_HOST = process.env.DOCKER_HOST ?? 'unix:///var/run/docker.sock';

function connection(): http.RequestOptions {
  if (DOCKER_HOST.startsWith('unix://')) {
    return { socketPath: DOCKER_HOST.slice('unix://'.length) };
  }
  const url = new URL(DOCKER_HOST.replace(/^tcp:/, 'http:'));
  return { host: url.hostname, port: url.port };
}

export class DockerError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** A request to the API, with the response left open for streaming. */
export function dockerRequest(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal
) {
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = http.request(
      {
        ...connection(),
        method,
        path,
        signal,
        headers: body ? { 'content-type': 'application/json' } : undefined,
      },
      async (res) => {
        if ((res.statusCode ?? 500) < 400) return resolve(res);
        reject(await errorFrom(res));
      }
    );
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

/** Docker's reason for refusing a request: its message, or what it sent. */
async function errorFrom(res: http.IncomingMessage) {
  const text = await readAll(res);
  let message = text;
  try {
    message = JSON.parse(text).message ?? text;
  } catch {}
  return new DockerError(message.trim(), res.statusCode ?? 500);
}

async function readAll(res: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of res) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function dockerJson<T>(method: string, path: string, body?: unknown) {
  const text = await readAll(await dockerRequest(method, path, body));
  return (text ? JSON.parse(text) : undefined) as T;
}

type RawContainer = {
  Id: string;
  Names: string[];
  Image: string;
  ImageID: string;
  State: string;
  Status: string;
  Created: number;
  Labels: Record<string, string>;
  Ports: {
    IP?: string;
    PrivatePort: number;
    PublicPort?: number;
    Type: string;
  }[];
};

export type ContainerState =
  | 'running'
  | 'unhealthy'
  | 'starting'
  | 'paused'
  | 'restarting'
  | 'exited'
  | 'created'
  | 'dead';

export type Container = {
  id: string;
  name: string;
  image: string;
  /** The image it was made from, as Docker has it: "sha256:…" */
  imageId: string;
  state: ContainerState;
  /** Docker's own words, e.g. "Up 2 days (healthy)" */
  status: string;
  created: number;
  labels: Record<string, string>;
  ports: { ip?: string; private: number; public?: number; type: string }[];
  /** The compose stack it belongs to, if any */
  stack?: { project: string; service: string; dir: string; files: string[] };
};

function stateOf(raw: RawContainer): ContainerState {
  if (raw.State === 'running') {
    if (raw.Status.includes('(unhealthy)')) return 'unhealthy';
    if (raw.Status.includes('(health: starting)')) return 'starting';
  }
  return raw.State as ContainerState;
}

function toContainer(raw: RawContainer): Container {
  const l = raw.Labels;
  const project = l['com.docker.compose.project'];
  return {
    id: raw.Id,
    name: raw.Names[0]?.replace(/^\//, '') ?? raw.Id.slice(0, 12),
    image: raw.Image,
    imageId: raw.ImageID,
    state: stateOf(raw),
    status: raw.Status,
    created: raw.Created,
    labels: l,
    ports: raw.Ports.map((p) => ({
      ip: p.IP || undefined,
      private: p.PrivatePort,
      public: p.PublicPort,
      type: p.Type,
    })),
    stack: project
      ? {
          project,
          service: l['com.docker.compose.service'],
          dir: l['com.docker.compose.project.working_dir'],
          files: (l['com.docker.compose.project.config_files'] ?? '')
            .split(',')
            .filter(Boolean),
        }
      : undefined,
  };
}

export async function listContainers() {
  const raw = await dockerJson<RawContainer[]>(
    'GET',
    '/containers/json?all=true'
  );
  return raw.map(toContainer).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * What Docker knows of an image: the registry digests it was pulled as,
 * none for one built here, and where its source is, from its labels.
 */
export async function imageDetails(id: string) {
  const raw = await dockerJson<{
    RepoDigests?: string[];
    Config?: { Labels?: Record<string, string> | null };
  }>('GET', `/images/${encodeURIComponent(id)}/json`);
  const labels = raw.Config?.Labels ?? {};
  return {
    digests: (raw.RepoDigests ?? []).map((d) => d.slice(d.indexOf('@') + 1)),
    source:
      labels['org.opencontainers.image.source'] ||
      labels['org.opencontainers.image.url'] ||
      undefined,
  };
}

export type ContainerAction = 'start' | 'stop' | 'restart';

export async function containerAction(id: string, action: ContainerAction) {
  await dockerJson('POST', `/containers/${encodeURIComponent(id)}/${action}`);
}

type RawStats = {
  cpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  precpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage?: number;
  };
  memory_stats: {
    usage?: number;
    limit?: number;
    stats?: { inactive_file?: number };
  };
};

export type Usage = {
  /** Percent of one CPU core, so 250 is two and a half cores */
  cpu: number;
  /** Bytes in use, without the page cache Docker also counts */
  memory: number;
};

/** One reading, comparing against Docker's previous one (takes about a second). */
export async function containerUsage(id: string): Promise<Usage> {
  const s = await dockerJson<RawStats>(
    'GET',
    `/containers/${encodeURIComponent(id)}/stats?stream=false`
  );
  const cpuDelta =
    s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
  const systemDelta =
    (s.cpu_stats.system_cpu_usage ?? 0) -
    (s.precpu_stats.system_cpu_usage ?? 0);
  const cores = s.cpu_stats.online_cpus ?? 1;
  return {
    cpu:
      systemDelta > 0 && cpuDelta > 0
        ? (cpuDelta / systemDelta) * cores * 100
        : 0,
    memory:
      (s.memory_stats.usage ?? 0) - (s.memory_stats.stats?.inactive_file ?? 0),
  };
}

/**
 * Whether each container keeps its console's input open (compose's
 * stdin_open), as a game server's console does. Docker sets it when it makes
 * the container, so each is asked about once; this keeps only those there are.
 */
const inputOpen = new Map<string, boolean>();

export async function takesInput(id: string) {
  let open = inputOpen.get(id);
  if (open === undefined) {
    open = await dockerJson<{ Config: { OpenStdin: boolean } }>(
      'GET',
      `/containers/${encodeURIComponent(id)}/json`
    ).then(
      (info) => info.Config.OpenStdin,
      () => false
    );
    inputOpen.set(id, open);
  }
  return open;
}

/** Which of every container there is take input, forgetting those gone. */
export async function takingInput(containers: Container[]) {
  const ids = new Set(containers.map((c) => c.id));
  for (const id of inputOpen.keys()) if (!ids.has(id)) inputOpen.delete(id);
  const open = await Promise.all([...ids].map(takesInput));
  return new Set([...ids].filter((_, i) => open[i]));
}

/**
 * Types into a running container's console, as `docker attach` would: the
 * text goes to its input, and what it prints in reply shows in its log.
 */
export function sendInput(id: string, text: string) {
  return new Promise<void>((resolve, reject) => {
    const req = http.request({
      ...connection(),
      method: 'POST',
      path: `/containers/${encodeURIComponent(id)}/attach?stream=1&stdin=1`,
      // Docker hands over the connection itself, to write the input into
      headers: { Connection: 'Upgrade', Upgrade: 'tcp' },
    });
    req.on('upgrade', (_res, socket) => socket.end(text, () => resolve()));
    // Answered rather than handed over: refused, as when it's stopped
    req.on('response', async (res) => reject(await errorFrom(res)));
    req.on('error', reject);
    req.end();
  });
}

/** The id on the server of a running container's own process, its first. */
export async function containerPid(id: string) {
  const info = await dockerJson<{ State: { Pid: number } }>(
    'GET',
    `/containers/${encodeURIComponent(id)}/json`
  );
  return info.State.Pid;
}

/** Bytes Docker keeps of one kind, and how many of them nothing uses. */
export type DockerSpace = { size: number; reclaimable: number; count: number };

/**
 * What Docker's images, containers, volumes and build cache take on the
 * disk, and how much of each nothing uses, as \`docker system df\` counts it.
 */
export async function dockerSpace() {
  const df = await dockerJson<{
    LayersSize: number;
    Images: { Size: number; SharedSize: number; Containers: number }[];
    Containers: { SizeRw?: number }[];
    Volumes: { UsageData?: { Size: number; RefCount: number } }[];
    BuildCache: { Size: number; InUse: boolean; Shared: boolean }[] | null;
  }>('GET', '/system/df');
  const sum = (values: number[]) =>
    values.reduce((a, b) => a + Math.max(0, b), 0);
  const unusedImages = df.Images.filter((i) => i.Containers === 0);
  const volumes = df.Volumes.map((v) => v.UsageData).filter(
    (u) => u !== undefined
  );
  // Shared cache is counted under what shares it
  const cache = (df.BuildCache ?? []).filter((c) => !c.Shared);
  return {
    images: {
      size: df.LayersSize,
      // What only unused images hold: their layers shared with others stay
      reclaimable: sum(
        unusedImages.map((i) => i.Size - Math.max(0, i.SharedSize))
      ),
      count: df.Images.length,
    },
    containers: {
      size: sum(df.Containers.map((c) => c.SizeRw ?? 0)),
      reclaimable: 0,
      count: df.Containers.length,
    },
    volumes: {
      size: sum(volumes.map((u) => u.Size)),
      reclaimable: sum(
        volumes.filter((u) => u.RefCount === 0).map((u) => u.Size)
      ),
      count: volumes.length,
    },
    buildCache: {
      size: sum(cache.map((c) => c.Size)),
      reclaimable: sum(cache.filter((c) => !c.InUse).map((c) => c.Size)),
      count: cache.length,
    },
  } satisfies Record<string, DockerSpace>;
}

/**
 * Frees what Docker keeps that nothing uses: the build cache no build is
 * using, or images no container (running or stopped) is made from. Gives the
 * bytes freed.
 */
export async function dockerPrune(what: 'buildCache' | 'images') {
  const result = await dockerJson<{ SpaceReclaimed: number }>(
    'POST',
    what === 'buildCache'
      ? '/build/prune?all=true'
      : // Not only untagged ones: every image without a container
        `/images/prune?filters=${encodeURIComponent(JSON.stringify({ dangling: ['false'] }))}`
  );
  return result.SpaceReclaimed;
}

/** What Docker knows about the server it runs on, and its own state. */
export async function dockerInfo() {
  const info = await dockerJson<{
    Name: string;
    OperatingSystem: string;
    KernelVersion: string;
    Architecture: string;
    ServerVersion: string;
    ContainersRunning: number;
    ContainersStopped: number;
    ContainersPaused: number;
    Images: number;
  }>('GET', '/info');
  return {
    hostname: info.Name,
    // The server's own, not the container's: Docker reads it on the server
    os: info.OperatingSystem,
    kernel: info.KernelVersion,
    architecture: info.Architecture,
    docker: info.ServerVersion,
    containers: {
      running: info.ContainersRunning,
      stopped: info.ContainersStopped + info.ContainersPaused,
    },
    images: info.Images,
  };
}

export type DockerInfo = Awaited<ReturnType<typeof dockerInfo>>;

/** Runs a command in a running container and returns what it printed. */
export async function execOutput(container: string, cmd: string[]) {
  return (await execRun(container, cmd)).stdout;
}

/** Runs a command in a running container: exactly what it printed, and how it exited. */
export async function execRun(container: string, cmd: string[]) {
  const { Id } = await dockerJson<{ Id: string }>(
    'POST',
    `/containers/${encodeURIComponent(container)}/exec`,
    { AttachStdout: true, AttachStderr: true, Cmd: cmd }
  );
  const res = await dockerRequest('POST', `/exec/${Id}/start`, {
    Detach: false,
    Tty: false,
  });
  const { stdout, stderr } = await demux(res);
  const { ExitCode } = await dockerJson<{ ExitCode: number }>(
    'GET',
    `/exec/${Id}/json`
  );
  return { stdout, stderr, exitCode: ExitCode };
}

/**
 * Everything a stream without a TTY sent, as stdout and stderr: frames with
 * an 8-byte header each, the stream (1 or 2) then the length.
 */
async function demux(res: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of res) chunks.push(chunk as Buffer);
  const all = Buffer.concat(chunks);
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  for (let at = 0; at + 8 <= all.length;) {
    const size = all.readUInt32BE(at + 4);
    (all[at] === 2 ? err : out).push(all.subarray(at + 8, at + 8 + size));
    at += 8 + size;
  }
  return {
    stdout: Buffer.concat(out).toString('utf8'),
    stderr: Buffer.concat(err).toString('utf8'),
  };
}

/** The log stream of a container, from the last `tail` lines on. */
export async function containerLogs(
  id: string,
  {
    tail = 300,
    follow = true,
    signal,
  }: { tail?: number; follow?: boolean; signal?: AbortSignal }
) {
  const inspect = await dockerJson<{ Config: { Tty: boolean } }>(
    'GET',
    `/containers/${encodeURIComponent(id)}/json`
  );
  const res = await dockerRequest(
    'GET',
    `/containers/${encodeURIComponent(id)}/logs?stdout=1&stderr=1&timestamps=1&tail=${tail}&follow=${follow ? 1 : 0}`,
    undefined,
    signal
  );
  return { res, tty: inspect.Config.Tty };
}

/**
 * Splits Docker's log stream into lines. Without a TTY each frame starts with
 * an 8-byte header: the stream (1 stdout, 2 stderr), three zero bytes, and the
 * frame's length.
 */
export async function* logLines(res: http.IncomingMessage, tty: boolean) {
  let buffer = Buffer.alloc(0);
  let partial = { stdout: '', stderr: '' };
  for await (const chunk of res) {
    buffer = Buffer.concat([buffer, chunk as Buffer]);
    while (buffer.length) {
      let stream: 'stdout' | 'stderr' = 'stdout';
      let text: string;
      if (tty) {
        text = buffer.toString('utf8');
        buffer = Buffer.alloc(0);
      } else {
        if (buffer.length < 8) break;
        const size = buffer.readUInt32BE(4);
        if (buffer.length < 8 + size) break;
        stream = buffer[0] === 2 ? 'stderr' : 'stdout';
        text = buffer.subarray(8, 8 + size).toString('utf8');
        buffer = buffer.subarray(8 + size);
      }
      const lines = (partial[stream] + text).split('\n');
      partial = { ...partial, [stream]: lines.pop() ?? '' };
      for (const line of lines) yield { stream, line };
    }
  }
  // A last line with no newline after it, as `compose config`'s closing brace
  for (const stream of ['stdout', 'stderr'] as const) {
    if (partial[stream]) yield { stream, line: partial[stream] };
  }
}
