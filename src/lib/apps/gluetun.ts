import 'server-only';

import { run, stats, type App } from '@/lib/apps/app';

/**
 * The VPN: the address the internet sees through it, and the port its
 * provider forwards, from the files it keeps them in. Its control server
 * would say where that is too, but it asks for a key.
 */
export const gluetun: App = {
  read: ({ container: c }) =>
    stats([
      // An address says what it is alone
      [
        undefined,
        async () => (await run(c, ['cat', '/tmp/gluetun/ip'])).trim(),
      ],
      [
        'Forwarded',
        async () => {
          const port = (
            await run(c, ['cat', '/tmp/gluetun/forwarded_port'])
          ).trim();
          if (!port) throw new Error('No port forwarded');
          return port;
        },
      ],
    ]),
};
