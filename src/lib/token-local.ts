const KEY = 'com.finamx.algopack.futoi.token';

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
}

export function readLocalToken(): string {
  if (typeof window === 'undefined') return '';
  return store()?.getItem(KEY)?.trim() ?? '';
}

export function writeLocalToken(token: string): boolean {
  const value = token.trim();
  const s = store();
  if (!s) return false;
  if (value) s.setItem(KEY, value);
  else s.removeItem(KEY);
  return true;
}

export function clearLocalToken(): void {
  store()?.removeItem(KEY);
}
