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
  /** A line that's a JSON object, as structured loggers write them */
  json?: JsonLog;
};

/** A JSON log line's parts: what it says, how it says it, and the rest. */
export type JsonLog = {
  tone?: Tone;
  message?: string;
  logger?: string;
  /** Everything else, in the order it was written */
  fields: [string, unknown][];
  /** The whole object, to show indented */
  value: Record<string, unknown>;
};

/** The keys loggers use for these, as Caddy, zap, pino, bunyan and logrus write them. */
const LEVEL_KEYS = ['level', 'lvl', 'severity', 'levelname'];
const MESSAGE_KEYS = ['msg', 'message'];
const LOGGER_KEYS = ['logger', 'name', 'component', 'module'];
/** Left out of the fields, as the line's own time is shown beside it */
const TIME_KEYS = ['ts', 'time', 'timestamp', '@timestamp', 't'];

/** pino and bunyan count up: 40 is a warning, 50 and over an error */
function toneOfLevel(level: unknown): Tone | undefined {
  if (typeof level === 'number') {
    return level >= 50 ? 'error' : level >= 40 ? 'warning' : undefined;
  }
  if (typeof level !== 'string') return undefined;
  const word = level.toLowerCase();
  if (/^(error|err|fatal|panic|critical|crit|alert|emerg)/.test(word))
    return 'error';
  if (/^(warn|warning|wrn)/.test(word)) return 'warning';
  return undefined;
}

/** A line's JSON object, if the whole line is one. */
export function parseJsonLog(text: string): JsonLog | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const object = value as Record<string, unknown>;
  const first = (keys: string[]) => keys.find((k) => k in object);
  const levelKey = first(LEVEL_KEYS);
  const messageKey = first(MESSAGE_KEYS);
  const message = messageKey && object[messageKey];
  // A logger's name only when it's text, as bunyan's "name" is and a
  // request's "name" field might not be
  const loggerKey = first(LOGGER_KEYS);
  const logger = loggerKey && object[loggerKey];
  const named = typeof logger === 'string';
  const shownApart = new Set([
    ...TIME_KEYS,
    levelKey,
    typeof message === 'string' ? messageKey : undefined,
    named ? loggerKey : undefined,
  ]);
  return {
    tone: levelKey ? toneOfLevel(object[levelKey]) : undefined,
    message: typeof message === 'string' ? message : undefined,
    logger: named ? logger : undefined,
    fields: Object.entries(object).filter(([k]) => !shownApart.has(k)),
    value: object,
  };
}

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
  const text = segments.map((s) => s.text).join('');
  return {
    id,
    time: match ? new Date(match[1]) : undefined,
    text,
    segments,
    json: parseJsonLog(text),
  };
}
