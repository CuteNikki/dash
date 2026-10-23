'use client';

import { RotateCwIcon } from 'lucide-react';

import { Brand } from '@/components/chrome/brand';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * What shows when the page itself fails, as the sign-in's card does, with a
 * way back: the dashboard's buttons say their own failures in a toast, so
 * this is for the rest, as dash not answering while it restarts.
 */
export default function PageError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className='flex flex-1 flex-col items-center justify-center gap-6 p-4'>
      <Brand />
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle className='text-base'>Something went wrong</CardTitle>
          <CardDescription>
            {/* A server error's own message is kept from the browser; its
                digest is what finds it in dash's logs */}
            {error.digest
              ? `dash couldn't show this page (${error.digest}).`
              : error.message}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={retry}>
            <RotateCwIcon />
            Try again
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
