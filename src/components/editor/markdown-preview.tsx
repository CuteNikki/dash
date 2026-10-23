import { createContext, useContext } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  InfoIcon,
  LightbulbIcon,
  MessageSquareWarningIcon,
  OctagonAlertIcon,
  TriangleAlertIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

import { HighlightedCode } from '@/components/editor/highlighting';

/**
 * An element's props without the Markdown node it's drawn from, which would
 * otherwise land on it as node="[object Object]".
 */
function withoutNode<P extends { node?: unknown }>(props: P): Omit<P, 'node'> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

/**
 * Where a picture the file names is fetched from: as it's written, or for
 * one in the stack, by a path from the file, where the stack's files are.
 */
const ImageSource = createContext<(src: string) => string>((src) => src);

/**
 * A picture's address in a Markdown file, from where the file is in its
 * stack: one of the stack's files by its path from the stack's folder, as
 * GitHub finds a README's pictures in its repository; or, for a web address
 * or the like, none. "docs/a.png" in "app/README.md" is "app/docs/a.png",
 * and "/docs/a.png" is from the stack's folder.
 */
export function stackImagePath(src: string, file: string) {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) return undefined;
  const [path] = src.split(/[?#]/);
  const from = path.startsWith('/') ? [] : file.split('/').slice(0, -1);
  const parts: string[] = [];
  for (const part of [...from, ...path.split('/')]) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

/** GitHub's alerts, "> [!WARNING]" and the rest: each one's title, icon and color. */
const ALERTS = {
  NOTE: { title: 'Note', icon: InfoIcon, tone: 'border-update text-update' },
  TIP: {
    title: 'Tip',
    icon: LightbulbIcon,
    tone: 'border-success text-success',
  },
  IMPORTANT: {
    title: 'Important',
    icon: MessageSquareWarningIcon,
    tone: 'border-foreground text-foreground',
  },
  WARNING: {
    title: 'Warning',
    icon: TriangleAlertIcon,
    tone: 'border-warning text-warning',
  },
  CAUTION: {
    title: 'Caution',
    icon: OctagonAlertIcon,
    tone: 'border-destructive text-destructive',
  },
} as const;

type Alert = keyof typeof ALERTS;

/** As much of Markdown's tree as finding alerts needs. */
type MdNode = {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hProperties?: Record<string, string> };
};

/**
 * Marks each quote that starts with "[!NOTE]" and the like as that alert,
 * for the blockquote below to draw, and takes the marker out of its text,
 * as GitHub does.
 */
function remarkAlerts() {
  const visit = (node: MdNode) => {
    if (node.type === 'blockquote') {
      const first = node.children?.[0];
      const text =
        first?.type === 'paragraph' ? first.children?.[0] : undefined;
      const match =
        text?.type === 'text'
          ? text.value?.match(/^\[!(\w+)\][ \t]*\n?/)
          : undefined;
      const kind = match?.[1].toUpperCase();
      if (text && match && kind && Object.hasOwn(ALERTS, kind)) {
        node.data = { hProperties: { 'data-alert': kind } };
        text.value = text.value!.slice(match[0].length);
      }
    }
    node.children?.forEach(visit);
  };
  return visit;
}

/**
 * How each Markdown element looks, after GitHub's README style: headings
 * with a rule under the big ones, indented lists, code on its own background,
 * and tables with borders.
 */
const components: Components = {
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        'mt-6 mb-4 border-b pb-2 text-2xl font-semibold first:mt-0',
        className
      )}
      {...withoutNode(props)}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        'mt-6 mb-4 border-b pb-2 text-xl font-semibold first:mt-0',
        className
      )}
      {...withoutNode(props)}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn('mt-6 mb-4 text-base font-semibold first:mt-0', className)}
      {...withoutNode(props)}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn('mt-6 mb-4 font-semibold', className)}
      {...withoutNode(props)}
    />
  ),
  p: ({ className, ...props }) => (
    <p className={cn('my-4 first:mt-0', className)} {...withoutNode(props)} />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn('font-medium underline underline-offset-4', className)}
      target='_blank'
      rel='noreferrer'
      {...withoutNode(props)}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn('my-4 flex list-disc flex-col gap-1 pl-8', className)}
      {...withoutNode(props)}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn('my-4 flex list-decimal flex-col gap-1 pl-8', className)}
      {...withoutNode(props)}
    />
  ),
  // Task lists ("- [x] done") keep their checkbox in place of the bullet
  li: ({ className, ...props }) => (
    <li
      className={cn(
        'has-[>input]:-ml-6 has-[>input]:list-none [&>input]:mr-2',
        className
      )}
      {...withoutNode(props)}
    />
  ),
  blockquote: ({ className, children, ...props }) => {
    const kind = (props as { 'data-alert'?: Alert })['data-alert'];
    if (!kind) {
      return (
        <blockquote
          className={cn(
            'my-4 border-l-4 pl-4 text-muted-foreground',
            className
          )}
          {...withoutNode(props)}
        >
          {children}
        </blockquote>
      );
    }
    // An alert: its kind as a title with its icon, in its color, the text
    // under it in the page's own
    const { title, icon: Icon, tone } = ALERTS[kind];
    return (
      <blockquote
        className={cn('my-4 border-l-4 py-1 pl-4', tone, className)}
        {...withoutNode(props)}
      >
        <p className='mb-2 flex items-center gap-2 font-medium [&_svg]:size-4'>
          <Icon />
          {title}
        </p>
        <div className='text-foreground [&>p:last-child]:mb-0'>{children}</div>
      </blockquote>
    );
  },
  hr: ({ className, ...props }) => (
    <hr className={cn('my-6', className)} {...withoutNode(props)} />
  ),
  // Inline code; inside a code block, the block styles it, and its text is
  // colored as its language is in the editor: ```ts, ```yaml, ```bash
  code: ({ className, children, ...props }) => {
    const language = className?.match(/language-(\S+)/)?.[1];
    return (
      <code
        className='rounded-sm bg-foreground/10 px-1 py-0.5 font-mono text-xs in-[pre]:bg-transparent in-[pre]:p-0'
        {...withoutNode(props)}
      >
        {language && typeof children === 'string' ? (
          <HighlightedCode text={children} language={language} />
        ) : (
          children
        )}
      </code>
    );
  },
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        'my-4 overflow-x-auto rounded-lg bg-surface p-4 font-mono text-xs/relaxed',
        className
      )}
      {...withoutNode(props)}
    />
  ),
  table: ({ className, ...props }) => (
    <div className='my-4 overflow-x-auto'>
      <table
        className={cn('border-collapse', className)}
        {...withoutNode(props)}
      />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn('border px-3 py-1.5 text-left font-semibold', className)}
      {...withoutNode(props)}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn('border px-3 py-1.5', className)}
      {...withoutNode(props)}
    />
  ),
  img: function Image({ alt, className, src, ...props }) {
    const source = useContext(ImageSource);
    return (
      // A plain img: a README's images are any size, from anywhere, which
      // next/image would need to know beforehand. Asked for without a
      // referrer, as the file picks where they come from, and wherever that
      // is needn't learn the dashboard's address
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={alt ?? ''}
        className={cn('inline max-w-full', className)}
        {...withoutNode(props)}
        src={typeof src === 'string' ? source(src) : undefined}
        referrerPolicy='no-referrer'
      />
    );
  },
};

/**
 * A Markdown file as GitHub shows it, tables, task lists and alerts
 * included, and pictures by where `imageSrc` says they are. HTML in the
 * file is shown as text, never run.
 */
export function MarkdownPreview({
  text,
  imageSrc = (src) => src,
}: {
  text: string;
  imageSrc?: (src: string) => string;
}) {
  return (
    // The scroller sits inside the rounded box, as in the editor, so the box
    // clips its scrollbar to the corners
    <div className='h-full overflow-hidden rounded-lg bg-muted'>
      <div className='h-full overflow-auto p-6'>
        <article className='max-w-4xl text-sm/relaxed'>
          <ImageSource value={imageSrc}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkAlerts]}
              components={components}
            >
              {text}
            </ReactMarkdown>
          </ImageSource>
        </article>
      </div>
    </div>
  );
}
