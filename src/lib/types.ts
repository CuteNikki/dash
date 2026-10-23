import type { Role } from '@/lib/auth/roles';
import type { SavedCell } from '@/lib/dashboard/layout';
import type { ContainerState, DockerInfo } from '@/lib/docker/docker';
import type { HostTile } from '@/lib/host/host-tiles';
import type { IconVariants } from '@/lib/icons/icon-sets';

/** A container as the dashboard shows it, safe to send to the browser. */
export type Service = {
  key: string;
  containerId: string;
  containerName: string;
  name: string;
  group: string;
  /** A dashboard-icons name, "mdi-…", "si-…", "sh-…" or an https:// address */
  icon: string;
  /** When the icon comes in versions for light and dark backgrounds */
  iconVariants?: IconVariants;
  /** When there's no icon by that name, so the letter shows from the start */
  iconMissing?: boolean;
  /** Where to reach it: links, or plain text like a host and port */
  addresses: string[];
  /** The first of them that's a web link, for Open */
  url?: string;
  description?: string;
  /** Order within its group, when it's been placed; otherwise by name */
  position?: number;
  /** Columns and rows its tile spans where it hasn't been arranged */
  width: number;
  height: number;
  /** Left off the dashboard, except while editing it */
  hidden: boolean;
  /** Whether its tile has been edited here, rather than from labels */
  edited: boolean;
  image: string;
  state: ContainerState;
  status: string;
  stack?: { project: string; service: string; dir: string; files: string[] };
  /** Its stack can be removed from here: one of ~/services' own, not the dashboard's or Caddy's */
  removable: boolean;
  /** A newer image or version, or commits to build, once checked */
  update?: ServiceUpdate;
  /** Why it couldn't be checked for one */
  updateError?: string;
  /** The version it runs, as its image says, when it says one: "16.15", "v2.11.7" */
  version?: string;
  /** The ports it publishes on the server, each once, with every protocol it's on */
  ports?: { port: number; protocols: string[] }[];
  /** Takes commands typed into its console, as a game server does */
  console: boolean;
  usage?: {
    /** Percent of one core */
    cpu: number;
    /** Bytes */
    memory: number;
    history: UsageHistory;
  };
  /** Live numbers from the app itself, for those the dashboard knows: Sonarr's queue and so on */
  widget?: Widget;
  /** Whether the app has more to show in its window, from /api/containers/[id]/details */
  details?: boolean;
  /** Whether what it stores can be browsed in its window, as Garage's buckets */
  browse?: boolean;
  /** A website elsewhere, checked over HTTP: as it was last found, once it has been */
  site?: { check?: SiteCheck };
};

/**
 * One cell of a details table: text; how far along something is, from 0 to
 * 1; or a moment, in milliseconds since 1970, shown in the viewer's own time.
 */
export type DetailCell = string | { progress: number } | { at: number };

/** Part of what an app has to say in its window. */
export type DetailSection =
  | {
      kind: 'table';
      title: string;
      /** Numeric ones line up on the right */
      columns: { label: string; numeric?: boolean }[];
      /** Dimmed ones are there but quiet: a database no one's using */
      rows: { cells: DetailCell[]; dim?: boolean }[];
      /** What to say when there are no rows: "No one's watching" */
      empty: string;
    }
  | {
      kind: 'facts';
      title: string;
      facts: { label: string; value: DetailCell }[];
    };

/**
 * One of an app's numbers, ready to show: "Queued" and "3", "Down" and
 * "2.1 MB/s"; or one that says what it is alone, as "Paper 26.2" does.
 */
export type WidgetStat = {
  label?: string;
  value: string;
  /** "live" stands out, as a stream on air does; "off" is quiet, as one that isn't */
  tone?: 'live' | 'off';
};

/** An app's numbers, or why they couldn't be read. */
export type Widget = { stats: WidgetStat[] } | { error: string };

/** A container's recent readings, oldest first */
export type UsageHistory = {
  /** When each was taken, in milliseconds since 1970 */
  at: number[];
  /** Percent of one core */
  cpu: number[];
  /** Bytes */
  memory: number[];
};

/** Whoever's signed in, as the page knows them: what they may do follows from their role. */
export type Me = {
  name: string;
  email: string;
  role: Role;
  /** The groups they see; every one for a role that sees all */
  groups: string[];
};

export type Dashboard = {
  services: Service[];
  /** Groups in the order they've been placed; others follow by name */
  groupOrder: string[];
  /** The server's tiles, in their first order, at their first sizes */
  hostTiles: HostTile[];
  /** Where tiles sit at each number of columns they've been arranged at */
  layouts: SavedCell[];
  /** The server itself, once it's been measured twice */
  host?: HostStats;
  /** No stats yet, but they're coming: they take two readings, a few seconds apart */
  hostComing: boolean;
  /** When updates were last looked for, and whether they're being looked for now */
  updates: { checkedAt?: number; checking: boolean };
  /** The server's own updates, Ubuntu's packages, once they've been looked at */
  system?: SystemUpdates;
};

/** The server's packages waiting to be updated, and what else Ubuntu says about it. */
export type SystemUpdates = {
  /** "Ubuntu 26.04.1 LTS" */
  os: string;
  /** Security fixes first, then what Ubuntu is still rolling out, which apt holds back for now */
  packages: {
    name: string;
    from: string;
    to: string;
    security: boolean;
    /** Being rolled out bit by bit, so apt installs it only once it reaches this server */
    phased: boolean;
  }[];
  /** Ubuntu asks for a restart, to finish what's been installed */
  reboot: boolean;
  /** The packages it's for, as it lists them */
  rebootFor: string[];
  /**
   * Services that have failed, which systemd calls the system degraded for:
   * "logrotate", and what systemd says it does, "Rotate log files"
   */
  failedUnits: { name: string; description?: string }[];
  /** An upgrade from the dashboard is running now */
  upgrading: boolean;
  /** How the last one ended, while the server's been up */
  lastExit?: number;
  /** When apt last fetched what there is, in milliseconds since 1970 */
  refreshedAt?: number;
  checkedAt: number;
};

/**
 * What updating a service would bring: a newer image under the tag it
 * follows, as "latest"; a newer version than the one it's fixed to; or, for
 * one built here from a repository, commits on its branch not yet pulled.
 */
export type ServiceUpdate =
  | {
      kind: 'image';
      tag: string;
      /** The version the newer image says it is, when it says one */
      to?: string;
      /** The same version as now, built again, as on a newer base system */
      rebuilt?: boolean;
    }
  | {
      kind: 'version';
      from: string;
      to: string;
      /** A new major version, which can need more than pulling it */
      major: boolean;
      /** Where its source is, whose releases say what's changed */
      source?: string;
    }
  | { kind: 'commits'; behind: number; branch: string; upstream: string };

/** The server: CPU over all its cores, memory, its disk and its internet traffic. */
export type HostStats = {
  cores: number;
  /** Percent of all cores together */
  cpu: number;
  /** Percent of each core, in order */
  coreCpu: number[];
  memory: Capacity;
  /** Of the disk the root filesystem is on */
  disk: Capacity;
  /** Bytes per second, on the interface to the internet */
  network: { received: number; sent: number };
  /** Bytes per second, read from and written to the server's disks */
  diskIo: { read: number; written: number };
  /** Its processes, the busiest first */
  processes: HostProcess[];
  /** What it is: its name, system, processor, how long it's been up */
  system: DockerInfo & {
    cpuModel: string;
    /** Seconds */
    uptime: number;
    /** Over 1, 5 and 15 minutes */
    load: [number, number, number];
    /** Bytes; a total of 0 is no swap */
    swap: { used: number; total: number };
  };
  /** Recent readings, oldest first */
  history: {
    /** When each reading was taken, in milliseconds since 1970 */
    at: number[];
    cpu: number[];
    /** Each core's, in order */
    coreCpu: number[][];
    memory: number[];
    received: number[];
    sent: number[];
    diskRead: number[];
    diskWritten: number[];
  };
};

export type HostProcess = {
  pid: number;
  /** At most 15 characters, as the kernel keeps it */
  name: string;
  /** How it was started, as far as is kept; empty for the kernel's own */
  command: string;
  /** The full id of the container it runs in, if it does */
  containerId?: string;
  /** Percent of one core, as for containers */
  cpu: number;
  /** Bytes */
  memory: number;
};

/** How measuring the disk is going: underway, done (and when), or failed. */
export type DiskScan =
  | { state: 'none' }
  | {
      state: 'scanning';
      startedAt: number;
      /** Measured so far */
      folders: number;
      /** The folder it's just finished */
      current?: string;
    }
  | { state: 'done'; finishedAt: number; folders: number }
  | { state: 'failed'; error: string };

/**
 * Bytes: none while it's still being measured, with what it was the last
 * time, if it was measured before.
 */
export type MeasuredSize = { size?: number; before?: number };

/** A folder on the server: its size, and what's in it, biggest first. */
export type FolderUsage = MeasuredSize & {
  path: string;
  /** Elsewhere: another disk's, or the kernel's or memory's, so not measured here */
  folders: (MeasuredSize & { name: string; elsewhere?: boolean })[];
  files: { name: string; size: number }[];
};

/** One process, looked at closely, to see what it is before stopping it. */
export type ProcessDetails = {
  pid: number;
  name: string;
  /** How it was started, in full */
  command: string;
  /** Who it runs as, by name where the server knows one */
  user: string;
  /** e.g. "Sleeping", "Running" */
  state: string;
  threads: number;
  parentPid: number;
  /** Milliseconds since 1970 */
  startedAt: number;
  /** Seconds, as of when it was looked at */
  runningFor: number;
  /** When it started, in the kernel's ticks since boot: with its id, says it's the same process */
  start: number;
  /** Bytes */
  memory: number;
  containerId?: string;
  /** Whether it's its container's own first process, so stopping it stops the container */
  containerMain?: boolean;
  /** Why it can't be stopped from here, when it can't */
  locked?: string;
};

/** How stopping a process went. */
export type StopResult =
  | { ok: true; outcome: 'stopped' | 'gone' }
  | {
      ok: false;
      outcome: 'running' | 'replaced' | 'locked' | 'failed';
      error: string;
    };

/** Memory or a disk, in bytes. */
export type Capacity = {
  used: number;
  /** What's usable, a little less than its size */
  total: number;
  /**
   * Its size as it's sold, 24 GB of memory or a 500 GB disk: all the memory
   * installed, with the part the kernel keeps for itself, or the whole disk,
   * with what its filesystem takes for its own records
   */
  size: number;
};

/** A website elsewhere, as the dashboard last found it when it asked for its page. */
export type SiteCheck = {
  /** It answered, and not with an error */
  ok: boolean;
  /** What it answered, when it did: 200, 404… */
  status?: number;
  /** Why it couldn't be reached */
  error?: string;
  /** The icon its page names, as an address, once it's answered with one */
  icon?: string;
  /** How long it took to answer, or to fail, in milliseconds */
  ms: number;
  /** When, in milliseconds since 1970 */
  at: number;
  /** The last ten minutes of it, oldest first */
  history: { at: number[]; ms: number[] };
};

/**
 * Readings over a while, from the monitor's record: a point for each stretch
 * of it, from a minute to two hours long, oldest first, and null for one
 * with none, as while the dashboard was down.
 */
export type History<K extends string> = {
  /** When each stretch starts, in milliseconds since 1970 */
  at: number[];
} & Record<K, (number | null)[]>;

/** The server over a while; rates in bytes per second, the disk's wait in milliseconds. */
export type HostHistory = History<
  | 'cpu'
  | 'memory'
  | 'diskUsed'
  | 'received'
  | 'sent'
  | 'diskRead'
  | 'diskWritten'
  | 'diskWait'
  | 'load'
>;

/** A service's container over a while: percent of one core, and bytes. */
export type ServiceHistory = History<'cpu' | 'memory'>;

/** How a website's answered over the month it's been checked for, a check a minute. */
export type SiteUptime = {
  /** The share of checks it answered over the last day, week and month, from 0 to 1; null before any */
  shares: { range: '24h' | '7d' | '30d'; up: number | null; checks: number }[];
  /** The times it didn't answer, newest first, each from its first failed check to the next that answered */
  outages: {
    /** Milliseconds since 1970 */
    from: number;
    /** None while it's still down */
    to?: number;
    /** Why, as its first failed check said: "No answer in 10 s", "HTTP 502" */
    reason: string;
  }[];
  /** Its response time over the range asked for, in milliseconds, of the checks it answered */
  history: History<'ms' | 'up'>;
};
