import { formatAddress, splitAddress } from '@/lib/format';

/** An address as written, as words: "Java mc.niso.moe:25565". */
export function addressWords(entry: string) {
  const { label } = splitAddress(entry);
  return label ? `${label} ${formatAddress(entry)}` : formatAddress(entry);
}

/** An address as a tile shows it, after what it's for when it says: "Java mc.niso.moe:25565". */
export function AddressText({ entry }: { entry: string }) {
  const { label } = splitAddress(entry);
  return (
    <>
      {label && (
        <span className='font-medium text-foreground/70'>{label} </span>
      )}
      {formatAddress(entry)}
    </>
  );
}
