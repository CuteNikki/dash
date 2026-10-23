import { recentAlerts } from '@/lib/alerts/read';
import { denied } from '@/lib/auth/access';

/** What the monitor finds wrong now, and lately, for those who see the server. */
export async function GET() {
  return (await denied('server')) ?? Response.json(await recentAlerts());
}
