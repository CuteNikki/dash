'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** Asked before a service is stopped, from its window or the list. */
export function StopDialog({
  name,
  open,
  onOpenChangeAction,
  onStopAction,
}: {
  name?: string;
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  onStopAction: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChangeAction}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It stays stopped until you start it again, including after the
            server restarts.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant='destructive' onClick={onStopAction}>
            Stop
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
