'use client';

import { useTranslations } from 'next-intl';

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
  const t = useTranslations('service');
  return (
    <AlertDialog open={open} onOpenChange={onOpenChangeAction}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('stopTitle', { name: name ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('stopDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction variant='destructive' onClick={onStopAction}>
            {t('stop')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
