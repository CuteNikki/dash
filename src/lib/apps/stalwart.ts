import 'server-only';

import { env, getJson, TIMEOUT_MS, type App } from '@/lib/apps/app';

/** What a recipient's delivery is doing: a word, or an object naming it in "@type". */
type RecipientStatus = string | { '@type'?: string; errorType?: string };

type QueuedMessage = {
  /** The envelope's sender */
  returnPath?: string;
  createdAt?: string;
  recipients?: Record<
    string,
    {
      status?: RecipientStatus;
      /** Attempts made so far */
      retryCount?: number;
      /** When it's tried next */
      retryDue?: string;
    }
  >;
};

/** How Stalwart's delivery states read here. */
const STATES: Record<string, string> = {
  Scheduled: 'waiting',
  TemporaryFailure: 'failing, will retry',
  PermanentFailure: 'failed',
  Completed: 'delivered',
};

function stateOf(status?: RecipientStatus) {
  const name = typeof status === 'string' ? status : status?.['@type'];
  const error = typeof status === 'object' ? status.errorType : undefined;
  const state = (name && STATES[name]) ?? name ?? '–';
  return error ? `${state} (${error})` : state;
}

function headersOf() {
  return {
    Authorization: `Bearer ${env('STALWART_API_KEY')}`,
    'Content-Type': 'application/json',
    // Its web listener expects Caddy in front and logs a warning for every
    // request that doesn't say who it's for; this comes straight from here
    'X-Forwarded-For': '127.0.0.1',
  };
}

/** The account its management objects are under, from its JMAP session. */
async function accountOf(url: string) {
  const session = await getJson<{ primaryAccounts: Record<string, string> }>(
    `${url}/.well-known/jmap`,
    headersOf()
  );
  const account = session.primaryAccounts['urn:stalwart:jmap'];
  if (!account) throw new Error("Its key can't see the queue");
  return account;
}

/** Runs JMAP method calls, giving back each one's response, in order. */
async function jmap(url: string, calls: [string, object][]) {
  const res = await fetch(`${url}/jmap/`, {
    method: 'POST',
    headers: headersOf(),
    body: JSON.stringify({
      using: ['urn:ietf:params:jmap:core', 'urn:stalwart:jmap'],
      methodCalls: calls.map(([name, args], i) => [name, args, `${i}`]),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${res.status} from /jmap/`);
  const { methodResponses } = (await res.json()) as {
    methodResponses: [string, Record<string, unknown>, string][];
  };
  return methodResponses.map(([name, result]) => {
    if (name === 'error')
      throw new Error(`${result.type}: ${result.description ?? ''}`);
    return result;
  });
}

/** Stalwart, the mail server: what's waiting to go out, with a read-only key. */
export const stalwart: App = {
  port: 8080,
  ready: () => !!env('STALWART_API_KEY'),
  read: async ({ url }) => {
    const accountId = await accountOf(url);
    const [query] = await jmap(url, [
      ['x:QueuedMessage/query', { accountId, calculateTotal: true }],
    ]);
    return [{ label: 'Queued', value: `${query.total ?? 0}` }];
  },
  details: async ({ url }) => {
    const accountId = await accountOf(url);
    const [, get] = await jmap(url, [
      ['x:QueuedMessage/query', { accountId }],
      [
        'x:QueuedMessage/get',
        {
          accountId,
          '#ids': {
            resultOf: '0',
            name: 'x:QueuedMessage/query',
            path: '/ids',
          },
        },
      ],
    ]);
    const messages = (get.list as QueuedMessage[]) ?? [];
    return [
      {
        kind: 'table',
        title: 'Waiting to go out',
        columns: [
          { label: 'To' },
          { label: 'From' },
          { label: 'State' },
          { label: 'Tries', numeric: true },
          { label: 'Next try', numeric: true },
        ],
        // One row for each recipient, since each is delivered on its own
        rows: messages.flatMap((m) =>
          Object.entries(m.recipients ?? {}).map(([to, r]) => ({
            cells: [
              to,
              m.returnPath || '–',
              stateOf(r.status),
              `${r.retryCount ?? 0}`,
              r.retryDue ? { at: Date.parse(r.retryDue) } : '–',
            ],
            dim: stateOf(r.status) === 'delivered',
          }))
        ),
        empty: "Nothing's waiting to go out",
      },
    ];
  },
};
