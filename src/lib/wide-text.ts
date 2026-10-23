/**
 * What a terminal draws two cells wide: an emoji, as one shown as a picture
 * by default or asked to be with U+FE0F, with its skin tone and whatever
 * it's joined to; or a Chinese, Japanese or Korean character, one at a time.
 * Others, as ✔ or ©, are drawn one cell wide, as text.
 */
const WIDE =
  /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)(?:\p{Emoji_Modifier}|️|‍\p{Extended_Pictographic}️?)*|[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/gu;

/**
 * Text in runs, each wide character its own, so it can be drawn exactly two
 * cells wide as a terminal does, and what's lined up after it in a table
 * stays lined up. "a✅b" → a, ✅ (wide), b.
 */
export function splitWide(text: string): { text: string; wide?: true }[] {
  const runs: { text: string; wide?: true }[] = [];
  let at = 0;
  for (const match of text.matchAll(WIDE)) {
    if (match.index > at) runs.push({ text: text.slice(at, match.index) });
    runs.push({ text: match[0], wide: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at) });
  return runs;
}
