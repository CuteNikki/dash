'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  HammerIcon,
  RocketIcon,
  SaveIcon,
  Undo2Icon,
} from 'lucide-react';

import { saveFile } from '@/actions/files';
import { fetcher } from '@/lib/fetcher';
import type { HostEntry } from '@/lib/host-files';
import type { OpenedFile, StackInfo } from '@/lib/stack-files';
import { cn } from '@/lib/utils';

import { CodeEditor } from '@/components/code-editor';
import { MarkdownPreview } from '@/components/markdown-preview';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type DeployLine = { line?: string; exitCode?: number };

/**
 * The files of a service's stack: its folder as a tree, a file open beside
 * it, and Save (compose files and .env checked by Compose first), Redeploy,
 * and Rebuild for stacks that build their own image.
 */
export function FilesPanel({
  containerId,
  onDeployed,
}: {
  containerId: string;
  onDeployed: () => void;
}) {
  const base = `/api/containers/${containerId}/files`;
  const { data: info, error } = useSWR<StackInfo>(base, fetcher, {
    revalidateOnFocus: false,
  });
  const [chosen, setChosen] = useState<string>();
  // Edited text by path; saved text comes from the server
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  const [output, setOutput] = useState<string[]>();
  const [pending, startTransition] = useTransition();
  // Markdown files being edited rather than previewed
  const [editing, setEditing] = useState<Set<string>>(new Set());

  const path = chosen ?? info?.compose[0];
  const { data: opened, mutate } = useSWR<OpenedFile>(
    path ? `${base}/content?path=${encodeURIComponent(path)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (error) return <p className='text-muted-foreground'>{error.message}</p>;
  if (!info || !path) {
    return <p className='text-muted-foreground'>Loading files…</p>;
  }

  const name = path.split('/').at(-1)!;
  const saved = opened?.content;
  const text = edits[path] ?? saved ?? '';
  const changed = edits[path] !== undefined && edits[path] !== saved;
  const unsaved = new Set(Object.keys(edits));
  // Markdown opens as it reads, until switched to editing
  const isMarkdown = /\.(md|markdown)$/i.test(name);
  const previewing = isMarkdown && !editing.has(path);

  function save(then?: 'deploy' | 'build') {
    startTransition(async () => {
      setProblem(undefined);
      if (changed && path) {
        const result = await saveFile(containerId, path, text);
        if (!result.ok) {
          setProblem(result.error);
          return;
        }
        await mutate({ content: text });
        setEdits((e) => without(e, path));
        toast.success(`Saved ${name}`);
      }
      if (then) await deploy(then === 'build');
    });
  }

  async function deploy(build: boolean) {
    setOutput([]);
    const res = await fetch(
      `/api/containers/${containerId}/deploy${build ? '?build=1' : ''}`,
      { method: 'POST' }
    );
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
    if (exitCode === 0) {
      toast.success(build ? 'Rebuilt and redeployed' : 'Redeployed');
    } else {
      toast.error("Couldn't redeploy", {
        description: 'See its output below the file',
      });
    }
    onDeployed();
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3'>
      <div className='flex min-h-0 flex-1 flex-col gap-3 sm:flex-row'>
        <nav
          aria-label='Files'
          className='max-h-40 shrink-0 overflow-auto rounded-lg bg-muted p-1 sm:max-h-none sm:w-56'
        >
          <Folder
            base={base}
            path=''
            depth={0}
            chosen={path}
            unsaved={unsaved}
            onChoose={(p) => {
              setChosen(p);
              setProblem(undefined);
            }}
          />
        </nav>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col gap-2'>
          {isMarkdown && opened?.content !== undefined && (
            <ToggleGroup
              type='single'
              variant='outline'
              size='sm'
              value={previewing ? 'preview' : 'edit'}
              onValueChange={(v) =>
                v &&
                setEditing((e) => {
                  const next = new Set(e);
                  if (v === 'edit') next.add(path);
                  else next.delete(path);
                  return next;
                })
              }
              aria-label='Show'
              className='self-start'
            >
              <ToggleGroupItem value='preview'>Preview</ToggleGroupItem>
              <ToggleGroupItem value='edit'>Edit</ToggleGroupItem>
            </ToggleGroup>
          )}
          <div className='min-h-0 flex-1'>
            {opened === undefined ? (
              <p className='text-muted-foreground'>Opening {name}…</p>
            ) : opened.content === undefined ? (
              <p className='rounded-lg bg-muted p-3 text-muted-foreground'>
                {name}: {opened.reason}
              </p>
            ) : previewing ? (
              <MarkdownPreview text={text} />
            ) : (
              <CodeEditor
                key={path}
                value={text}
                onChange={(value) => setEdits((e) => ({ ...e, [path]: value }))}
                fileName={name}
                label={name}
              />
            )}
          </div>
        </div>
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
          data-slot='deploy-output'
          aria-live='polite'
          className='max-h-40 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed whitespace-pre-wrap text-muted-foreground'
        >
          {output.length ? output.join('\n') : 'Redeploying…'}
        </pre>
      )}

      <div className='flex flex-wrap items-center gap-2'>
        <span className='mr-auto truncate font-mono text-muted-foreground'>
          {info.dir}/{path}
        </span>
        <Button
          variant='ghost'
          disabled={pending || !changed}
          onClick={() => {
            setEdits((e) => without(e, path));
            setProblem(undefined);
          }}
        >
          <Undo2Icon />
          Revert
        </Button>
        <Button
          variant='outline'
          disabled={pending || !changed}
          onClick={() => save()}
        >
          <SaveIcon />
          Save
        </Button>
        {info.builds && (
          <Button
            variant='outline'
            disabled={pending}
            onClick={() => save('build')}
          >
            <HammerIcon />
            {changed ? 'Save & rebuild' : 'Rebuild'}
          </Button>
        )}
        <Button disabled={pending} onClick={() => save('deploy')}>
          <RocketIcon className={cn(pending && 'animate-pulse')} />
          {changed ? 'Save & redeploy' : 'Redeploy'}
        </Button>
      </div>
    </div>
  );
}

/** A folder's entries, its subfolders loading when they're opened. */
function Folder({
  base,
  path,
  depth,
  chosen,
  unsaved,
  onChoose,
}: {
  base: string;
  path: string;
  depth: number;
  chosen: string;
  unsaved: Set<string>;
  onChoose: (path: string) => void;
}) {
  const { data: entries, error } = useSWR<HostEntry[]>(
    `${base}/tree?path=${encodeURIComponent(path)}`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Each level steps in by one gap width, from the theme's spacing
  const indent = { paddingLeft: `calc(var(--spacing) * ${1 + depth * 4})` };

  if (error) {
    return (
      <p className='p-1 text-muted-foreground' style={indent}>
        {error.message}
      </p>
    );
  }
  if (!entries) {
    return (
      <p className='p-1 text-muted-foreground' style={indent}>
        …
      </p>
    );
  }

  return (
    <ul>
      {entries.map((entry) => {
        const full = path ? `${path}/${entry.name}` : entry.name;
        const isOpen = open.has(full);
        return (
          <li key={entry.name}>
            <button
              type='button'
              style={indent}
              aria-expanded={entry.kind === 'dir' ? isOpen : undefined}
              aria-current={full === chosen ? 'page' : undefined}
              onClick={() => {
                if (entry.kind === 'file') return onChoose(full);
                setOpen((o) => {
                  const next = new Set(o);
                  if (next.has(full)) next.delete(full);
                  else next.add(full);
                  return next;
                });
              }}
              className='flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-background/60 aria-[current=page]:bg-background aria-[current=page]:font-medium'
            >
              {entry.kind === 'dir' ? (
                <ChevronRightIcon
                  className={cn(
                    'size-3.5 shrink-0 text-muted-foreground transition-transform',
                    isOpen && 'rotate-90'
                  )}
                />
              ) : (
                <span className='size-3.5 shrink-0' />
              )}
              {entry.kind === 'dir' ? (
                <FolderIcon className='size-3.5 shrink-0 text-muted-foreground' />
              ) : (
                <FileIcon className='size-3.5 shrink-0 text-muted-foreground' />
              )}
              <span className='truncate'>{entry.name}</span>
              {unsaved.has(full) && (
                <span
                  aria-label='Not saved'
                  className='ml-auto size-1.5 shrink-0 rounded-full bg-foreground'
                />
              )}
            </button>
            {entry.kind === 'dir' && isOpen && (
              <Folder
                base={base}
                path={full}
                depth={depth + 1}
                chosen={chosen}
                unsaved={unsaved}
                onChoose={onChoose}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The edits without one file's, once it's saved or reverted. */
function without(edits: Record<string, string>, path: string) {
  const rest = { ...edits };
  delete rest[path];
  return rest;
}
