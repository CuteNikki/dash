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
