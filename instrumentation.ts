/** At server start: print the setup code if the dashboard has no account yet. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { hasAccount } = await import('@/lib/auth/session');
  const { setupCode } = await import('@/lib/auth/setup');
  if (!(await hasAccount())) setupCode();
}
