'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { readRunStream } from '@/lib/docker/read-run-stream';
import {
  exposedPort,
  repoName,
  type ComposeName,
  type GitSourceInput,
  type RepoLook,
} from '@/lib/stacks/git-import';
import {
  DOMAIN_PATTERN,
  NewService,
  type NewServiceInput,
} from '@/lib/stacks/new-service';
import type { ConvertedRun } from '@/lib/templates/docker-run';
import {
  blankTemplate,
  composeFor,
  type ServiceTemplate,
} from '@/lib/templates/service-templates';

import { RunOutput } from '@/components/common/run-output';
import { attempt } from '@/components/common/toasts';
import { GroupField } from '@/components/dashboard/fields/group-field';
import { CodeEditor } from '@/components/editor/code-editor';
import { AddressField } from '@/components/new-service/address-field';
import { DockerRunImport } from '@/components/new-service/docker-run-import';
import { GitImport } from '@/components/new-service/git-import';
import { NewWebsiteForm } from '@/components/new-service/new-website-form';
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
 * Adds a service: picked from a template or an image, or cloned from a git
 * repository, with a name, a group,
 * a compose file (the template's, following the name, group and address
 * until it's edited) and .env, and optionally a domain for Caddy to send to
 * one of its services. What the server does shows as it goes; if it fails,
 * the form stays as it was, to fix and try again. Or a website hosted
 * elsewhere, as a tile.
 */
export function NewServiceDialog({
  open,
  groups,
  onCloseAction,
  onCreatedAction,
}: {
  open: boolean;
  /** The dashboard's groups, to put it in one */
  groups: string[];
  onCloseAction: () => void;
  onCreatedAction: () => void;
}) {
  const [running, setRunning] = useState(false);
  return (
    // Not closed while it's adding, so its outcome isn't missed
    <Dialog open={open} onOpenChange={(o) => !o && !running && onCloseAction()}>
      <DialogContent className='flex flex-col sm:max-w-3xl'>
        {open && (
          <NewServiceBody
            groups={groups}
            running={running}
            setRunning={setRunning}
            onCreated={() => {
              onCreatedAction();
              onCloseAction();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Source = 'template' | 'run' | 'git' | 'website';

/**
 * A service, or a website hosted elsewhere: both forms stay, one hidden, so
 * switching between them keeps what's been typed into each.
 */
function NewServiceBody({
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
  const [source, setSource] = useState<Source>('template');
  const picker = (
    <ToggleGroup
      type='single'
      variant='segmented'
      value={source}
      // Picking the shown one again would unpick it; keep one picked
      onValueChange={(v) => v && setSource(v as Source)}
      aria-label='Start from'
    >
      <ToggleGroupItem value='template'>Template</ToggleGroupItem>
      <ToggleGroupItem value='run'>docker run</ToggleGroupItem>
      <ToggleGroupItem value='git'>Git</ToggleGroupItem>
      <ToggleGroupItem value='website'>Website</ToggleGroupItem>
    </ToggleGroup>
  );
  const website = source === 'website';
  return (
    <>
      {/* One heading for both forms, the shown one's, so the window has a
          single title and description to be announced by */}
      <DialogHeader>
        <DialogTitle>{website ? 'New website' : 'New service'}</DialogTitle>
        <DialogDescription>
          {website
            ? "A site hosted somewhere else, as a tile that shows whether it's up and how fast it answers. Nothing changes on the server."
            : source === 'git'
              ? 'Cloned into a folder of its own in ~/services, built and started with Docker Compose, and for a domain, a site in Caddy.'
              : 'A folder of its own in ~/services, started with Docker Compose, and for a domain, a site in Caddy.'}
        </DialogDescription>
      </DialogHeader>
      <NewServiceForm
        hidden={website}
        from={website ? 'template' : source}
        picker={picker}
        groups={groups}
        running={running}
        setRunning={setRunning}
        onCreated={onCreated}
      />
      <NewWebsiteForm
        hidden={!website}
        picker={picker}
        groups={groups}
        onCreatedAction={onCreated}
      />
    </>
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
  hidden,
  from,
  picker,
  groups,
  running,
  setRunning,
  onCreated,
}: {
  hidden: boolean;
  /** A template, a pasted docker run command, or a git repository */
  from: Exclude<Source, 'website'>;
  picker: ReactNode;
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
  const [error, setError] = useState<string>();
  const [output, setOutput] = useState<string[]>();
  // The repository looked at, to clone, and the name of its compose file
  const [repo, setRepo] = useState<{
    source: GitSourceInput;
    composeFile?: ComposeName;
  }>();
  const git = from === 'git' ? repo : undefined;

  // The address, once it's a whole one, for the settings that make links
  const host = domain.trim().toLowerCase();
  const input: NewServiceInput = {
    name,
    compose:
      compose ??
      composeFor(
        template,
        name.trim(),
        group.trim(),
        DOMAIN_PATTERN.test(host) ? host : ''
      ),
    composeFile: git?.composeFile,
    git: git?.source,
    group,
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
  function convert(converted: ConvertedRun) {
    fill(converted.name, converted.port);
    setTemplate(blankTemplate());
    setCompose(converted.compose);
  }

  /**
   * Fills in what a repository has: its compose file as it is, or one that
   * builds its Dockerfile, following the name; its example .env, unless
   * there's one typed in; its name, and its Dockerfile's port.
   */
  function cloneFrom(source: GitSourceInput, look: RepoLook) {
    const nextPort = exposedPort(look.dockerfile ?? '');
    fill(repoName(source.url), nextPort);
    setTemplate({ ...blankTemplate(), build: '.', port: nextPort });
    setCompose(look.compose?.text);
    if (!env.trim() && look.env) setEnv(look.env);
    setRepo({ source, composeFile: look.compose?.name });
  }

  /** A name and port filled in for you, where you haven't typed your own. */
  function fill(nextName: string, nextPort: string) {
    if (!name.trim() || name.trim() === filled.name) setName(nextName);
    if (!port.trim() || port.trim() === filled.port) setPort(nextPort);
    setFilled({ name: nextName, port: nextPort });
  }

  async function create() {
    if (from === 'git' && !repo) {
      setError('Look at the repository first, to fill in the form from it');
      return;
    }
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
      hidden={hidden}
      className='contents'
      onSubmit={(e) => {
        e.preventDefault();
        void attempt("Couldn't add the service", create);
      }}
    >
      {/* The window is the one column everything's in, its heading too, so
          that when it must scroll, all of it does and nothing's pinned; the
          form and the fieldset, which disables every field while it's adding,
          are boxes of no size of their own */}
      <fieldset disabled={running} className='contents'>
        {picker}
        {from === 'run' && <DockerRunImport onConvertAction={convert} />}
        {from === 'template' && (
          <TemplatePicker picked={template} onPickAction={pick} />
        )}
        {/* Kept while another's shown, so the repository looked at, which
            is what's cloned, stays in its fields */}
        <div hidden={from !== 'git'}>
          <GitImport
            onLookAction={cloneFrom}
            onClearAction={() => setRepo(undefined)}
          />
        </div>
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
              onChangeAction={setGroup}
              optional
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
              onChangeAction={setCompose}
              fileName={input.composeFile ?? 'docker-compose.yml'}
              label='Compose file'
              readOnly={running}
            />
          </div>
        </div>
        <div className='flex flex-col gap-2'>
          <span className='text-xs/relaxed font-medium'>.env</span>
          <div className='h-24'>
            <CodeEditor
              value={env}
              onChangeAction={setEnv}
              fileName='.env'
              label='.env'
              readOnly={running}
            />
          </div>
        </div>
        <div className='grid items-start gap-4 sm:grid-cols-[1fr_10rem_6rem]'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='service-domain'>Address</Label>
            <AddressField
              id='service-domain'
              onChangeAction={setDomain}
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
        {output && <RunOutput lines={output} />}
      </fieldset>

      <DialogFooter>
        <Button type='submit' disabled={running}>
          {running ? 'Adding…' : 'Add service'}
        </Button>
      </DialogFooter>
    </form>
  );
}
