/**
 * Terminal colors in log lines, mapped onto the theme: red, yellow and green
 * keep their meaning, gray and dim text is muted, and the other colors are
 * left as plain text so logs don't turn into a rainbow.
 */
export type Tone = 'error' | 'warning' | 'success' | 'muted';

export type Segment = { text: string; tone?: Tone; bold?: boolean };

const ESC = String.fromCharCode(27);
/** Color and style changes: ESC [ <codes> m */
const SGR = new RegExp(`${ESC}\\[([0-9;]*)m`, 'g');
/** Other terminal controls (cursor moves, clearing, titles), dropped */
const OTHER_CONTROLS = new RegExp(
  `${ESC}\\[[0-9;?]*[A-Za-ln-z]|${ESC}\\][^\\u0007]*(\\u0007|${ESC}\\\\)|${ESC}[()][0-9A-Za-z]`,
  'g'
);

const FOREGROUND: Record<number, Tone | undefined> = {
  30: 'muted',
  31: 'error',
  32: 'success',
  33: 'warning',
  90: 'muted',
  91: 'error',
  92: 'success',
  93: 'warning',
};

export function hasAnsi(text: string) {
  return text.includes(ESC);
}

/**
 * What a terminal ends up showing of a line: a carriage return goes back to
 * its start, and what follows is drawn over what came before. Programs with
 * an interactive console (a Minecraft server's ">" prompt) redraw their
 * prompt that way before every line.
 */
export function afterCarriageReturn(line: string) {
  const parts = line.replace(/\r+$/, '').split('\r');
  return (
    parts.findLast((part) => part.replace(OTHER_CONTROLS, '') !== '') ?? ''
  );
}

/** Colors and other terminal controls a line may start with, kept when the time after them is dropped */
const LEADING_CONTROLS = `((?:${ESC}\[[0-9;?]*[A-Za-z])*)`;
/** 11:49:59, 2026-10-21 11:49:49.123, 2026/10/21T11:49:49Z and the like */
const TIME = String.raw`(?:\d{4}[-/.]\d{2}[-/.]\d{2}[T ])?\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?`;
const LEADING_TIMES = [
  // "[2026/10/18 21:16:57] INFO: …" → "INFO: …"
  [new RegExp(String.raw`^${LEADING_CONTROLS}\[\s*${TIME}\s*\]\s*`), '$1'],
  // "[11:49:59 INFO]: …" → "[INFO]: …"
  [new RegExp(String.raw`^${LEADING_CONTROLS}\[\s*${TIME}\s+`), '$1['],
  // "2026-10-21 12:00:00 WARN …" → "WARN …"
  [new RegExp(String.raw`^${LEADING_CONTROLS}${TIME}\s+`), '$1'],
] as const;

/**
 * A line without the time it starts with: the log already shows when Docker
 * got each line, to the moment and in the viewer's own time zone, where
 * programs often write theirs in UTC.
 */
export function withoutLeadingTime(line: string) {
  for (const [pattern, replacement] of LEADING_TIMES) {
    if (pattern.test(line)) return line.replace(pattern, replacement);
  }
  return line;
}

export function parseAnsi(input: string): Segment[] {
  const text = input.replace(OTHER_CONTROLS, '');
  const segments: Segment[] = [];
  let tone: Tone | undefined;
  let dim = false;
  let bold = false;
  let last = 0;

  const push = (end: number) => {
    if (end <= last) return;
    segments.push({
      text: text.slice(last, end),
      tone: tone ?? (dim ? 'muted' : undefined),
      bold,
    });
  };

  for (const match of text.matchAll(SGR)) {
    push(match.index);
    last = match.index + match[0].length;
    const codes = match[1] === '' ? [0] : match[1].split(';').map(Number);
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) {
        tone = undefined;
        dim = false;
        bold = false;
      } else if (code === 1) bold = true;
      else if (code === 2) dim = true;
      else if (code === 22) {
        bold = false;
        dim = false;
      } else if (code === 39) tone = undefined;
      else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
        tone = FOREGROUND[code];
      } else if (code === 38 || code === 48) {
        // 256-color (5;n) or true color (2;r;g;b): skip the arguments
        i += codes[i + 1] === 5 ? 2 : 4;
      }
    }
  }
  push(text.length);
  return segments;
}
