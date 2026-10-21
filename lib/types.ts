import type { ContainerState } from '@/lib/docker';

/** A container as the dashboard shows it, safe to send to the browser. */
export type Service = {
  key: string;
  containerId: string;
  containerName: string;
  name: string;
  group: string;
  /** A dashboard-icons name, e.g. "jellyfin" */
  icon: string;
  url?: string;
  description?: string;
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
