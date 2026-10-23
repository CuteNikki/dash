/**
 * At server start: keep a way to run work outside any request, and print the
 * setup code if the dashboard has no account yet.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { keepOutsideRequests } = await import('@/lib/background');
  keepOutsideRequests();
  const { hasAccount } = await import('@/lib/auth/session');
  const { setupCode } = await import('@/lib/auth/setup');
  if (!(await hasAccount())) setupCode();
}
