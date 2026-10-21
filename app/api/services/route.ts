import { getServices } from '@/lib/services';

export async function GET() {
  return Response.json(await getServices());
}
