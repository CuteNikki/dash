'use client';

import { Panel } from '@/components/service/app-details';
import { PasskeyList } from '@/components/settings/passkey-list';
import { SessionList } from '@/components/settings/session-list';
import { TwoFactor } from '@/components/settings/two-factor';

/** The ways into this account, and where it's signed in. */
export function SecurityPanel() {
  return (
    <div className='grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start'>
      <Panel title='Passkeys'>
        <PasskeyList />
      </Panel>
      <Panel title='Two-factor'>
        <TwoFactor />
      </Panel>
      <Panel title='Signed in' className='lg:col-span-2'>
        <SessionList />
      </Panel>
    </div>
  );
}
