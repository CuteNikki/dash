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
    /** Recent CPU readings, oldest first */
    history: number[];
  };
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
  /** Bytes */
  memory: { used: number; total: number };
  /** Bytes, of the disk the root filesystem is on */
  disk: { used: number; total: number };
  /** Bytes per second, on the interface to the internet */
  network: { received: number; sent: number };
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
    cpu: number[];
    memory: number[];
    received: number[];
    sent: number[];
  };
};
