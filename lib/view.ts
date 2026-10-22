/** Services as tiles, arranged, or as a compact list. */
export type View = 'tiles' | 'list';

/** Where the browser keeps the view picked, for the server to draw the next page in. */
export const VIEW_COOKIE = 'dash-view';

export function viewFromCookie(value?: string): View {
  return value === 'list' ? 'list' : 'tiles';
}

/** Which services the list shows: all, one group's, or the stopped ones. */
export type ListFilter =
  { kind: 'all' } | { kind: 'group'; name: string } | { kind: 'stopped' };

/** Where the browser keeps the list's filter, as it does the view. */
export const FILTER_COOKIE = 'dash-filter';

/** "all", "stopped" or "group:Games", escaped to sit in a cookie. */
export function filterToCookie(filter: ListFilter) {
  return encodeURIComponent(
    filter.kind === 'group' ? `group:${filter.name}` : filter.kind
  );
}

export function filterFromCookie(value?: string): ListFilter {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value ?? '');
  } catch {
    return { kind: 'all' };
  }
  if (decoded === 'stopped') return { kind: 'stopped' };
  if (decoded.startsWith('group:'))
    return { kind: 'group', name: decoded.slice('group:'.length) };
  return { kind: 'all' };
}
