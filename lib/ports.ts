/**
 * What well-known ports are for, to name a service's published ones. Only
 * ones that mean one thing; any other is shown by its number alone, rather
 * than as a guess.
 */
const PORT_NAMES: Record<number, string> = {
  22: 'SSH',
  25: 'SMTP',
  53: 'DNS',
  80: 'HTTP',
  110: 'POP3',
  143: 'IMAP',
  443: 'HTTPS',
  465: 'SMTPS',
  587: 'Submission',
  993: 'IMAPS',
  995: 'POP3S',
  3306: 'MySQL',
  3478: 'STUN',
  5432: 'PostgreSQL',
  6379: 'Redis',
  25565: 'Minecraft Java',
  25575: 'RCON',
  19132: 'Minecraft Bedrock',
};

export function portName(port: number) {
  return PORT_NAMES[port];
}

/** The host part of an address as written: "Java: mc.niso.moe:25565" → "mc.niso.moe", ":19132" → "". */
export function hostOf(address: string) {
  try {
    if (/^https?:\/\//i.test(address)) return new URL(address).hostname;
  } catch {}
  return address.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
}
