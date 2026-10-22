import { listContainers } from '@/lib/docker';
import { imageName } from '@/lib/format';
import { postgresDatabases } from '@/lib/postgres';
import { unauthorized } from '@/lib/session';

/** A Postgres container's databases: each one's name, size and connections. */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/containers/[id]/databases'>
) {
  const denied = await unauthorized();
  if (denied) return denied;
  const { id } = await params;
  const container = (await listContainers()).find((c) => c.id === id);
  if (!container || imageName(container.image) !== 'postgres') {
    return Response.json(
      { error: 'This container isn’t a Postgres server' },
      { status: 404 }
    );
  }
  try {
    return Response.json(await postgresDatabases(id));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
