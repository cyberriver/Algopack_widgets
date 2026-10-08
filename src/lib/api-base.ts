export function apiPath(path: string): string {
  const base = (process.env.NEXT_PUBLIC_BFF_URL ?? '').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
