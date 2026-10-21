import { folderUsage } from '@/lib/disk-usage';
import { unauthorized } from '@/lib/session';

/** A folder on the server, ?path= absolute: its size and what's in it. */
export async function GET(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const path = new URL(request.url).searchParams.get('path') ?? '/';
  try {
    return Response.json(await folderUsage(path));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
