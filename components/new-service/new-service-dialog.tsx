'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import type { ConvertedRun } from '@/lib/docker-run';
import { NewService, type NewServiceInput } from '@/lib/new-service';
import { readRunStream } from '@/lib/read-run-stream';
import {
  blankTemplate,
  composeFor,
  type ServiceTemplate,
} from '@/lib/service-templates';

import { GroupField } from '@/components/dashboard/fields/group-field';
import { CodeEditor } from '@/components/editor/code-editor';
import { AddressField } from '@/components/new-service/address-field';
import { DockerRunImport } from '@/components/new-service/docker-run-import';
import { TemplatePicker } from '@/components/new-service/template-picker';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/**
 * Adds a service: picked from a template or an image, with a name, a group,
 * a compose file (the template's, following the name and group until it's
 * edited) and .env, and optionally a domain for Caddy to send to one of its
 * services. What the server does shows as it goes; if it fails, the form
 * stays as it was, to fix and try again.
 */
export function NewServiceDialog({
  open,
  groups,
  onClose,
  onCreated,
}: {
  open: boolean;
  /** The dashboard's groups, to put it in one */
  groups: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [running, setRunning] = useState(false);
  return (
    // Not closed while it's adding, so its outcome isn't missed
    <Dialog open={open} onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className='flex flex-col sm:max-w-3xl'>
        {open && (
          <NewServiceForm
            groups={groups}
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

/** The name a template suggests: its own, or its image's, as Compose takes it. */
function suggestedName(template: ServiceTemplate) {
  const name =
    template.id || (template.image.split('/').at(-1) ?? '').split(':')[0];
  // As Compose takes it: "changedetection.io" is "changedetection-io"
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

function NewServiceForm({
  groups,
  running,
  setRunning,
  onCreated,
}: {
  groups: string[];
  running: boolean;
  setRunning: (running: boolean) => void;
  onCreated: () => void;
}) {
  const [template, setTemplate] = useState(blankTemplate);
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  // The template's, following the name and group, until edited
  const [compose, setCompose] = useState<string>();
  const [env, setEnv] = useState('');
  const [domain, setDomain] = useState('');
  // The name's, until edited
  const [service, setService] = useState<string>();
  const [port, setPort] = useState('');
  // The name and port last filled in for you, which another fills in again;
  // one typed in stays
  const [filled, setFilled] = useState({ name: '', port: '' });
  // Where it starts from: a template, or a pasted docker run command
  const [source, setSource] = useState<'template' | 'run'>('template');
  const [error, setError] = useState<string>();
  const [output, setOutput] = useState<string[]>();

  const input: NewServiceInput = {
    name,
    compose: compose ?? composeFor(template, name.trim(), group.trim()),
    env,
    domain,
    service: service ?? name.trim(),
    port,
  };

  /**
   * Starts from another template: its compose file afresh, and its name,
   * group and port where they're still the last one's, not typed in
   */
  function pick(next: ServiceTemplate) {
    fill(suggestedName(next), next.port);
    if (!group.trim() || group.trim() === template.group) setGroup(next.group);
    setCompose(undefined);
    setTemplate(next);
  }

  /** Its compose file from a docker run command, as it stands, not following the name. */
  function fromRun(converted: ConvertedRun) {
    fill(converted.name, converted.port);
    setTemplate(blankTemplate());
    setCompose(converted.compose);
  }

  /** A name and port filled in for you, where you haven't typed your own. */
  function fill(nextName: string, nextPort: string) {
    if (!name.trim() || name.trim() === filled.name) setName(nextName);
    if (!port.trim() || port.trim() === filled.port) setPort(nextPort);
    setFilled({ name: nextName, port: nextPort });
  }

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
      className='contents'
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

      {/* The window is the one column everything's in, its heading too, so
          that when it must scroll, all of it does and nothing's pinned; the
          form and the fieldset, which disables every field while it's adding,
          are boxes of no size of their own */}
      <fieldset disabled={running} className='contents'>
        <ToggleGroup
          type='single'
          variant='segmented'
          value={source}
          // Picking the shown one again would unpick it; keep one picked
          onValueChange={(v) => v && setSource(v as typeof source)}
          aria-label='Start from'
        >
          <ToggleGroupItem value='template'>Template</ToggleGroupItem>
          <ToggleGroupItem value='run'>docker run</ToggleGroupItem>
        </ToggleGroup>
        {source === 'template' ? (
          <TemplatePicker picked={template} onPick={pick} />
        ) : (
          <DockerRunImport onConvert={fromRun} />
        )}
        <div className='grid gap-4 sm:grid-cols-2'>
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
            <Label htmlFor='service-group'>Group</Label>
            <GroupField
              id='service-group'
              value={group}
              groups={groups}
              onChange={setGroup}
            />
          </div>
        </div>
        {/* The one part that gives way when the window is short, down to
              half its height, before the window scrolls: it scrolls itself */}
        <div className='flex min-h-39 flex-col gap-2'>
          <span className='text-xs/relaxed font-medium'>Compose file</span>
          <div className='min-h-32 flex-1 basis-64'>
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
        <div className='grid items-start gap-4 sm:grid-cols-[1fr_10rem_6rem]'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='service-domain'>
              Address <span className='text-muted-foreground'>(optional)</span>
            </Label>
            <AddressField
              id='service-domain'
              onChange={setDomain}
              disabled={running}
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
