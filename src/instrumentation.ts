/**
 * At server start: keep a way to run work outside any request, start keeping
 * a record of the server, and print the setup code if the dashboard has no
 * account yet.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { keepOutsideRequests } = await import('@/lib/background');
  keepOutsideRequests();
  const { monitorEnabled, startMonitor } =
    await import('@/lib/monitor/monitor');
  if (monitorEnabled()) startMonitor();
  const { hasAccount } = await import('@/lib/auth/session');
  const { setupCode } = await import('@/lib/auth/setup');
  if (!(await hasAccount())) setupCode();
}
