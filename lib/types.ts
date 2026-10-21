import type { ContainerState, DockerInfo } from '@/lib/docker';
import type { IconVariants } from '@/lib/icon-sets';

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
  /** Left off the dashboard, except while editing it */
  hidden: boolean;
  /** Whether its tile has been edited here, rather than from labels */
  edited: boolean;
  image: string;
  state: ContainerState;
  status: string;
  stack?: { project: string; service: string; dir: string; files: string[] };
  usage?: {
    /** Percent of one core */
    cpu: number;
    /** Bytes */
    memory: number;
    history: UsageHistory;
  };
};

/** A container's recent readings, oldest first */
export type UsageHistory = {
  /** When each was taken, in milliseconds since 1970 */
  at: number[];
  /** Percent of one core */
  cpu: number[];
  /** Bytes */
  memory: number[];
};

export type Dashboard = {
  services: Service[];
  /** Groups in the order they've been placed; others follow by name */
  groupOrder: string[];
  /** The server itself, once it's been measured twice */
  host?: HostStats;
};

/** The server: CPU over all its cores, memory, its disk and its internet traffic. */
export type HostStats = {
  cores: number;
  /** Percent of all cores together */
  cpu: number;
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
