'use client';

import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { toast } from 'sonner';
import useSWR, { useSWRConfig } from 'swr';

import {
  ChevronRightIcon,
  ChevronsDownUpIcon,
  CopyIcon,
  FileIcon,
  FilePlusIcon,
  FolderIcon,
  FolderPlusIcon,
  PencilIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';

import { createEntry, deleteEntry, renameEntry } from '@/actions/files';
import { fetcher } from '@/lib/fetcher';
import type { HostEntry } from '@/lib/host-files';
import { cn } from '@/lib/utils';

import { TreeSkeleton } from '@/components/skeletons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type Kind = HostEntry['kind'];

/** A name being typed into the tree: a new entry's, or an entry's new one. */
type Draft =
  | { action: 'create'; kind: Kind; folder: string }
  | { action: 'rename'; kind: Kind; path: string };

type Tree = {
  chosen: string;
  unsaved: Set<string>;
  open: Set<string>;
  toggle: (folder: string) => void;
  draft?: Draft;
  /** Starts typing a name, opening the folder a new entry goes in */
  startDraft: (draft: Draft) => void;
  /**
   * Keeps the name, or drops it without one. From Enter or Escape, focus goes
   * back to the entry's row, as in VS Code, so F2 works again straight away.
   */
  finishDraft: (name: string | undefined, fromKey: boolean) => void;
  askDelete: (path: string, kind: Kind) => void;
  /** The compose file at or inside this path, which Docker finds the stack by */
  composeIn: (path: string) => string | undefined;
  copyPath: (path: string) => void;
  onChoose: (path: string) => void;
  folderKey: (folder: string) => string;
};

const TreeContext = createContext<Tree | null>(null);

function useTree() {
  return use(TreeContext)!;
}

const parentOf = (path: string) => path.split('/').slice(0, -1).join('/');
const nameOf = (path: string) => path.split('/').at(-1)!;
/** Whether `path` is `folder` or lies inside it */
export const isWithin = (folder: string, path: string) =>
  path === folder || path.startsWith(`${folder}/`);

/**
 * A stack's folder as a tree, with what VS Code's explorer offers: new files
 * and folders, rename (F2), delete (Delete), copying paths, collapsing it all.
 * Right-click an entry, or the space below them for the stack's own folder.
 */
export function FileTree({
  containerId,
  base,
  dir,
  compose,
  chosen,
  unsaved,
  onChoose,
  onRenamed,
  onDeleted,
  keysFrom,
}: {
  containerId: string;
  /** The stack's files API */
  base: string;
  /** The stack's folder on the server */
  dir: string;
  /** Its compose files, relative to it */
  compose: string[];
  chosen: string;
  unsaved: Set<string>;
  onChoose: (path: string) => void;
  onRenamed: (from: string, to: string) => void;
  onDeleted: (path: string) => void;
  /** Where F2 renames: the row it's pressed on, or else the open file, as from its editor */
  keysFrom: React.RefObject<HTMLElement | null>;
}) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft>();
  const [deleting, setDeleting] = useState<{ path: string; kind: Kind }>();
  const [pending, startTransition] = useTransition();
  // While a name's on its way to the server, as Enter and then leaving the
  // field would otherwise send it twice
  const sending = useRef(false);
  // The row to focus once it's drawn, after a name's been typed from the keyboard
  const focusNext = useRef<string>(undefined);
  useEffect(() => {
    const path = focusNext.current;
    if (path === undefined) return;
    const row = keysFrom.current?.querySelector<HTMLElement>(
      `[data-path="${CSS.escape(path)}"]`
    );
    if (row) {
      row.focus();
      focusNext.current = undefined;
    }
  });

  const folderKey = (folder: string) =>
    `${base}/tree?path=${encodeURIComponent(folder)}`;
  const refresh = (folder: string) => mutate(folderKey(folder));
  const composeIn = (path: string) => compose.find((c) => isWithin(path, c));
  /** What moving a compose file does, said once it's done or in asking */
  const stackWarning = (file: string) =>
    `Docker finds this stack by ${file}, so Redeploy won’t work until there’s a ${nameOf(file)} there again.`;
  // Where the toolbar's New File and New Folder put things: beside the open file
  const here = parentOf(chosen);

  function toggle(folder: string) {
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }

  function startDraft(next: Draft) {
    // The folder it's in opens, with the ones around it, so the name shows
    const folder = next.action === 'create' ? next.folder : parentOf(next.path);
    setOpen((o) => {
      const opened = new Set(o);
      for (let f = folder; f; f = parentOf(f)) opened.add(f);
      return opened;
    });
    setDraft(next);
  }

  function finishDraft(name: string | undefined, fromKey: boolean) {
    const current = draft;
    const trimmed = name?.trim();
    // Nothing typed, or the name unchanged, leaves things as they were
    if (
      !current ||
      !trimmed ||
      (current.action === 'rename' && trimmed === nameOf(current.path))
    ) {
      if (fromKey && current) {
        focusNext.current =
          current.action === 'rename' ? current.path : current.folder;
      }
      setDraft(undefined);
      return;
    }
    if (sending.current) return;
    sending.current = true;
    startTransition(async () => {
      try {
        const path = await sendDraft(current, trimmed);
        if (fromKey && path) focusNext.current = path;
      } finally {
        sending.current = false;
      }
    });
  }

  /**
   * Creates or renames the entry, giving its path; on failure, says why and
   * keeps the name to fix.
   */
  async function sendDraft(
    current: Draft,
    name: string
  ): Promise<string | undefined> {
    if (current.action === 'create') {
      const result = await createEntry(
        containerId,
        current.folder,
        name,
        current.kind
      );
      if (!result.ok) return void toast.error(result.error);
      const path = current.folder ? `${current.folder}/${name}` : name;
      await refresh(current.folder);
      setDraft(undefined);
      if (current.kind === 'file') onChoose(path);
      else setOpen((o) => new Set(o).add(path));
      return path;
    }
    const result = await renameEntry(containerId, current.path, name);
    if (!result.ok) return void toast.error(result.error);
    const folder = parentOf(current.path);
    const path = folder ? `${folder}/${name}` : name;
    await refresh(folder);
    setDraft(undefined);
    // Open folders inside it stay open under the new name
    setOpen(
      (o) =>
        new Set(
          [...o].map((p) =>
            isWithin(current.path, p) ? path + p.slice(current.path.length) : p
          )
        )
    );
    onRenamed(current.path, path);
    const moved = composeIn(current.path);
    if (moved)
      toast.warning(`Renamed ${nameOf(current.path)}`, {
        description: stackWarning(moved),
      });
    return path;
  }

  // Listens afresh after each render, so F2 always goes to the current file
  useEffect(() => {
    const el = keysFrom.current;
    if (!el) return;
    function onKeyDown(e: KeyboardEvent) {
      // Not while a name's being typed, where F2 means nothing
      if (e.key !== 'F2' || e.target instanceof HTMLInputElement) return;
      const row = (e.target as Element).closest<HTMLElement>('[data-path]');
      const path = row?.dataset.path ?? chosen;
      e.preventDefault();
      startDraft({
        action: 'rename',
        kind: (row?.dataset.kind as Kind | undefined) ?? 'file',
        path,
      });
    }
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  });

  function confirmDelete() {
    const target = deleting;
    if (!target) return;
    startTransition(async () => {
      const result = await deleteEntry(containerId, target.path);
      if (!result.ok) return void toast.error(result.error);
      await refresh(parentOf(target.path));
      setOpen((o) => new Set([...o].filter((p) => !isWithin(target.path, p))));
      setDeleting(undefined);
      onDeleted(target.path);
      toast.success(`Deleted ${nameOf(target.path)}`);
    });
  }

  async function copyPath(path: string) {
    await navigator.clipboard.writeText(path);
    toast.success('Copied', { description: path });
  }

  const tree: Tree = {
    chosen,
    unsaved,
    open,
    toggle,
    draft,
    startDraft,
    finishDraft,
    askDelete: (path, kind) => setDeleting({ path, kind }),
    composeIn,
    copyPath: (path) => copyPath(`${dir}/${path}`),
    onChoose,
    folderKey,
  };

  return (
    <TreeContext value={tree}>
      <div className='flex min-h-full flex-col'>
        <div className='flex items-center gap-0.5 py-0.5 pr-0.5 pl-2'>
          <span className='mr-auto truncate font-medium text-muted-foreground'>
            {nameOf(dir)}
          </span>
          <ToolbarButton
            label='New File'
            onClick={() =>
              startDraft({ action: 'create', kind: 'file', folder: here })
            }
          >
            <FilePlusIcon />
          </ToolbarButton>
          <ToolbarButton
            label='New Folder'
            onClick={() =>
              startDraft({ action: 'create', kind: 'dir', folder: here })
            }
          >
            <FolderPlusIcon />
          </ToolbarButton>
          <ToolbarButton
            label='Refresh'
            onClick={() =>
              mutate((key) => typeof key === 'string' && key.startsWith(base))
            }
          >
            <RefreshCwIcon />
          </ToolbarButton>
          <ToolbarButton
            label='Collapse All'
            onClick={() => setOpen(new Set())}
          >
            <ChevronsDownUpIcon />
          </ToolbarButton>
        </div>
        <Folder path='' depth={0} />
        {/* The space below the entries stands for the stack's own folder */}
        <ContextMenu modal={false}>
          <ContextMenuTrigger className='min-h-8 flex-1' />
          <ContextMenuContent onCloseAutoFocus={keepFocus}>
            <NewItems folder='' />
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => copyPath(dir)}>
              <CopyIcon />
              Copy Path
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>

      <AlertDialog
        open={deleting !== undefined}
        onOpenChange={(o) => !o && !pending && setDeleting(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleting && nameOf(deleting.path)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.kind === 'dir'
                ? 'The folder and everything in it are deleted from the server. '
                : 'The file is deleted from the server. '}
              This can’t be undone.
              {deleting && composeIn(deleting.path) && (
                <> {stackWarning(composeIn(deleting.path)!)}</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={pending}
              onClick={(e) => {
                // Stays open until the server's done, in case it can't
                e.preventDefault();
                confirmDelete();
              }}
            >
              <Trash2Icon />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TreeContext>
  );
}

/**
 * For a menu: leaves focus where its item put it, such as on a name to type,
 * rather than moving it back to what was right-clicked. The menus are also
 * not modal, as a modal one holds focus while it closes and would take it
 * straight back from that name.
 */
function keepFocus(e: Event) {
  e.preventDefault();
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** New File and New Folder, for putting them in `folder`. */
function NewItems({ folder }: { folder: string }) {
  const { startDraft } = useTree();
  return (
    <>
      <ContextMenuItem
        onSelect={() => startDraft({ action: 'create', kind: 'file', folder })}
      >
        <FilePlusIcon />
        New File…
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => startDraft({ action: 'create', kind: 'dir', folder })}
      >
        <FolderPlusIcon />
        New Folder…
      </ContextMenuItem>
    </>
  );
}

/** Each level steps in by one gap width, from the theme's spacing. */
function indentFor(depth: number) {
  return { paddingLeft: `calc(var(--spacing) * ${1 + depth * 4})` };
}

/** A folder's entries, its subfolders loading when they're opened. */
function Folder({ path, depth }: { path: string; depth: number }) {
  const { folderKey, draft } = useTree();
  const { data: entries, error } = useSWR<HostEntry[]>(
    folderKey(path),
    fetcher,
    { revalidateOnFocus: false }
  );
  const indent = indentFor(depth);

  if (error) {
    return (
      <p className='p-1 text-muted-foreground' style={indent}>
        {error.message}
      </p>
    );
  }
  if (!entries) {
    return <TreeSkeleton rows={depth === 0 ? 10 : 3} indent={indent} />;
  }

  const creating =
    draft?.action === 'create' && draft.folder === path ? draft : undefined;

  return (
    <ul>
      {creating && (
        <li>
          <NameInput kind={creating.kind} depth={depth} />
        </li>
      )}
      {entries.map((entry) => (
        <Entry
          key={entry.name}
          entry={entry}
          path={path ? `${path}/${entry.name}` : entry.name}
          depth={depth}
        />
      ))}
    </ul>
  );
}

const ROW =
  'flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-background/60 aria-[current=page]:bg-background';

function Entry({
  entry,
  path,
  depth,
}: {
  entry: HostEntry;
  path: string;
  depth: number;
}) {
  const tree = useTree();
  const isOpen = tree.open.has(path);
  const isDir = entry.kind === 'dir';
  const rename = () =>
    tree.startDraft({ action: 'rename', kind: entry.kind, path });
  const remove = () => tree.askDelete(path, entry.kind);

  const renaming = tree.draft?.action === 'rename' && tree.draft.path === path;
  // The full name, for one too long for the tree
  const nameRef = useRef<HTMLSpanElement>(null);
  const [showName, setShowName] = useState(false);

  return (
    <li>
      {renaming ? (
        <NameInput kind={entry.kind} depth={depth} name={entry.name} />
      ) : (
        <Tooltip
          open={showName}
          onOpenChange={(o) => setShowName(o && isCutOff(nameRef.current))}
        >
          <ContextMenu modal={false}>
            <TooltipTrigger asChild>
              <ContextMenuTrigger asChild>
                <button
                  type='button'
                  style={indentFor(depth)}
                  aria-expanded={isDir ? isOpen : undefined}
                  aria-current={path === tree.chosen ? 'page' : undefined}
                  onClick={() =>
                    isDir ? tree.toggle(path) : tree.onChoose(path)
                  }
                  // A folder's clicks open and close it, so only files
                  onDoubleClick={() => !isDir && rename()}
                  data-path={path}
                  data-kind={entry.kind}
                  onKeyDown={(e) => {
                    if (e.key !== 'Delete') return;
                    e.preventDefault();
                    remove();
                  }}
                  className={ROW}
                >
                  <EntryIcon kind={entry.kind} open={isOpen} />
                  <span ref={nameRef} className='truncate'>
                    {entry.name}
                  </span>
                  {tree.unsaved.has(path) && (
                    <span
                      aria-label='Not saved'
                      className='ml-auto size-1.5 shrink-0 rounded-full bg-foreground'
                    />
                  )}
                </button>
              </ContextMenuTrigger>
            </TooltipTrigger>
            <ContextMenuContent onCloseAutoFocus={keepFocus}>
              {isDir && (
                <>
                  <NewItems folder={path} />
                  <ContextMenuSeparator />
                </>
              )}
              <ContextMenuItem onSelect={rename}>
                <PencilIcon />
                Rename…
                <ContextMenuShortcut>F2</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem variant='destructive' onSelect={remove}>
                <Trash2Icon />
                Delete
                <ContextMenuShortcut>Del</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => tree.copyPath(path)}>
                <CopyIcon />
                Copy Path
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() =>
                  navigator.clipboard
                    .writeText(path)
                    .then(() => toast.success('Copied', { description: path }))
                }
              >
                <CopyIcon />
                Copy Relative Path
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <TooltipContent side='right'>{entry.name}</TooltipContent>
        </Tooltip>
      )}
      {isDir && isOpen && <Folder path={path} depth={depth + 1} />}
    </li>
  );
}

/** Whether text is cut off at its box's edge. */
function isCutOff(el: HTMLElement | null) {
  return !!el && el.scrollWidth > el.clientWidth;
}

/** A folder's arrow, or the space for one, then its icon. */
function EntryIcon({ kind, open }: { kind: Kind; open?: boolean }) {
  return (
    <>
      {kind === 'dir' ? (
        <ChevronRightIcon
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90'
          )}
        />
      ) : (
        <span className='size-3.5 shrink-0' />
      )}
      {kind === 'dir' ? (
        <FolderIcon className='size-3.5 shrink-0 text-muted-foreground' />
      ) : (
        <FileIcon className='size-3.5 shrink-0 text-muted-foreground' />
      )}
    </>
  );
}

/**
 * A row to type a name in, where the entry is or will be. Enter or leaving
 * it keeps the name; Escape drops it. Renaming a file starts with the part
 * before its extension selected, as in VS Code.
 */
function NameInput({
  kind,
  depth,
  name = '',
}: {
  kind: Kind;
  depth: number;
  name?: string;
}) {
  const { finishDraft } = useTree();
  const field = useRef<HTMLInputElement>(null);
  // Once Enter or Escape has finished it, the blur as the field goes away
  // mustn't finish it again
  const finished = useRef(false);

  // Escape drops the name rather than closing the dialog the tree is in. The
  // dialog hears Escape on the document before the field does, so the field
  // listens on the window, which hears it first.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.target !== field.current) return;
      e.preventDefault();
      e.stopPropagation();
      finished.current = true;
      finishDraft(undefined, true);
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () =>
      window.removeEventListener('keydown', onKeyDown, { capture: true });
  });

  return (
    <div style={indentFor(depth)} className={cn(ROW, 'hover:bg-transparent')}>
      <EntryIcon kind={kind} />
      <input
        ref={field}
        autoFocus
        defaultValue={name}
        aria-label={kind === 'dir' ? 'Folder name' : 'File name'}
        spellCheck={false}
        onFocus={(e) => {
          const dot = e.currentTarget.value.lastIndexOf('.');
          e.currentTarget.setSelectionRange(
            0,
            kind === 'file' && dot > 0 ? dot : e.currentTarget.value.length
          );
        }}
        onKeyDown={(e) => {
          // Typing again, as after a name the server refused, starts afresh
          finished.current = e.key === 'Enter';
          if (e.key !== 'Enter') return;
          e.preventDefault();
          finishDraft(e.currentTarget.value, true);
        }}
        onBlur={(e) => {
          if (finished.current) return;
          const name = e.currentTarget.value;
          // Once focus has landed where it was going: taking the field away
          // while focus is still on its way out leaves nothing focused, and
          // the dialog the tree is in then takes focus back to itself
          setTimeout(() => finishDraft(name, false));
        }}
        className='min-w-0 flex-1 rounded-sm bg-background px-1 outline-1 outline-ring'
      />
    </div>
  );
}
