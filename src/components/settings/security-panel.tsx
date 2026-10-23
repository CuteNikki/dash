'use client';

import { Panel } from '@/components/service/app-details';
import { PasskeyList } from '@/components/settings/passkey-list';
import { SessionList } from '@/components/settings/session-list';
import { TwoFactor } from '@/components/settings/two-factor';

/** The ways into this account, and where it's signed in. */
export function SecurityPanel() {
  return (
    // One under another, each as wide as the window, so one that grows, as
    // two-factor does while it's being set up, pushes the rest down rather
    // than leaving a column of empty space beside it
    <div className='flex flex-col gap-3'>
      <Panel title='Passkeys'>
        <PasskeyList />
      </Panel>
      <Panel title='Two-factor'>
        <TwoFactor />
      </Panel>
      <Panel title='Signed in'>
        <SessionList />
      </Panel>
    </div>
  );
}
