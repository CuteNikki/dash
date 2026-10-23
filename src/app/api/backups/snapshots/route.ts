import { denied } from '@/lib/auth/access';
import { backupSnapshots } from '@/lib/backups/state';

/** Every backup there is, read by restic, apart from the rest as it takes a moment. */
export async function GET() {
  return (await denied('server')) ?? Response.json(await backupSnapshots());
}
