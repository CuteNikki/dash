import {
  afterCarriageReturn,
  hasAnsi,
  parseAnsi,
  withoutLeadingTime,
  type Segment,
  type Tone,
} from '@/lib/ansi';

/** A line of a log or of a job's output, ready to show. */
export type LogLine = {
  id: number;
  time?: Date;
  /** Without color codes, for filtering */
  text: string;
  segments: Segment[];
};

const TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s?/;
/**
 * The level a line states, for lines without colors of their own: a level
 * word in capitals (ERROR, WARN), a structured one ("level":"error",
 * level=warn), or the line starting with it ("error: …", "[warn]"). The words
 * inside a file name or a message, like commands/warn.ts, don't count.
 */
function levelPattern(capitals: string, words: string) {
  return new RegExp(
    [
      `\\b(${capitals})\\b`,
      `\\blevel["']?\\s*[:=]\\s*["']?(${words})\\b`,
      `^\\s*\\[?(${words})\\]?:?\\s`,
    ].join('|')
  );
}
const ERROR_LEVEL = levelPattern(
  'ERROR|ERR|FATAL|PANIC|CRITICAL',
  'error|err|fatal|panic|critical'
);
const WARNING_LEVEL = levelPattern('WARN|WARNING|WRN', 'warn|warning|wrn');

/** A line's own colors, or for one without, the level it states. */
function segmentsOf(text: string): Segment[] {
  if (hasAnsi(text)) return parseAnsi(text);
  const tone: Tone | undefined = ERROR_LEVEL.test(text)
    ? 'error'
    : WARNING_LEVEL.test(text)
      ? 'warning'
      : undefined;
  return [{ text, tone }];
}

/** A line as written, with Docker's timestamp in front of it if it has one. */
export function parseLogLine(id: number, raw: string): LogLine {
  const match = raw.match(TIMESTAMP);
  const segments = segmentsOf(
    withoutLeadingTime(
      afterCarriageReturn(match ? raw.slice(match[0].length) : raw)
    )
  );
  return {
    id,
    time: match ? new Date(match[1]) : undefined,
    text: segments.map((s) => s.text).join(''),
    segments,
  };
}
