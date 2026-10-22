import { checkDomain, siteDomains } from '@/lib/domains';
import { DOMAIN_PATTERN } from '@/lib/new-service';
import { unauthorized } from '@/lib/session';

/**
 * The domains a new service's address can end in; or with ?check=<domain>,
 * whether that one points at this server yet.
 */
export async function GET(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const check = new URL(request.url).searchParams.get('check')?.toLowerCase();
  if (check === undefined) return Response.json(await siteDomains());
  if (!DOMAIN_PATTERN.test(check)) {
    return Response.json({ error: 'That isn’t a domain' }, { status: 400 });
  }
  return Response.json(await checkDomain(check));
}
