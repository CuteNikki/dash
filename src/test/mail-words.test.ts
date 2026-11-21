import { describe, expect, test } from 'bun:test';

import { alertsMail, inviteMail } from '@/lib/mail/templates';
import { mailWords } from '@/lib/mail/words';

const since = new Date(Date.UTC(2026, 10, 21, 10));
const now = since.getTime() + 3 * 60_000;
const stopped = {
  subject: 'minecraft',
  message: 'Stopped, exit code 137',
  words: { message: { key: 'stoppedCode' as const, values: { code: 137 } } },
  since,
};

describe('alertsMail', () => {
  test('says one alert as its subject, in each language', async () => {
    const en = alertsMail(await mailWords('en'), ['a@b.c'], [stopped], [], now);
    expect(en.subject).toBe('minecraft: Stopped, exit code 137');
    const de = alertsMail(await mailWords('de'), ['a@b.c'], [stopped], [], now);
    expect(de.subject).toBe('minecraft: Gestoppt, Exit-Code 137');
    expect(de.lang).toBe('de');
  });

  test('counts several, in the plural only past one', async () => {
    const w = await mailWords('en');
    const two = alertsMail(
      w,
      [],
      [stopped, stopped],
      [{ ...stopped, resolvedAt: new Date(now) }],
      now
    );
    expect(two.subject).toMatch(/^2 new alerts, 1 resolved on /);
    const de = alertsMail(
      await mailWords('de'),
      [],
      [stopped, stopped],
      [],
      now
    );
    expect(de.subject).toMatch(/^2 neue Warnungen auf /);
  });

  test('says an alert from before its words in its English', async () => {
    const old = { subject: 'The disk', message: '91% full, 20 GB left', since };
    const mail = alertsMail(await mailWords('de'), [], [old], [], now);
    expect(mail.subject).toBe('The disk: 91% full, 20 GB left');
  });
});

describe('inviteMail', () => {
  test("says the role's name and what it may do in the reader's language", async () => {
    const mail = inviteMail(await mailWords('de'), {
      email: 'a@b.c',
      role: 'viewer',
      invitedBy: 'Nikki',
      url: 'https://example.com/invite/x',
      expiresAt: new Date(now),
    });
    expect(mail.details).toContainEqual({
      label: 'Rolle',
      value: 'Betrachter: Status, Auslastung und Logs, in ihren Gruppen',
    });
  });
});
