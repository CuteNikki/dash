'use client';

import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import {
  EyeIcon,
  HammerIcon,
  PencilIcon,
  RocketIcon,
  SaveIcon,
  Undo2Icon,
} from 'lucide-react';

import { saveFile } from '@/actions/files';
import { fetcher } from '@/lib/fetcher';
import type { OpenedFile, StackInfo } from '@/lib/stack-files';
import { cn } from '@/lib/utils';

import { CodeEditor } from '@/components/code-editor';
import { FileTree, isWithin, TreeToolbar } from '@/components/file-tree';
import { MarkdownPreview } from '@/components/markdown-preview';
import {
  CodeSkeleton,
  TextSkeleton,
  TreeSkeleton,
} from '@/components/skeletons';
import { Button } from '@/components/ui/button';

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
  // Markdown files being previewed rather than edited
  const [previewed, setPreviewed] = useState<Set<string>>(new Set());
  const panel = useRef<HTMLDivElement>(null);

  const path = chosen ?? info?.compose[0];
  const { data: opened, mutate } = useSWR<OpenedFile>(
    path ? `${base}/content?path=${encodeURIComponent(path)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (error) return <p className='text-muted-foreground'>{error.message}</p>;
  if (!info || !path) return <FilesSkeleton />;

  const name = path.split('/').at(-1)!;
  const saved = opened?.content;
  const text = edits[path] ?? saved ?? '';
  const changed = edits[path] !== undefined && edits[path] !== saved;
  const unsaved = new Set(Object.keys(edits));
  // Markdown opens for editing, like any file, until switched to its preview
  const isMarkdown = /\.(md|markdown)$/i.test(name);
  const previewing = isMarkdown && previewed.has(path);

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
    <div ref={panel} className='flex min-h-0 flex-1 flex-col gap-3'>
      <div className='flex min-h-0 flex-1 flex-col gap-3 sm:flex-row'>
        <nav
          aria-label='Files'
          // Its scrollbar's room kept whether it scrolls or not, as is its
          // placeholder's, so the rows are the same width either way
          className='max-h-40 shrink-0 [scrollbar-gutter:stable] overflow-auto rounded-lg bg-muted p-1 sm:max-h-none sm:w-56'
        >
          <FileTree
            containerId={containerId}
            base={base}
            dir={info.dir}
            compose={info.compose}
            keysFrom={panel}
            chosen={path}
            unsaved={unsaved}
            onChoose={(p) => {
              setChosen(p);
              setProblem(undefined);
            }}
            onRenamed={(from, to) => {
              const move = (p: string) => movedPath(p, from, to);
              setChosen(move(path));
              setEdits((e) => mapKeys(e, move));
              setPreviewed((p) => new Set([...p].map(move)));
            }}
            onDeleted={(gone) => {
              const kept = (p: string) => !isWithin(gone, p);
              if (!kept(path)) setChosen(undefined);
              setEdits((e) =>
                Object.fromEntries(Object.entries(e).filter(([p]) => kept(p)))
              );
              setPreviewed((p) => new Set([...p].filter(kept)));
            }}
          />
        </nav>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          <div className='relative min-h-0 flex-1'>
            {opened === undefined ? (
              <CodeSkeleton />
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
            {isMarkdown && opened?.content !== undefined && (
              // A solid backing, as the outline button's own background is
              // see-through in dark mode and the file would show through it
              <div className='absolute top-3 right-4 rounded-md bg-background'>
                {/* Names the other view, the one it switches to */}
                <Button
                  variant='outline'
                  onClick={() =>
                    setPreviewed((e) => {
                      const next = new Set(e);
                      if (previewing) next.delete(path);
                      else next.add(path);
                      return next;
                    })
                  }
                >
                  {previewing ? <PencilIcon /> : <EyeIcon />}
                  {previewing ? 'Edit' : 'Preview'}
                </Button>
              </div>
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
        {/* Always there, so the buttons never move: off for a stack that
            uses others' images rather than building its own */}
        <Button
          variant='outline'
          disabled={pending || !info.builds}
          title={
            info.builds
              ? undefined
              : 'Its images are downloaded, not built here'
          }
          onClick={() => save('build')}
        >
          <HammerIcon />
          {changed && info.builds ? 'Save & rebuild' : 'Rebuild'}
        </Button>
        <Button disabled={pending} onClick={() => save('deploy')}>
          <RocketIcon className={cn(pending && 'animate-pulse')} />
          {changed ? 'Save & redeploy' : 'Redeploy'}
        </Button>
      </div>
    </div>
  );
}

/** Where a path is once `from` is renamed to `to`. */
function movedPath(path: string, from: string, to: string) {
  return isWithin(from, path) ? to + path.slice(from.length) : path;
}

function mapKeys<T>(record: Record<string, T>, map: (key: string) => string) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [map(key), value])
  );
}

/** The edits without one file's, once it's saved or reverted. */
function without(edits: Record<string, string>, path: string) {
  const rest = { ...edits };
  delete rest[path];
  return rest;
}

/** The tab's own layout while the stack is looked up, so nothing jumps after. */
function FilesSkeleton() {
  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3'>
      <div className='flex min-h-0 flex-1 flex-col gap-3 sm:flex-row'>
        <div className='max-h-40 shrink-0 [scrollbar-gutter:stable] overflow-hidden rounded-lg bg-muted p-1 sm:max-h-none sm:w-56'>
          <TreeToolbar />
          <TreeSkeleton />
        </div>
        <div className='min-h-0 min-w-0 flex-1'>
          <CodeSkeleton />
        </div>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='mr-auto'>
          <TextSkeleton className='w-64' />
        </span>
        <Button variant='ghost' disabled>
          <Undo2Icon />
          Revert
        </Button>
        <Button variant='outline' disabled>
          <SaveIcon />
          Save
        </Button>
        <Button variant='outline' disabled>
          <HammerIcon />
          Rebuild
        </Button>
        <Button disabled>
          <RocketIcon />
          Redeploy
        </Button>
      </div>
    </div>
  );
}
