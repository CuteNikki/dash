'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import { RocketIcon, SaveIcon, Undo2Icon } from 'lucide-react';

import { saveFile } from '@/actions/files';
import { fetcher } from '@/lib/fetcher';
import type { StackFile } from '@/lib/stack-files';
import { cn } from '@/lib/utils';

import { CodeEditor } from '@/components/code-editor';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type FilesResponse = { dir: string; files: StackFile[] };
type DeployLine = { stream?: string; line?: string; exitCode?: number };

/**
 * A stack's compose files and .env, to edit, check with Compose, save, and
 * redeploy the stack with.
 */
export function FilesPanel({
  containerId,
  onDeployed,
}: {
  containerId: string;
  onDeployed: () => void;
}) {
  const { data, error, mutate } = useSWR<FilesResponse>(
    `/api/containers/${containerId}/files`,
    fetcher,
    { revalidateOnFocus: false }
  );
  // Edited text by path; what's saved is in `data`
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [output, setOutput] = useState<string[]>();
  const [pending, startTransition] = useTransition();

  if (error) return <p className='text-muted-foreground'>{error.message}</p>;
  if (!data) return <p className='text-muted-foreground'>Loading files…</p>;

  const file = data.files.find((f) => f.path === chosen) ?? data.files[0];
  const saved = file.content ?? '';
  const text = edits[file.path] ?? saved;
  const changed = (f: StackFile) =>
    edits[f.path] !== undefined && edits[f.path] !== (f.content ?? '');

  function save(thenDeploy: boolean) {
    startTransition(async () => {
      setProblem(undefined);
      if (changed(file)) {
        const result = await saveFile(containerId, file.path, text);
        if (!result.ok) {
          setProblem(result.error);
          return;
        }
        await mutate();
        setEdits((e) => without(e, file.path));
        toast.success(`Saved ${file.name}`);
      }
      if (thenDeploy) await deploy();
    });
  }

  async function deploy() {
    setOutput([]);
    const res = await fetch(`/api/containers/${containerId}/deploy`, {
      method: 'POST',
    });
    if (!res.ok || !res.body) {
      setOutput([
        (await res.json().catch(() => null))?.error ?? res.statusText,
      ]);
      return;
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let rest = '';
    let exitCode: number | undefined;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const parts = (rest + value).split('\n');
      rest = parts.pop() ?? '';
      for (const part of parts.filter(Boolean)) {
        const entry: DeployLine = JSON.parse(part);
        if (entry.exitCode !== undefined) exitCode = entry.exitCode;
        else if (entry.line !== undefined) {
          setOutput((lines) => [...(lines ?? []), entry.line!]);
        }
      }
    }
    if (exitCode === 0) toast.success('Redeployed');
    else
      toast.error("Couldn't redeploy", {
        description: 'See its output below the file',
      });
    onDeployed();
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3'>
      <ToggleGroup
        type='single'
        variant='outline'
        value={file.path}
        onValueChange={(path) => path && setChosen(path)}
        aria-label='File'
        className='self-start'
      >
        {data.files.map((f) => (
          <ToggleGroupItem key={f.path} value={f.path} className='font-mono'>
            {f.name}
            {f.content === undefined && !changed(f) && (
              <span className='text-muted-foreground'>(new)</span>
            )}
            {changed(f) && (
              <span
                aria-label='Not saved'
                className='size-1.5 rounded-full bg-foreground'
              />
            )}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className='min-h-0 flex-1'>
        <CodeEditor
          key={file.path}
          value={text}
          onChange={(value) => setEdits((e) => ({ ...e, [file.path]: value }))}
          language={file.kind === 'compose' ? 'yaml' : undefined}
          label={file.name}
        />
      </div>

      {problem && (
        <pre
          role='alert'
          className='max-h-32 overflow-auto rounded-lg bg-destructive/10 p-3 font-mono text-xs/relaxed whitespace-pre-wrap text-destructive'
        >
          {problem}
        </pre>
      )}
      {output && (
        <pre
          aria-live='polite'
          className='max-h-40 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed whitespace-pre-wrap text-muted-foreground'
        >
          {output.length ? output.join('\n') : 'Redeploying…'}
        </pre>
      )}

      <div className='flex flex-wrap items-center gap-2'>
        <span className='mr-auto truncate font-mono text-muted-foreground'>
          {file.path}
        </span>
        <Button
          variant='ghost'
          disabled={pending || !changed(file)}
          onClick={() => {
            setEdits((e) => without(e, file.path));
            setProblem(undefined);
          }}
        >
          <Undo2Icon />
          Revert
        </Button>
        <Button
          variant='outline'
          disabled={pending || !changed(file)}
          onClick={() => save(false)}
        >
          <SaveIcon />
          Save
        </Button>
        <Button disabled={pending} onClick={() => save(true)}>
          <RocketIcon className={cn(pending && 'animate-pulse')} />
          {changed(file) ? 'Save & redeploy' : 'Redeploy'}
        </Button>
      </div>
    </div>
  );
}

/** The edits without one file's, once it's saved or reverted. */
function without(edits: Record<string, string>, path: string) {
  const rest = { ...edits };
  delete rest[path];
  return rest;
}
