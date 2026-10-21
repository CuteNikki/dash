/** At server start: print the setup code if the dashboard has no account yet. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { hasAccount } = await import('@/lib/session');
  const { setupCode } = await import('@/lib/setup');
  if (!(await hasAccount())) setupCode();
}
