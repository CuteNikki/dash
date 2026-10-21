import { diskScan } from '@/lib/disk-usage';
import { dockerSpace } from '@/lib/docker';
import { unauthorized } from '@/lib/session';

/**
 * How measuring the disk is going, with how many seconds ago it started or
 * finished, and what Docker's things take on it.
 */
export async function GET() {
  const denied = await unauthorized();
  if (denied) return denied;
  try {
    const scan = diskScan();
    const since =
      scan.state === 'done'
        ? scan.finishedAt
        : scan.state === 'scanning'
          ? scan.startedAt
          : undefined;
    return Response.json({
      scan,
      seconds: since && (Date.now() - since) / 1000,
      docker: await dockerSpace(),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
