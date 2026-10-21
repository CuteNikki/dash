import { diskScan } from '@/lib/disk-usage';
import { dockerSpace } from '@/lib/docker';
import { unauthorized } from '@/lib/session';

/** How measuring the disk is going, and what Docker's things take on it. */
export async function GET() {
  const denied = await unauthorized();
  if (denied) return denied;
  try {
    return Response.json({ scan: diskScan(), docker: await dockerSpace() });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
