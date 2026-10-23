/** What a stored file can be shown as, by its name: a picture, a video, a sound, or none. */
export function mediaKind(key: string) {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  if (/^(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/.test(ext)) return 'image';
  if (/^(mp4|webm|mov|m4v|ogv)$/.test(ext)) return 'video';
  if (/^(mp3|ogg|oga|wav|flac|m4a|opus)$/.test(ext)) return 'audio';
  return undefined;
}
