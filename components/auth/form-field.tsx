import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** A labelled input, the only kind of field the auth forms need. */
export function FormField({
  id,
  label,
  ...props
}: React.ComponentProps<typeof Input> & { id: string; label: string }) {
  return (
    <div className='flex flex-col gap-2'>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} required {...props} />
    </div>
  );
}
