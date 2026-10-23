'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { KeyRoundIcon } from 'lucide-react';

import { authClient } from '@/lib/auth/auth-client';

import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

type AuthResult =
  { data?: unknown; error: { message?: string } | null } | undefined;

/** Better Auth's answer to a right password when the account asks for a code too. */
const wantsCode = (data: unknown) =>
  typeof data === 'object' &&
  data !== null &&
  'twoFactorRedirect' in data &&
  data.twoFactorRedirect === true;

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  // Past the password, for an account with two-factor on
  const [codeStep, setCodeStep] = useState(false);
  // Kept for going back, as the form's emptied once it's out of sight
  const [email, setEmail] = useState('');

  /** Signs in one way or another, saying why not where it couldn't. */
  function signIn(how: () => Promise<AuthResult>) {
    startTransition(async () => {
      const result = await how().catch(() => ({
        data: undefined,
        error: { message: "dash didn't answer; try again in a moment" },
      }));
      if (result?.error) {
        setError(result.error.message ?? "Couldn't sign in");
        return;
      }
      // The password was right, and there's a code to give too; until then
      // there's no session, only a cookie that lets the code finish it
      if (wantsCode(result?.data)) {
        setError(undefined);
        setCodeStep(true);
        return;
      }
      done();
    });
  }

  function done() {
    router.replace('/');
    router.refresh();
  }

  if (codeStep) {
    return (
      <CodeStep
        onSignedInAction={done}
        onBackAction={(reason) => {
          setError(reason);
          setCodeStep(false);
        }}
      />
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      <form
        className='flex flex-col gap-4'
        // Sent from here rather than as the form's action, which would empty
        // the fields after, the email too when only the password was wrong
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const typed = String(form.get('email'));
          setEmail(typed);
          signIn(() =>
            authClient.signIn.email({
              email: typed,
              password: String(form.get('password')),
            })
          );
        }}
      >
        <FormField
          id='email'
          label='Email'
          type='email'
          autoComplete='username webauthn'
          defaultValue={email}
        />
        <FormField
          id='password'
          label='Password'
          type='password'
          autoComplete='current-password'
        />
        {error && <p className='text-destructive'>{error}</p>}
        <Button type='submit' disabled={pending}>
          Sign in
        </Button>
      </form>
      <Separator />
      {/* A passkey is two factors itself, the device and what unlocks it,
          so Better Auth asks it for no code */}
      <Button
        variant='outline'
        disabled={pending}
        onClick={() => signIn(() => authClient.signIn.passkey())}
      >
        <KeyRoundIcon />
        Sign in with a passkey
      </Button>
    </div>
  );
}

/**
 * The second step, for an account with two-factor on: the code from its
 * authenticator app, or one of its backup codes, each once.
 */
function CodeStep({
  onSignedInAction,
  onBackAction,
}: {
  onSignedInAction: () => void;
  /** Back to the password, saying why when it's not by choice */
  onBackAction: (reason?: string) => void;
}) {
  const [backup, setBackup] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function verify(code: string) {
    setError(undefined);
    startTransition(async () => {
      const { error } = await (
        backup
          ? authClient.twoFactor.verifyBackupCode({ code, trustDevice })
          : authClient.twoFactor.verifyTotp({ code, trustDevice })
      ).catch(() => ({
        error: {
          code: undefined,
          message: "dash didn't answer; try again in a moment",
        },
      }));
      // The password's sign-in lasts ten minutes; past that, it starts over
      if (error?.code === 'INVALID_TWO_FACTOR_COOKIE') {
        onBackAction('That took too long; sign in again');
      } else if (error) {
        setError(error.message ?? "That code isn't right");
      } else {
        onSignedInAction();
      }
    });
  }

  return (
    <form
      className='flex flex-col gap-4'
      onSubmit={(e) => {
        e.preventDefault();
        verify(String(new FormData(e.currentTarget).get('code')).trim());
      }}
    >
      <p>
        {backup
          ? 'Enter one of your backup codes. Each works once.'
          : 'Enter the 6-digit code from your authenticator app.'}
      </p>
      <FormField
        // A new field for each kind of code, so neither keeps the other's
        key={backup ? 'backup' : 'totp'}
        id='code'
        label={backup ? 'Backup code' : 'Code'}
        autoComplete='one-time-code'
        autoFocus
        spellCheck={false}
        className='font-mono tabular-nums'
        {...(backup
          ? {}
          : { inputMode: 'numeric', pattern: '[0-9]{6}', maxLength: 6 })}
      />
      <div className='flex items-center gap-2'>
        <Checkbox
          id='trust-device'
          checked={trustDevice}
          onCheckedChange={(checked) => setTrustDevice(checked === true)}
        />
        <Label htmlFor='trust-device'>Trust this device for 30 days</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          id='backup-code'
          checked={backup}
          onCheckedChange={(on) => {
            setBackup(on);
            setError(undefined);
          }}
        />
        <Label htmlFor='backup-code'>Use a backup code</Label>
      </div>
      {error && <p className='text-destructive'>{error}</p>}
      <Button type='submit' disabled={pending}>
        Sign in
      </Button>
      <Button
        type='button'
        variant='outline'
        disabled={pending}
        onClick={() => onBackAction()}
      >
        Back
      </Button>
    </form>
  );
}
