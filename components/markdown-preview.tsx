import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * How each Markdown element looks, after GitHub's README style: headings
 * with a rule under the big ones, indented lists, code on its own background,
 * and tables with borders.
 */
const components: Components = {
  h1: (props) => (
    <h1
      className='mt-6 mb-4 border-b pb-2 text-2xl font-semibold first:mt-0'
      {...props}
    />
  ),
  h2: (props) => (
    <h2
      className='mt-6 mb-4 border-b pb-2 text-xl font-semibold first:mt-0'
      {...props}
    />
  ),
  h3: (props) => (
    <h3 className='mt-6 mb-4 text-base font-semibold first:mt-0' {...props} />
  ),
  h4: (props) => <h4 className='mt-6 mb-4 font-semibold' {...props} />,
  p: (props) => <p className='my-4 first:mt-0' {...props} />,
  a: (props) => (
    <a
      className='font-medium underline underline-offset-4'
      target='_blank'
      rel='noreferrer'
      {...props}
    />
  ),
  ul: (props) => (
    <ul className='my-4 flex list-disc flex-col gap-1 pl-8' {...props} />
  ),
  ol: (props) => (
    <ol className='my-4 flex list-decimal flex-col gap-1 pl-8' {...props} />
  ),
  // Task lists ("- [x] done") keep their checkbox in place of the bullet
  li: (props) => (
    <li
      className='has-[>input]:-ml-6 has-[>input]:list-none [&>input]:mr-2'
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className='my-4 border-l-4 pl-4 text-muted-foreground'
      {...props}
    />
  ),
  hr: (props) => <hr className='my-6' {...props} />,
  // Inline code; inside a code block, the block styles it
  code: (props) => (
    <code
      className='rounded-sm bg-foreground/10 px-1 py-0.5 font-mono text-xs in-[pre]:bg-transparent in-[pre]:p-0'
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className='my-4 overflow-x-auto rounded-lg bg-background p-4 font-mono text-xs/relaxed'
      {...props}
    />
  ),
  table: (props) => (
    <div className='my-4 overflow-x-auto'>
      <table className='border-collapse' {...props} />
    </div>
  ),
  th: (props) => (
    <th className='border px-3 py-1.5 text-left font-semibold' {...props} />
  ),
  td: (props) => <td className='border px-3 py-1.5' {...props} />,
  img: ({ alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ''} className='inline max-w-full' {...props} />
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
