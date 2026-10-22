'use client';

import { useState } from 'react';

import { ArrowRightIcon } from 'lucide-react';

import { convertRun, type ConvertedRun } from '@/lib/templates/docker-run';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * A `docker run` command pasted from an app's instructions, made into the
 * new service's compose file; what couldn't be carried over is said, rather
 * than dropped quietly.
 */
export function DockerRunImport({
  onConvert,
}: {
  onConvert: (converted: ConvertedRun) => void;
}) {
  const [command, setCommand] = useState('');
  const [error, setError] = useState<string>();
  const [skipped, setSkipped] = useState<string[]>([]);

  function convert() {
    try {
      const converted = convertRun(command);
      setError(undefined);
      setSkipped(converted.skipped);
      onConvert(converted);
    } catch (e) {
      setError((e as Error).message);
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
        aria-label='docker run command'
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
          Make it a compose file
        </Button>
        {error && <p className='text-destructive'>{error}</p>}
      </div>
      {skipped.length > 0 && (
        <p className='text-warning'>
          Not carried over, to add by hand if it needs them:{' '}
          <span className='font-mono'>{skipped.join(', ')}</span>
        </p>
      )}
    </div>
  );
}
