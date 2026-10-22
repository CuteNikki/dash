import { createService } from '@/lib/create-service';
import { NewService } from '@/lib/new-service';
import { streamRun } from '@/lib/run-stream';
import { getDashboard } from '@/lib/services';
import { unauthorized } from '@/lib/session';

export async function GET() {
  return (await unauthorized()) ?? Response.json(await getDashboard());
}

/** Adds a service, streaming what it does; see createService. */
export async function POST(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const input = NewService.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return Response.json(
      { error: input.error.issues[0]?.message ?? 'That form isn’t right' },
      { status: 400 }
    );
  }
  return streamRun(() => createService(input.data));
}
