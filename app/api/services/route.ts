import { getDashboard } from '@/lib/services';
import { unauthorized } from '@/lib/session';

export async function GET() {
  return (await unauthorized()) ?? Response.json(await getDashboard());
}
