const KEY = 'com.finamx.algopack.futoi.token';

export function readLocalToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (window.localStorage.getItem(KEY) || window.sessionStorage.getItem(KEY) || '').trim();
  } catch {
    return '';
  }
}

export function writeLocalToken(token: string, remember = true): boolean {
  if (typeof window === 'undefined') return false;
  const value = token.trim();
  try {
    if (!value) {
      window.localStorage.removeItem(KEY);
      window.sessionStorage.removeItem(KEY);
      return true;
    }
    if (remember) {
      window.localStorage.setItem(KEY, value);
      window.sessionStorage.removeItem(KEY);
    } else {
      window.sessionStorage.setItem(KEY, value);
      window.localStorage.removeItem(KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export function clearLocalToken(): void {
  writeLocalToken('');
}

export function authHeaders(): HeadersInit {
  const token = readLocalToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
