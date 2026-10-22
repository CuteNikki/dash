'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import {
  composeTemplate,
  NewService,
  type NewServiceInput,
} from '@/lib/new-service';
import { readRunStream } from '@/lib/read-run-stream';

import { CodeEditor } from '@/components/code-editor';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Adds a service: a name, a compose file (a template to start from, following
 * the name until it's edited) and .env, and optionally a domain for Caddy to
 * send to one of its services. What the server does shows as it goes; if it
 * fails, the form stays as it was, to fix and try again.
 */
export function NewServiceDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [running, setRunning] = useState(false);
  return (
    // Not closed while it's adding, so its outcome isn't missed
    <Dialog open={open} onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className='max-h-[calc(100%-2rem)] sm:max-w-3xl'>
        {open && (
          <NewServiceForm
            running={running}
            setRunning={setRunning}
            onCreated={() => {
              onCreated();
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewServiceForm({
  running,
  setRunning,
  onCreated,
}: {
  running: boolean;
  setRunning: (running: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  // The template's, following the name, until edited
  const [compose, setCompose] = useState<string>();
  const [env, setEnv] = useState('');
  const [domain, setDomain] = useState('');
  // The name's, until edited
  const [service, setService] = useState<string>();
  const [port, setPort] = useState('');
  const [error, setError] = useState<string>();
  const [output, setOutput] = useState<string[]>();

  const input: NewServiceInput = {
    name,
    compose: compose ?? composeTemplate(name.trim()),
    env,
    domain,
    service: service ?? name.trim(),
    port,
  };

  async function create() {
    const parsed = NewService.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setOutput([]);
    setRunning(true);
    try {
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const exitCode = await readRunStream(res, (line) =>
        setOutput((lines) => [...(lines ?? []), line])
      );
      if (exitCode === 0) {
        toast.success(`Added ${parsed.data.name}`);
        onCreated();
      } else {
        toast.error(`Couldn't add ${parsed.data.name}`, {
          description: 'See what happened below the form',
        });
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <form
      className='flex min-h-0 flex-col gap-6'
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <DialogHeader>
        <DialogTitle>New service</DialogTitle>
        <DialogDescription>
          A folder of its own in ~/services, started with Docker Compose, and
          for a domain, a site in Caddy.
        </DialogDescription>
      </DialogHeader>

      <fieldset
        disabled={running}
        className='-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1'
      >
        <div className='flex flex-col gap-2'>
          <Label htmlFor='service-name'>Name</Label>
          <Input
            id='service-name'
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='my-app'
            className='font-mono'
            autoComplete='off'
            required
          />
        </div>
        <div className='flex flex-col gap-2'>
          <span className='text-xs/relaxed font-medium'>Compose file</span>
          <div className='h-64'>
            <CodeEditor
              value={input.compose}
              onChange={setCompose}
              fileName='docker-compose.yml'
              label='Compose file'
              readOnly={running}
            />
          </div>
        </div>
        <div className='flex flex-col gap-2'>
          <span className='text-xs/relaxed font-medium'>
            .env <span className='text-muted-foreground'>(optional)</span>
          </span>
          <div className='h-24'>
            <CodeEditor
              value={env}
              onChange={setEnv}
              fileName='.env'
              label='.env'
              readOnly={running}
            />
          </div>
        </div>
        <div className='grid gap-4 sm:grid-cols-[1fr_10rem_6rem]'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='service-domain'>
              Domain <span className='text-muted-foreground'>(optional)</span>
            </Label>
            <Input
              id='service-domain'
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder='app.niso.moe'
              className='font-mono'
              autoComplete='off'
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='service-upstream'>Service</Label>
            <Input
              id='service-upstream'
              value={input.service}
              onChange={(e) => setService(e.target.value)}
              disabled={!domain.trim()}
              className='font-mono'
              autoComplete='off'
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='service-port'>Port</Label>
            <Input
              id='service-port'
              value={port}
              onChange={(e) => setPort(e.target.value)}
              disabled={!domain.trim()}
              inputMode='numeric'
              placeholder='3000'
              className='font-mono'
              autoComplete='off'
            />
          </div>
        </div>
        {error && <p className='text-destructive'>{error}</p>}
        {output && (
          <pre
            aria-live='polite'
            className='max-h-40 shrink-0 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed whitespace-pre-wrap text-muted-foreground'
          >
            {output.length ? output.join('\n') : 'Starting…'}
          </pre>
        )}
      </fieldset>

      <DialogFooter>
        <Button type='submit' disabled={running}>
          {running ? 'Adding…' : 'Add service'}
        </Button>
      </DialogFooter>
    </form>
  );
}
