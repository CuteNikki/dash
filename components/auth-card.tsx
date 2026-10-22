import { Brand } from '@/components/brand';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/** The centered card the sign-in and setup pages are made of. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className='flex flex-1 flex-col items-center justify-center gap-6 p-4'>
      <Brand />
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle className='text-base'>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
