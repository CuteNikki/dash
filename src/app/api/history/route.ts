import { denied } from '@/lib/auth/access';
import { hostHistory } from '@/lib/monitor/history';
import { isHistoryRange } from '@/lib/monitor/ranges';

/** The server over ?range=1h, 6h, 24h, 7d or 30d, from the monitor's record, as HostHistory. */
export async function GET(request: Request) {
  const refused = await denied('server');
  if (refused) return refused;
  const range = new URL(request.url).searchParams.get('range');
  if (!isHistoryRange(range)) {
    return Response.json({ error: 'Unknown range' }, { status: 400 });
  }
  return Response.json(await hostHistory(range));
}
