import { toast } from 'sonner';

/**
 * What these say, in the page's language, from ToastWords, which the layout
 * renders: plain functions, called from anywhere, can't ask for it themselves.
 */
const words = {
  noAnswer: "dash didn't answer; try again in a moment",
  copyFailed: "Couldn't copy; select it instead",
};

/** Sets what the toasts here say, as the page's language has it. */
export function setToastWords(next: typeof words) {
  Object.assign(words, next);
}

/**
 * Runs what a button started, saying in a toast when it failed outright, as
 * when the dashboard doesn't answer while it restarts. Left to throw, it would reach
 * the page's error boundary and take the dashboard down with it.
 */
export async function attempt(failed: string, work: () => Promise<unknown>) {
  try {
    await work();
  } catch {
    toast.error(failed, {
      description: words.noAnswer,
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
    toast.error(words.copyFailed);
  }
}
