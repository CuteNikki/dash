'use client';

import { CopyIcon, DownloadIcon } from 'lucide-react';

import { SERVER_NAME } from '@/lib/site';

import { copyText } from '@/components/common/toasts';
import { Button } from '@/components/ui/button';

/** Saves the codes as a text file, named for the server they're for. */
function download(codes: string[], email: string) {
  // Read here, in the browser, as there's no location while it's rendered
  // on the server
  const site = SERVER_NAME ?? location.hostname;
  const text = [
    `Backup codes for dash on ${site} (${email})`,
    'Each signs you in once, in place of your authenticator app’s code.',
    '',
    ...codes,
    '',
  ].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${site}-backup-codes.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Backup codes, shown this once: Better Auth keeps them encrypted, and
 * shows none again, only new ones in their place.
 */
export function BackupCodes({
  codes,
  email,
}: {
  codes: string[];
  email: string;
}) {
  return (
    <div className='flex flex-col gap-3'>
      <p>
        Each signs you in once, should you lose your authenticator app. Keep
        them somewhere safe, such as your password manager: they’re shown only
        now.
      </p>
      <ul className='grid w-fit grid-cols-2 gap-x-6 gap-y-1 rounded-md border bg-field px-3 py-2 font-mono tabular-nums'>
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          onClick={() => copyText(codes.join('\n'), 'Copied the backup codes')}
        >
          <CopyIcon />
          Copy
        </Button>
        <Button variant='outline' onClick={() => download(codes, email)}>
          <DownloadIcon />
          Download
        </Button>
      </div>
    </div>
  );
}
