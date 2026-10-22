import { unauthorized } from '@/lib/auth/session';
import { processDetails } from '@/lib/host/processes';

/** One of the server's processes, looked at closely; 404 once it's ended. */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/processes/[pid]'>
) {
  const denied = await unauthorized();
  if (denied) return denied;
  const pid = Number((await params).pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    return Response.json({ error: 'Not a process id' }, { status: 400 });
  }
  try {
    const details = await processDetails(pid);
    if (!details) {
      return Response.json({ error: 'It has ended' }, { status: 404 });
    }
    return Response.json(details);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
