import { AccessError, denied, getAccess, refusal } from '@/lib/auth/access';
import { getDashboard } from '@/lib/dashboard/services';
import { streamRun } from '@/lib/docker/run-stream';
import { createService } from '@/lib/stacks/create-service';
import { NewService } from '@/lib/stacks/new-service';

/** The dashboard as whoever's signed in may see it. */
export async function GET() {
  const access = await getAccess();
  if (!access) return refusal(new AccessError(401));
  return Response.json(await getDashboard(access));
}

/** Adds a service, streaming what it does; see createService. */
export async function POST(request: Request) {
  const refused = await denied('manage');
  if (refused) return refused;
  const input = NewService.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return Response.json(
      { error: input.error.issues[0]?.message ?? 'That form isn’t right' },
      { status: 400 }
    );
  }
  return streamRun(() => createService(input.data));
}
