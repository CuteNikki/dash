'use client';

import { useTranslations } from 'next-intl';

import { PasskeyList } from '@/components/settings/passkey-list';
import { SettingsSection } from '@/components/settings/section';
import { SessionList } from '@/components/settings/session-list';
import { TwoFactor } from '@/components/settings/two-factor';

/** The ways into this account, and where it's signed in. */
export function SecurityPanel() {
  const t = useTranslations('security');
  return (
    <div className='flex flex-col gap-6'>
      <PasskeyList />
      <SettingsSection
        title={t('twoFactor')}
        description={t('twoFactorDescription')}
      >
        {/* Setting it up is a few steps of its own, so it has the card */}
        <div className='p-3'>
          <TwoFactor />
        </div>
      </SettingsSection>
      <SessionList />
    </div>
  );
}
