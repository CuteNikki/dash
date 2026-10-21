import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * A Markdown file as it reads on GitHub: headings, lists, tables, task lists
 * and code. HTML in the file is shown as text, never run.
 */
export function MarkdownPreview({ text }: { text: string }) {
  return (
    <div className='h-full overflow-auto rounded-lg bg-muted p-6'>
      <article className='prose prose-sm max-w-none prose-neutral dark:prose-invert'>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </article>
    </div>
  );
}
