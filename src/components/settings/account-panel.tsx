'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { BadgeCheckIcon } from 'lucide-react';

import { setAlertMail, setLocale } from '@/actions/account';

import { LOCALE_NAMES, LOCALES, type Locale } from '@/i18n/locales';
import { useAuthError } from '@/i18n/use-auth-error';

import { authClient } from '@/lib/auth/auth-client';
import { MIN_PASSWORD } from '@/lib/auth/password';
import { can } from '@/lib/auth/roles';
import type { Me } from '@/lib/types';

import { attempt } from '@/components/common/toasts';
import { changingUrl, CONFIRMED_URL } from '@/components/settings/email-notice';
import {
  SettingsFooter,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/section';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

/** How the dashboard speaks to them, and whether it mails them alerts. */
function PreferencesSection({ me }: { me: Me }) {
  const t = useTranslations('account');
  return (
    <SettingsSection
      title={t('preferences')}
      description={t('preferencesDescription')}
    >
      <LanguageRow me={me} />
      {can(me.role, 'server') && <AlertsRow me={me} />}
    </SettingsSection>
  );
}

/** Who they are, as the dashboard knows them, and the password they sign in with. */
export function AccountPanel({ me }: { me: Me }) {
  return (
    <div className='flex flex-col gap-6'>
      <ProfileForm me={me} />
      <PasswordForm />
      <PreferencesSection me={me} />
    </div>
  );
}

function ProfileForm({ me }: { me: Me }) {
  const authError = useAuthError();
  const t = useTranslations('account');
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
      attempt(t('saveFailed'), async () => {
        if (newName !== me.name) {
          const { error } = await authClient.updateUser({ name: newName });
          if (error) {
            setError(authError(error, t('nameFailed')));
            return;
          }
        }
        if (newEmail !== me.email.toLowerCase()) {
          const { error } = await authClient.changeEmail({
            newEmail,
            callbackURL: changingUrl(newEmail),
          });
          if (error) {
            setError(authError(error, t('emailFailed')));
            router.refresh();
            return;
          }
          // A confirmed address changes once the mail to it is agreed to
          if (confirmsByMail) {
            toast.success(t('checkMail', { email: me.email }), {
              description: t('checkMailDescription', { email: newEmail }),
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
            setError(t('emailTaken'));
            router.refresh();
            return;
          }
        }
        toast.success(t('saved'));
        // So the page, and this form's starting point, are the new ones
        router.refresh();
      })
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <SettingsSection
        title={t('profile')}
        description={t('profileDescription')}
      >
        <SettingsRow label={t('name')} htmlFor='account-name'>
          <Input
            id='account-name'
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete='name'
            required
          />
        </SettingsRow>
        <SettingsRow
          label={t('email')}
          htmlFor='account-email'
          hint={<EmailStatus me={me} />}
        >
          <Input
            id='account-email'
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete='email'
            required
          />
        </SettingsRow>
        <SettingsFooter>
          {error && <p className='mr-auto text-destructive'>{error}</p>}
          {/* Quiet until there's something to save, rather than a solid
              button greyed out, which looks broken */}
          <Button
            type='submit'
            variant={changed ? 'default' : 'outline'}
            disabled={pending || !changed}
          >
            {t('save')}
          </Button>
        </SettingsFooter>
      </SettingsSection>
    </form>
  );
}

function PasswordForm() {
  const authError = useAuthError();
  const t = useTranslations('account');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <form
      // Sent from here rather than as the form's action, which would empty
      // the fields after, when only one of them might be wrong
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        const currentPassword = String(data.get('current-password'));
        const newPassword = String(data.get('new-password'));
        if (newPassword.length < MIN_PASSWORD) {
          setError(t('passwordTooShort', { count: MIN_PASSWORD }));
          return;
        }
        // There's no email to reset a mistyped one with, so it's asked twice
        if (newPassword !== String(data.get('repeat-password'))) {
          setError(t('passwordsDiffer'));
          return;
        }
        setError(undefined);
        startTransition(() =>
          attempt(t('passwordFailed'), async () => {
            const { error } = await authClient.changePassword({
              currentPassword,
              newPassword,
              revokeOtherSessions: signOutOthers,
            });
            if (error) {
              setError(authError(error, t('passwordFailed')));
              return;
            }
            form.reset();
            toast.success(t('passwordChanged'), {
              description: signOutOthers ? t('othersSignedOut') : undefined,
            });
          })
        );
      }}
    >
      <SettingsSection
        title={t('password')}
        description={t('passwordDescription')}
      >
        <SettingsRow label={t('currentPassword')} htmlFor='current-password'>
          <Input
            id='current-password'
            name='current-password'
            type='password'
            autoComplete='current-password'
            required
          />
        </SettingsRow>
        <SettingsRow
          label={t('newPassword')}
          htmlFor='new-password'
          hint={t('passwordHint', { count: MIN_PASSWORD })}
        >
          <Input
            id='new-password'
            name='new-password'
            type='password'
            autoComplete='new-password'
            minLength={MIN_PASSWORD}
            required
          />
        </SettingsRow>
        <SettingsRow label={t('repeatPassword')} htmlFor='repeat-password'>
          <Input
            id='repeat-password'
            name='repeat-password'
            type='password'
            autoComplete='new-password'
            minLength={MIN_PASSWORD}
            required
          />
        </SettingsRow>
        <SettingsFooter>
          {error && <p className='w-full text-destructive'>{error}</p>}
          <div className='mr-auto flex items-center gap-2'>
            <Checkbox
              id='sign-out-others'
              checked={signOutOthers}
              onCheckedChange={(checked) => setSignOutOthers(checked === true)}
            />
            <Label htmlFor='sign-out-others'>{t('signOutOthers')}</Label>
          </div>
          <Button type='submit' disabled={pending}>
            {t('changePassword')}
          </Button>
        </SettingsFooter>
      </SettingsSection>
    </form>
  );
}

/** Whether their address is confirmed, and if not, a way to, once there's mail. */
function EmailStatus({ me }: { me: Me }) {
  const t = useTranslations('account');
  const [pending, startTransition] = useTransition();
  if (!me.mail) {
    return <p className='text-muted-foreground'>{t('noMail')}</p>;
  }
  if (me.emailVerified) {
    return (
      <p className='flex items-center gap-1 text-muted-foreground [&_svg]:size-3.5'>
        <BadgeCheckIcon className='text-success' />
        {t('confirmed')}
      </p>
    );
  }
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <p className='text-warning'>{t('notConfirmed')}</p>
      <Button
        type='button'
        variant='outline'
        size='xs'
        disabled={pending}
        onClick={() =>
          startTransition(() =>
            attempt(t('linkFailed'), async () => {
              const { error } = await authClient.sendVerificationEmail({
                email: me.email,
                callbackURL: CONFIRMED_URL,
              });
              if (error) {
                toast.error(t('linkFailed'), {
                  description: error.message,
                });
                return;
              }
              toast.success(t('linkSent', { email: me.email }));
            })
          )
        }
      >
        {t('sendLink')}
      </Button>
    </div>
  );
}

/** The language the dashboard speaks to them in, and mails them in. */
function LanguageRow({ me }: { me: Me }) {
  const t = useTranslations('settings.language');
  const router = useRouter();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  return (
    <SettingsRow
      label={t('label')}
      htmlFor='language'
      hint={me.locale ? t('chosen') : t('browser')}
    >
      <Select
        value={locale}
        disabled={pending}
        onValueChange={(next) =>
          startTransition(() =>
            attempt(t('failed'), async () => {
              const { error } = await setLocale(next as Locale);
              if (error) {
                toast.error(t('failed'), { description: error });
                return;
              }
              router.refresh();
            })
          )
        }
      >
        <SelectTrigger id='language'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LOCALES.map((l) => (
            // Each in its own language, as whoever reads it reads that
            <SelectItem key={l} value={l} lang={l}>
              {LOCALE_NAMES[l]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}

/** Whether the monitor's alerts are mailed to them, for those who see the server. */
function AlertsRow({ me }: { me: Me }) {
  const t = useTranslations('account');
  const router = useRouter();
  const [on, setOn] = useState(me.alertMail);
  const [pending, startTransition] = useTransition();
  return (
    <SettingsRow
      label={t('mailAlerts')}
      htmlFor='alert-mail'
      hint={
        me.mail
          ? t('alertsDescription', { email: me.email })
          : t('alertsNoMail')
      }
    >
      <Switch
        id='alert-mail'
        checked={on}
        disabled={pending || !me.mail}
        onCheckedChange={(next) => {
          setOn(next);
          startTransition(() =>
            attempt(t('changeFailed'), async () => {
              const { error } = await setAlertMail(next);
              if (error) {
                setOn(!next);
                toast.error(t('changeFailed'), { description: error });
                return;
              }
              router.refresh();
            })
          );
        }}
      />
    </SettingsRow>
  );
}
