'use client';

import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ChevronRightIcon, CornerDownLeftIcon } from 'lucide-react';

import { sendToConsole } from '@/actions/containers';

import { attempt } from '@/components/common/toasts';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';

/** Commands kept to go back to with the up arrow. */
const MAX_HISTORY = 100;

/**
 * Where to type into a container's console, as at its prompt: Enter sends
 * the command, and the up and down arrows go through those sent before.
 */
export function ConsoleInput({
  containerId,
  running,
  onSentAction,
}: {
  containerId: string;
  /** Only a running one takes commands */
  running: boolean;
  /** After a command went, so its reply shows */
  onSentAction: () => void;
}) {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  // Which of the history is shown, while going through it, and what was
  // being typed before, to come back to past the newest
  const browsing = useRef<{ at: number; draft: string }>(undefined);
  const [pending, startTransition] = useTransition();

  function send() {
    const sent = command.trim();
    if (!sent || pending) return;
    startTransition(() =>
      attempt("Couldn't send that", async () => {
        const result = await sendToConsole(containerId, sent);
        if (!result.ok) {
          toast.error("Couldn't send that", { description: result.error });
          return;
        }
        setHistory((old) =>
          [...old.filter((c) => c !== sent), sent].slice(-MAX_HISTORY)
        );
        browsing.current = undefined;
        setCommand('');
        onSentAction();
      })
    );
  }

  function go(step: -1 | 1) {
    const now = browsing.current;
    const at = (now?.at ?? history.length) + step;
    if (at < 0 || (!now && step === 1)) return;
    if (at >= history.length) {
      setCommand(now?.draft ?? '');
      browsing.current = undefined;
      return;
    }
    browsing.current = { at, draft: now?.draft ?? command };
    setCommand(history[at]);
  }

  return (
    <InputGroup className='font-mono'>
      <InputGroupAddon>
        <ChevronRightIcon />
      </InputGroupAddon>
      <InputGroupInput
        aria-label='Command'
        placeholder={
          running ? 'Type a command, then Enter' : 'Start it to type commands'
        }
        disabled={!running}
        autoComplete='off'
        spellCheck={false}
        value={command}
        onChange={(e) => {
          setCommand(e.target.value);
          browsing.current = undefined;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            send();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            go(e.key === 'ArrowUp' ? -1 : 1);
          }
        }}
      />
      <InputGroupAddon align='inline-end'>
        <InputGroupButton
          size='icon-xs'
          aria-label='Send'
          disabled={!running || pending || !command.trim()}
          onClick={send}
        >
          <CornerDownLeftIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
