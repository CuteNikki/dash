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

/** The longest a value is shown in a summary, text cut short past it. */
const MAX_VALUE = 60;
/** Longer than this, a value with no spaces, a hash or an id, is left for the whole line. */
const MAX_TOKEN = 40;
/** A list or an object this short in JSON is shown as it is, not folded. */
const MAX_INLINE = 40;

/**
 * A field's value as a JSON line's summary shows it, or undefined to leave
 * it for the whole line: nothing for an empty one, or for a hash or an id
 * too long to read at a glance; a short list or object as it is, a longer
 * one folded; a number with its tail rounded off; text quoted if it has
 * spaces, and cut short.
 */
function summaryValue(value: unknown): string | undefined {
  if (value === null || value === '') return undefined;
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    if (json === '[]' || json === '{}') return undefined;
    if (json.length <= MAX_INLINE) return json;
    return Array.isArray(value) ? '[…]' : '{…}';
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    // A big one, as seconds since 1970, to the whole; a small one, as a
    // duration, to three figures
    return String(
      Math.abs(value) >= 1000 ? Math.round(value) : Number(value.toPrecision(3))
    );
  }
  if (typeof value !== 'string') return String(value);
  const bare = /^[^\s"]+$/.test(value);
  if (bare && value.length > MAX_TOKEN) return undefined;
  const text = bare ? value : JSON.stringify(value);
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text;
}

/** A JSON line's fields as its summary shows them, those that say something at a glance. */
export function summaryFields(json: JsonLog): [string, string][] {
  return json.fields.flatMap(([key, value]) => {
    const shown = summaryValue(value);
    return shown === undefined ? [] : [[key, shown]];
  });
}

/** A list or object up to this long goes on one line of the indented JSON. */
const INLINE_WIDTH = 72;

/** A value on one line: spaced as it would be indented, for reading. */
function oneLine(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(oneLine).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${oneLine(v)}`).join(', ')} }`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * A value as indented JSON, with what's short on one line: a header's list
 * of one, a small object. A list of one goes on one line however long its
 * one value, as a User-Agent is, rather than three.
 */
export function compactJson(value: unknown, indent = ''): string {
  const flat = oneLine(value);
  if (
    !value ||
    typeof value !== 'object' ||
    flat.length <= INLINE_WIDTH ||
    (Array.isArray(value) &&
      value.length === 1 &&
      (value[0] === null || typeof value[0] !== 'object'))
  )
    return flat;
  const inner = indent + '  ';
  const rows = Array.isArray(value)
    ? value.map((v) => inner + compactJson(v, inner))
    : Object.entries(value).map(
        ([k, v]) => `${inner}${JSON.stringify(k)}: ${compactJson(v, inner)}`
      );
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return `${open}\n${rows.join(',\n')}\n${indent}${close}`;
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
