import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn('my-4 border-l-4 pl-4 text-muted-foreground', className)}
      {...withoutNode(props)}
    />
  ),
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
  img: ({ alt, className, ...props }) => (
    // A plain img: a README's images are any size, from anywhere, which
    // next/image would need to know beforehand. Asked for without a
    // referrer, as the file picks where they come from, and wherever that
    // is needn't learn the dashboard's address
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt ?? ''}
      className={cn('inline max-w-full', className)}
      {...withoutNode(props)}
      referrerPolicy='no-referrer'
    />
  ),
};

/**
 * A Markdown file as GitHub shows it, tables and task lists included. HTML
 * in the file is shown as text, never run.
 */
export function MarkdownPreview({ text }: { text: string }) {
  return (
    // The scroller sits inside the rounded box, as in the editor, so the box
    // clips its scrollbar to the corners
    <div className='h-full overflow-hidden rounded-lg bg-muted'>
      <div className='h-full overflow-auto p-6'>
        <article className='max-w-4xl text-sm/relaxed'>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {text}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
