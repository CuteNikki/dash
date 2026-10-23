import { denied } from '@/lib/auth/access';
import { checkDomain, siteDomains } from '@/lib/stacks/domains';
import { DOMAIN_PATTERN } from '@/lib/stacks/new-service';

/**
 * The domains a new service's address can end in; or with ?check=<domain>,
 * whether that one points at this server yet.
 */
export async function GET(request: Request) {
  const refused = await denied('manage');
  if (refused) return refused;
  const check = new URL(request.url).searchParams.get('check')?.toLowerCase();
  if (check === undefined) return Response.json(await siteDomains());
  if (!DOMAIN_PATTERN.test(check)) {
    return Response.json({ error: "That isn't a domain" }, { status: 400 });
  }
  return Response.json(await checkDomain(check));
}
