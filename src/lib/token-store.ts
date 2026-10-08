import { cookies } from 'next/headers';

const COOKIE = 'futoi_sid';
const tokens = new Map<string, string>();

export function envToken(): string {
  return (process.env.ALGOPACK_TOKEN ?? '').trim();
}

export async function sessionToken(): Promise<string | undefined> {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (!sid) return undefined;
  return tokens.get(sid);
}

export async function resolveBearer(): Promise<string> {
  return (await sessionToken()) || envToken();
}

export async function hasBearer(): Promise<boolean> {
  return Boolean(await resolveBearer());
}

export async function saveSessionToken(token: string): Promise<void> {
  const jar = await cookies();
  let sid = jar.get(COOKIE)?.value;
  if (!sid) {
    sid = crypto.randomUUID();
    jar.set(COOKIE, sid, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  tokens.set(sid, token.trim());
}
