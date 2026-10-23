/** What a stored file can be shown as, by its name: a picture, a video, a sound, or none. */
export function mediaKind(key: string) {
  const ext = extensionOf(key);
  if (/^(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/.test(ext)) return 'image';
  if (/^(mp4|webm|mov|m4v|ogv)$/.test(ext)) return 'video';
  if (/^(mp3|ogg|oga|wav|flac|m4a|opus)$/.test(ext)) return 'audio';
  return undefined;
}

/** "a/b.TAR.gz" → "gz"; "" for a name without one. */
function extensionOf(key: string) {
  const name = key.split('/').pop() ?? '';
  return name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
}

export type FileKind =
  'image' | 'video' | 'audio' | 'pdf' | 'text' | 'code' | 'data' | 'archive';

/** What sort of file it is, by its name, for its icon and how it's shown; undefined for one that can't be told. */
export function fileKind(key: string): FileKind | undefined {
  const media = mediaKind(key);
  if (media) return media;
  const ext = extensionOf(key);
  if (ext === 'pdf') return 'pdf';
  if (/^(txt|md|markdown|log|rst|ini|conf|cfg|env)$/.test(ext)) return 'text';
  if (/^(json|ya?ml|toml|xml|csv|tsv|sql)$/.test(ext)) return 'data';
  if (
    /^(html?|css|s[ac]ss|[cm]?[jt]sx?|py|rb|go|rs|java|sh|php|lua)$/.test(ext)
  )
    return 'code';
  if (/^(zip|tar|gz|tgz|bz2|xz|zst|7z|rar)$/.test(ext)) return 'archive';
  return undefined;
}
