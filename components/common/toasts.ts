import { toast } from 'sonner';

/**
 * Runs what a button started, saying in a toast when it failed outright, as
 * when dash doesn't answer while it restarts. Left to throw, it would reach
 * the page's error boundary and take the dashboard down with it.
 */
export async function attempt(failed: string, work: () => Promise<unknown>) {
  try {
    await work();
  } catch {
    toast.error(failed, {
      description: "dash didn't answer; try again in a moment",
    });
  }
}

/**
 * Copies text, saying so; where the browser won't, as over plain http where
 * there's no clipboard to write to, says to select it instead.
 */
export async function copyText(text: string, done: string, shown?: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done, { description: shown });
  } catch {
    toast.error("Couldn't copy; select it instead");
  }
}
