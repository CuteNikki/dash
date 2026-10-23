/**
 * What a browser's user agent says it is, as a person would name it:
 * "Firefox on Linux", "Safari on iPhone". Only the common ones are told
 * apart; the rest are named by their first word, as curl or an app's own
 * client would be, or not at all.
 */

/** Checked in order, as most browsers' strings name others too: Edge's says Chrome and Safari. */
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bVivaldi\//, 'Vivaldi'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

/** A phone or tablet, which a list can show with its own icon. */
const MOBILE = /\b(?:Mobile|iPhone|iPad|Android)\b/;

export type Agent = { browser?: string; system?: string; mobile: boolean };

export function parseAgent(userAgent: string | null | undefined): Agent {
  const ua = userAgent ?? '';
  const browser =
    BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ??
    // Not a browser: its first word, as "curl" of "curl/8.5.0"
    ua.match(/^([\w.-]+)\//)?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
  return { browser, system, mobile: MOBILE.test(ua) };
}

/** "Firefox on Linux", or as much of that as it says. */
export function describeAgent(userAgent: string | null | undefined) {
  const { browser, system } = parseAgent(userAgent);
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'Unknown device';
}
