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
import { readRunStream } from '@/lib/docker/read-run-stream';
import type { OpenedFile, StackInfo } from '@/lib/docker/stack-files';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';

import { RunOutput } from '@/components/common/run-output';
import {
  CodeSkeleton,
  TextSkeleton,
  TreeSkeleton,
} from '@/components/common/skeletons';
import { attempt } from '@/components/common/toasts';
import { CodeEditor } from '@/components/editor/code-editor';
import { FileTree, isWithin, TreeToolbar } from '@/components/editor/file-tree';
import { MarkdownPreview } from '@/components/editor/markdown-preview';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/**
 * The files of a service's stack: its folder as a tree, a file open beside
 * it, and Save (compose files and .env checked by Compose first), Redeploy,
 * and Rebuild for stacks that build their own image.
 */
export function FilesPanel({
  containerId,
  onDeployedAction,
  onFilesChangedAction,
}: {
  containerId: string;
  onDeployedAction: () => void;
  /** After a file's saved, made, renamed or deleted, as its repository's status changes with it */
  onFilesChangedAction: () => void;
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
    startTransition(() =>
      attempt(
        changed
          ? `Couldn't save ${name}`
          : `Couldn't ${then === 'build' ? 'rebuild' : 'redeploy'}`,
        async () => {
          setProblem(undefined);
          if (changed && path) {
            const result = await saveFile(containerId, path, text);
            if (!result.ok) {
              setProblem(result.error);
              return;
            }
            await mutate({ content: text });
            // Only what was saved: the editor stays open while Compose checks
            // it, and anything typed meanwhile is still to save
            setEdits((e) => (e[path] === text ? without(e, path) : e));
            onFilesChangedAction();
            toast.success(`Saved ${name}`);
          }
          if (then) await deploy(then === 'build');
        }
      )
    );
  }

  async function deploy(build: boolean) {
    setOutput([]);
    const res = await fetch(
      `/api/containers/${containerId}/deploy${build ? '?build=1' : ''}`,
      { method: 'POST' }
    );
    const exitCode = await readRunStream(res, (line) =>
      setOutput((lines) => [...(lines ?? []), line])
    );
    if (exitCode === 0) {
      toast.success(build ? 'Rebuilt and redeployed' : 'Redeployed');
    } else {
      toast.error("Couldn't redeploy", {
        description: 'See its output below the file',
      });
    }
    onDeployedAction();
  }

  return (
    <div ref={panel} className='flex min-h-0 flex-1 flex-col gap-3'>
      <div className='flex min-h-0 flex-1 flex-col gap-3 sm:flex-row'>
        <nav
          aria-label='Files'
          // Its scrollbar's room kept whether it scrolls or not, as is its
          // placeholder's, so the rows are the same width either way
          className='max-h-40 shrink-0 scrollbar-gutter-stable overflow-auto rounded-lg bg-muted p-1 sm:max-h-none sm:w-56'
        >
          <FileTree
            containerId={containerId}
            base={base}
            dir={info.dir}
            compose={info.compose}
            keysFrom={panel}
            chosen={path}
            unsaved={unsaved}
            onChooseAction={(p) => {
              setChosen(p);
              setProblem(undefined);
            }}
            onRenamedAction={(from, to) => {
              const move = (p: string) => movedPath(p, from, to);
              setChosen(move(path));
              setEdits((e) => mapKeys(e, move));
              setPreviewed((p) => new Set([...p].map(move)));
            }}
            onChangedAction={onFilesChangedAction}
            onDeletedAction={(gone) => {
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
                onChangeAction={(value) =>
                  setEdits((e) => ({ ...e, [path]: value }))
                }
                fileName={name}
                label={name}
              />
            )}
            {isMarkdown && opened?.content !== undefined && (
              // A solid backing, as the track's own fill is see-through in
              // dark mode and the file would show through it
              <div className='absolute top-3 right-4 rounded-md bg-background'>
                <ToggleGroup
                  type='single'
                  variant='segmented'
                  value={previewing ? 'preview' : 'edit'}
                  // Picking the shown one again would unpick it; keep one picked
                  onValueChange={(v) =>
                    v &&
                    setPreviewed((e) => {
                      const next = new Set(e);
                      if (v === 'preview') next.add(path);
                      else next.delete(path);
                      return next;
                    })
                  }
                  aria-label='Show the file as'
                >
                  <ToggleGroupItem value='edit'>
                    <PencilIcon />
                    Edit
                  </ToggleGroupItem>
                  <ToggleGroupItem value='preview'>
                    <EyeIcon />
                    Preview
                  </ToggleGroupItem>
                </ToggleGroup>
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
      {output && <RunOutput lines={output} placeholder='Redeploying…' />}

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
        <div className='max-h-40 shrink-0 scrollbar-gutter-stable overflow-hidden rounded-lg bg-muted p-1 sm:max-h-none sm:w-56'>
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
