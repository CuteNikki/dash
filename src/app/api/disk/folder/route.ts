import { denied } from '@/lib/auth/access';
import { folderUsage } from '@/lib/host/disk-usage';

/** A folder on the server, ?path= absolute: its size and what's in it. */
export async function GET(request: Request) {
  const refused = await denied('server');
  if (refused) return refused;
  const path = new URL(request.url).searchParams.get('path') ?? '/';
  try {
    return Response.json(await folderUsage(path));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
