'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { BadgeCheckIcon } from 'lucide-react';

import { authClient } from '@/lib/auth/auth-client';
import { MIN_PASSWORD } from '@/lib/auth/password';
import type { Me } from '@/lib/types';

import { attempt } from '@/components/common/toasts';
import { Panel } from '@/components/service/app-details';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Who they are, as the dashboard knows them, and the password they sign in with. */
export function AccountPanel({ me }: { me: Me }) {
  return (
    <div className='grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start'>
      <ProfileForm me={me} />
      <PasswordForm />
    </div>
  );
}

function ProfileForm({ me }: { me: Me }) {
  const router = useRouter();
  const [name, setName] = useState(me.name);
  const [email, setEmail] = useState(me.email);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const newName = name.trim();
  const newEmail = email.trim().toLowerCase();
  const changed = newName !== me.name || newEmail !== me.email.toLowerCase();
  const confirmsByMail = me.mail && me.emailVerified;

  function save() {
    setError(undefined);
    startTransition(() =>
      attempt("Couldn't save your details", async () => {
        if (newName !== me.name) {
          const { error } = await authClient.updateUser({ name: newName });
          if (error) {
            setError(error.message ?? "Couldn't change your name");
            return;
          }
        }
        if (newEmail !== me.email.toLowerCase()) {
          const { error } = await authClient.changeEmail({
            newEmail,
            callbackURL: '/',
          });
          if (error) {
            setError(error.message ?? "Couldn't change your email");
            router.refresh();
            return;
          }
          // A confirmed address changes once the mail to it is agreed to
          if (confirmsByMail) {
            toast.success(`Check your mail at ${me.email}`, {
              description: `Agree to the change there, then confirm ${newEmail} from the mail sent to it`,
            });
            setEmail(me.email);
            router.refresh();
            return;
          }
          // Better Auth answers the same when another account has the
          // address, so as not to say which do; whether it took is in the
          // session
          const { data } = await authClient.getSession();
          if (data?.user.email !== newEmail) {
            setError('Another account has that email');
            router.refresh();
            return;
          }
        }
        toast.success('Saved your details');
        // So the page, and this form's starting point, are the new ones
        router.refresh();
      })
    );
  }

  return (
    <Panel title='Profile'>
      <form
        className='flex flex-col gap-4'
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className='flex flex-col gap-2'>
          <Label htmlFor='account-name'>Name</Label>
          <Input
            id='account-name'
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete='name'
            required
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='account-email'>Email</Label>
          <Input
            id='account-email'
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete='email'
            required
          />
          <EmailStatus me={me} />
        </div>
        {error && <p className='text-destructive'>{error}</p>}
        <Button
          type='submit'
          disabled={pending || !changed}
          className='self-start'
        >
          Save
        </Button>
      </form>
    </Panel>
  );
}

function PasswordForm() {
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <Panel title='Password'>
      <form
        className='flex flex-col gap-4'
        // Sent from here rather than as the form's action, which would empty
        // the fields after, when only one of them might be wrong
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          const currentPassword = String(data.get('current-password'));
          const newPassword = String(data.get('new-password'));
          if (newPassword.length < MIN_PASSWORD) {
            setError(`A password needs ${MIN_PASSWORD} characters or more`);
            return;
          }
          // There's no email to reset a mistyped one with, so it's asked twice
          if (newPassword !== String(data.get('repeat-password'))) {
            setError("The new passwords don't match");
            return;
          }
          setError(undefined);
          startTransition(() =>
            attempt("Couldn't change your password", async () => {
              const { error } = await authClient.changePassword({
                currentPassword,
                newPassword,
                revokeOtherSessions: signOutOthers,
              });
              if (error) {
                setError(error.message ?? "Couldn't change your password");
                return;
              }
              form.reset();
              toast.success('Changed your password', {
                description: signOutOthers
                  ? 'Your other devices are signed out.'
                  : undefined,
              });
            })
          );
        }}
      >
        <div className='flex flex-col gap-2'>
          <Label htmlFor='current-password'>Current password</Label>
          <Input
            id='current-password'
            name='current-password'
            type='password'
            autoComplete='current-password'
            required
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='new-password'>New password</Label>
          <Input
            id='new-password'
            name='new-password'
            type='password'
            autoComplete='new-password'
            minLength={MIN_PASSWORD}
            required
          />
          <p className='text-muted-foreground'>
            {MIN_PASSWORD} characters or more.
          </p>
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='repeat-password'>New password again</Label>
          <Input
            id='repeat-password'
            name='repeat-password'
            type='password'
            autoComplete='new-password'
            minLength={MIN_PASSWORD}
            required
          />
        </div>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='sign-out-others'
            checked={signOutOthers}
            onCheckedChange={(checked) => setSignOutOthers(checked === true)}
          />
          <Label htmlFor='sign-out-others'>Sign out my other devices</Label>
        </div>
        {error && <p className='text-destructive'>{error}</p>}
        <Button type='submit' disabled={pending} className='self-start'>
          Change password
        </Button>
      </form>
    </Panel>
  );
}

/** Whether their address is confirmed, and if not, a way to, once there's mail. */
function EmailStatus({ me }: { me: Me }) {
  const [pending, startTransition] = useTransition();
  if (!me.mail) {
    return (
      <p className='text-muted-foreground'>
        What you sign in with. The dashboard can&apos;t send mail yet, so it
        changes at once.
      </p>
    );
  }
  if (me.emailVerified) {
    return (
      <p className='flex items-center gap-1 text-muted-foreground [&_svg]:size-3.5'>
        <BadgeCheckIcon className='text-success' />
        Confirmed. A new one changes once both addresses agree, by mail.
      </p>
    );
  }
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <p className='text-warning'>Not confirmed yet.</p>
      <Button
        type='button'
        variant='outline'
        size='xs'
        disabled={pending}
        onClick={() =>
          startTransition(() =>
            attempt("Couldn't send the link", async () => {
              const { error } = await authClient.sendVerificationEmail({
                email: me.email,
                callbackURL: '/',
              });
              if (error) {
                toast.error("Couldn't send the link", {
                  description: error.message,
                });
                return;
              }
              toast.success(`Sent a link to ${me.email}`);
            })
          )
        }
      >
        Send me a link to confirm it
      </Button>
    </div>
  );
}
