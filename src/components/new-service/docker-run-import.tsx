'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ArrowRightIcon } from 'lucide-react';

import { useIssueText } from '@/i18n/use-issue-text';

import { convertRun, type ConvertedRun } from '@/lib/templates/docker-run';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * A `docker run` command pasted from an app's instructions, made into the
 * new service's compose file; what couldn't be carried over is said, rather
 * than dropped quietly.
 */
export function DockerRunImport({
  onConvertAction,
}: {
  onConvertAction: (converted: ConvertedRun) => void;
}) {
  const issueText = useIssueText();
  const t = useTranslations('newService');
  const [command, setCommand] = useState('');
  const [error, setError] = useState<string>();
  const [skipped, setSkipped] = useState<string[]>([]);

  function convert() {
    try {
      const converted = convertRun(command);
      setError(undefined);
      setSkipped(converted.skipped);
      onConvertAction(converted);
    } catch (e) {
      setError(issueText((e as Error).message));
      setSkipped([]);
    }
  }

  return (
    <div className='flex flex-col gap-2'>
      <Textarea
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        placeholder={
          'docker run -d --name app -p 8080:80 -v ./data:/data image'
        }
        aria-label={t('runCommand')}
        className='min-h-24 font-mono'
        spellCheck={false}
      />
      <div className='flex flex-wrap items-center gap-3'>
        <Button
          type='button'
          variant='outline'
          disabled={!command.trim()}
          onClick={convert}
        >
          <ArrowRightIcon />
          {t('makeCompose')}
        </Button>
        {error && <p className='text-destructive'>{error}</p>}
      </div>
      {skipped.length > 0 && (
        <p className='text-warning'>
          {t('notCarried')}{' '}
          <span className='font-mono'>{skipped.join(', ')}</span>
        </p>
      )}
    </div>
  );
}
