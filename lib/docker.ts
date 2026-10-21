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
        const text = await readAll(res);
        let message = text;
        try {
          message = JSON.parse(text).message ?? text;
        } catch {}
        reject(new DockerError(message.trim(), res.statusCode ?? 500));
      }
    );
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
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
}
