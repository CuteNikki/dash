'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  CheckIcon,
  CopyIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
} from 'lucide-react';

import { authClient } from '@/lib/auth/auth-client';
import { cn } from '@/lib/utils';

import { TextSkeleton } from '@/components/common/skeletons';
import { attempt, copyText } from '@/components/common/toasts';
import { BackupCodes } from '@/components/settings/backup-codes';
import { QrCode } from '@/components/settings/qr-code';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** What the password's asked for, and the button that sends it. */
const PURPOSES = {
  enable: 'Turn on',
  disable: 'Turn off',
  codes: 'Make new codes',
} as const;
type Purpose = keyof typeof PURPOSES;

type Step =
  | { kind: 'idle' }
  | { kind: 'password'; purpose: Purpose }
  /** Turned on but not yet confirmed with a code from the app */
  | { kind: 'setup'; totpURI: string; backupCodes: string[] }
  | { kind: 'codes'; backupCodes: string[] };

/** The secret an app can be given by hand, from the QR code's URI, in fours. */
function secretOf(totpURI: string) {
  try {
    const secret = new URL(totpURI).searchParams.get('secret') ?? '';
    return secret.match(/.{1,4}/g)?.join(' ') ?? '';
  } catch {
    return '';
  }
}

/**
 * A code from an authenticator app at sign-in, after the password: whether
 * it's asked for, and turning it on and off. Turning it on gives the app's
 * secret and the backup codes, and takes effect once a code from the app
 * shows it was set up right. A passkey sign-in skips it, a passkey being two
 * factors itself: the device, and the fingerprint or PIN that unlocks it.
 */
export function TwoFactor() {
  const { data: session, isPending } = authClient.useSession();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const user = session?.user;
  const on = !!user?.twoFactorEnabled;

  if (isPending && !user) return <TextSkeleton className='w-40' />;

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        {on ? (
          <Badge variant='secondary'>
            <ShieldCheckIcon />
            On
          </Badge>
        ) : (
          <Badge variant='outline'>
            <ShieldOffIcon />
            Off
          </Badge>
        )}
        <span>
          {on
            ? 'Signing in with your password asks for a code from your authenticator app too.'
            : 'Ask for a code from an authenticator app too, when signing in with your password.'}
        </span>
      </div>

      {step.kind === 'password' ? (
        <PasswordStep
          purpose={step.purpose}
          onCancelAction={() => setStep({ kind: 'idle' })}
          onDoneAction={setStep}
        />
      ) : step.kind === 'setup' ? (
        <SetupStep
          totpURI={step.totpURI}
          backupCodes={step.backupCodes}
          email={user?.email ?? ''}
          onCancelAction={() => setStep({ kind: 'idle' })}
          onDoneAction={() => setStep({ kind: 'idle' })}
        />
      ) : step.kind === 'codes' ? (
        <>
          <BackupCodes codes={step.backupCodes} email={user?.email ?? ''} />
          <p className='text-muted-foreground'>
            The ones you had before work no more.
          </p>
          <Button
            onClick={() => setStep({ kind: 'idle' })}
            className='self-start'
          >
            Done
          </Button>
        </>
      ) : on ? (
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            onClick={() => setStep({ kind: 'password', purpose: 'codes' })}
          >
            New backup codes
          </Button>
          <Button
            variant='destructive'
            onClick={() => setStep({ kind: 'password', purpose: 'disable' })}
          >
            Turn off
          </Button>
        </div>
      ) : (
        <Button
          variant='outline'
          onClick={() => setStep({ kind: 'password', purpose: 'enable' })}
          className='self-start'
        >
          Turn on
        </Button>
      )}
    </div>
  );
}

/** The password, asked again for any change to two-factor, as Better Auth requires. */
function PasswordStep({
  purpose,
  onCancelAction,
  onDoneAction,
}: {
  purpose: Purpose;
  onCancelAction: () => void;
  /** Called with what follows: the setup, new codes, or nothing more */
  onDoneAction: (next: Step) => void;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function send(password: string) {
    setError(undefined);
    startTransition(() =>
      attempt(`Couldn't ${PURPOSES[purpose].toLowerCase()}`, async () => {
        if (purpose === 'enable') {
          const { data, error } = await authClient.twoFactor.enable({
            password,
          });
          // Asked for an app's code, which is what gives these
          if (error || data?.method !== 'totp') {
            setError(error?.message ?? "Couldn't turn it on");
            return;
          }
          onDoneAction({
            kind: 'setup',
            totpURI: data.totpURI,
            backupCodes: data.backupCodes,
          });
        } else if (purpose === 'disable') {
          const { error } = await authClient.twoFactor.disable({ password });
          if (error) {
            setError(error.message ?? "Couldn't turn it off");
            return;
          }
          toast.success('Two-factor is off');
          onDoneAction({ kind: 'idle' });
        } else {
          const { data, error } =
            await authClient.twoFactor.generateBackupCodes({ password });
          if (error || !data) {
            setError(error?.message ?? "Couldn't make new codes");
            return;
          }
          onDoneAction({ kind: 'codes', backupCodes: data.backupCodes });
        }
      })
    );
  }

  return (
    <form
      className='flex flex-col gap-3'
      onSubmit={(e) => {
        e.preventDefault();
        send(String(new FormData(e.currentTarget).get('password')));
      }}
    >
      <div className='flex flex-col gap-2'>
        <Label htmlFor='two-factor-password'>Your password</Label>
        <Input
          id='two-factor-password'
          name='password'
          type='password'
          autoComplete='current-password'
          autoFocus
          required
          className='max-w-xs'
        />
      </div>
      {error && <p className='text-destructive'>{error}</p>}
      <div className='flex gap-2'>
        <Button
          type='submit'
          variant={purpose === 'disable' ? 'destructive' : 'default'}
          disabled={pending}
        >
          {PURPOSES[purpose]}
        </Button>
        <Button type='button' variant='outline' onClick={onCancelAction}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Setting it up, a step at a time, so the panel stays short. */
const SETUP_STEPS = ['Scan', 'Backup codes', 'Confirm'] as const;

/**
 * The app's secret, as a QR code and as text to type in, the backup codes,
 * and a code from the app to show it's set up, one after another: until
 * the code's given, signing in asks for none.
 */
function SetupStep({
  totpURI,
  backupCodes,
  email,
  onCancelAction,
  onDoneAction,
}: {
  totpURI: string;
  backupCodes: string[];
  email: string;
  onCancelAction: () => void;
  onDoneAction: () => void;
}) {
  const [at, setAt] = useState(0);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const secret = secretOf(totpURI);

  function verify(code: string) {
    setError(undefined);
    startTransition(() =>
      attempt("Couldn't turn it on", async () => {
        const { error } = await authClient.twoFactor.verifyTotp({ code });
        if (error) {
          setError(error.message ?? "That code isn't right");
          return;
        }
        toast.success('Two-factor is on', {
          description: 'Signing in will ask for a code from your app.',
        });
        onDoneAction();
      })
    );
  }

  const back = (
    <Button type='button' variant='outline' onClick={() => setAt(at - 1)}>
      Back
    </Button>
  );
  const cancel = (
    <Button type='button' variant='outline' onClick={onCancelAction}>
      Cancel
    </Button>
  );

  return (
    <div className='flex flex-col gap-4'>
      <ol className='flex flex-wrap items-center gap-x-3 gap-y-1'>
        {SETUP_STEPS.map((name, i) => (
          <li
            key={name}
            aria-current={i === at ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5',
              i === at ? 'font-medium' : 'text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'flex size-4.5 items-center justify-center rounded-full border font-mono text-2xs',
                i === at && 'border-foreground bg-foreground text-background',
                i < at && 'border-foreground/40'
              )}
            >
              {i < at ? <CheckIcon className='size-3' /> : i + 1}
            </span>
            {name}
          </li>
        ))}
      </ol>

      {at === 0 && (
        <div className='flex flex-col gap-3'>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-start'>
            <QrCode
              value={totpURI}
              label='QR code for your authenticator app'
              className='size-40 shrink-0'
            />
            <div className='flex min-w-0 flex-col gap-2'>
              <p>
                Scan this with an authenticator app, such as 1Password, Google
                Authenticator or Aegis, or type in the key instead.
              </p>
              <div className='flex items-center gap-1'>
                <code className='font-mono break-all'>{secret}</code>
                <Button
                  variant='outline'
                  size='icon'
                  aria-label='Copy the key'
                  title='Copy the key'
                  onClick={() =>
                    copyText(secret.replace(/ /g, ''), 'Copied the key')
                  }
                >
                  <CopyIcon />
                </Button>
              </div>
            </div>
          </div>
          <div className='flex gap-2'>
            <Button onClick={() => setAt(1)}>Next</Button>
            {cancel}
          </div>
        </div>
      )}

      {at === 1 && (
        <div className='flex flex-col gap-3'>
          <BackupCodes codes={backupCodes} email={email} />
          <div className='flex gap-2'>
            <Button onClick={() => setAt(2)}>I've saved them</Button>
            {back}
          </div>
        </div>
      )}

      {at === 2 && (
        <form
          className='flex flex-col gap-3'
          onSubmit={(e) => {
            e.preventDefault();
            verify(String(new FormData(e.currentTarget).get('code')).trim());
          }}
        >
          <Label htmlFor='two-factor-code'>
            The code your app shows for the dashboard
          </Label>
          <Input
            id='two-factor-code'
            name='code'
            inputMode='numeric'
            autoComplete='one-time-code'
            pattern='[0-9]{6}'
            maxLength={6}
            placeholder='123456'
            autoFocus
            required
            className='w-28 font-mono tabular-nums'
          />
          {error && <p className='text-destructive'>{error}</p>}
          <div className='flex gap-2'>
            <Button type='submit' disabled={pending}>
              Turn on
            </Button>
            {back}
          </div>
        </form>
      )}
    </div>
  );
}
