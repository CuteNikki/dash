'use client';

import { useState } from 'react';

import { ArrowRightIcon, LoaderIcon } from 'lucide-react';

import { lookAtRepository } from '@/actions/git';
import type { GitSourceInput, RepoLook } from '@/lib/stacks/git-import';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * A git repository to clone the new service from, looked at first to fill in
 * the form: its compose file, its example .env, its Dockerfile's port. What
 * was looked at is what's cloned, so changing either field asks for another
 * look.
 */
export function GitImport({
  onLookAction,
  onClearAction,
}: {
  onLookAction: (source: GitSourceInput, look: RepoLook) => void;
  /** The repository or branch changed since it was looked at */
  onClearAction: () => void;
}) {
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string>();
  const [found, setFound] = useState<RepoLook>();

  async function look() {
    setLooking(true);
    setError(undefined);
    try {
      const result = await lookAtRepository({ url, branch });
      if (result.ok && 'look' in result) {
        setFound(result.look);
        onLookAction(
          { url: url.trim(), branch: result.look.branch },
          result.look
        );
      } else {
        setError(
          ('output' in result && result.output.trim().split('\n').at(-1)) ||
            "Couldn't look at it"
        );
      }
    } catch {
      setError("Couldn't look at it");
    } finally {
      setLooking(false);
    }
  }

  function edit(set: (value: string) => void, value: string) {
    set(value);
    if (found) {
      setFound(undefined);
      onClearAction();
    }
  }

  // Enter looks, rather than adding the service before it's been looked at
  function onEnter(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (url.trim() && !looking) void look();
  }

  return (
    <div className='flex flex-col gap-2'>
      <div className='grid items-end gap-4 sm:grid-cols-[1fr_10rem]'>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='git-url'>Repository</Label>
          <Input
            id='git-url'
            value={url}
            onChange={(e) => edit(setUrl, e.target.value)}
            onKeyDown={onEnter}
            placeholder='https://github.com/owner/repo'
            className='font-mono'
            autoComplete='off'
            spellCheck={false}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='git-branch'>Branch</Label>
          <Input
            id='git-branch'
            value={branch}
            onChange={(e) => edit(setBranch, e.target.value)}
            onKeyDown={onEnter}
            placeholder='its default'
            className='font-mono'
            autoComplete='off'
            spellCheck={false}
          />
        </div>
      </div>
      <div className='flex flex-wrap items-center gap-3'>
        <Button
          type='button'
          variant='outline'
          disabled={!url.trim() || looking}
          onClick={() => void look()}
        >
          {looking ? (
            <LoaderIcon className='animate-spin' />
          ) : (
            <ArrowRightIcon />
          )}
          Look at it
        </Button>
        {error && <p className='text-destructive'>{error}</p>}
        {found && (
          <p className='text-muted-foreground'>
            {found.compose
              ? `Its ${found.compose.name} on ${found.branch}, below; left as it is unless it's edited.`
              : found.dockerfile
                ? `No compose file on ${found.branch}, so one that builds its Dockerfile, below.`
                : `No compose file or Dockerfile on ${found.branch}: write a compose file for it below.`}
          </p>
        )}
      </div>
    </div>
  );
}
