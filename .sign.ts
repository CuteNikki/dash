/** As Better Auth signs cookies: value.base64(HMAC-SHA256(value, secret)), URL-encoded. */
export async function signCookieValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value)
  );
  return encodeURIComponent(
    `${value}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`
  );
}
