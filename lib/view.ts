/** Services as tiles, arranged, or as a compact list. */
export type View = 'tiles' | 'list';

/** Where the browser keeps the view picked, for the server to draw the next page in. */
export const VIEW_COOKIE = 'dash-view';

export function viewFromCookie(value?: string): View {
  return value === 'list' ? 'list' : 'tiles';
}
