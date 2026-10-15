const MSK = 'Europe/Moscow';

export function mskHm(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: MSK,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function mskDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: MSK });
}

export function hmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function isAfterCutoff(iso: string, cutoffHhmm: string): boolean {
  return hmToMinutes(mskHm(iso)) >= hmToMinutes(cutoffHhmm);
}

export function minutesBetween(a: string, b: string): number {
  return Math.abs(Date.parse(b) - Date.parse(a)) / 60_000;
}

export function formatMmSs(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function frontContract(family: string, asOf = new Date()): string {
  const month = asOf.getUTCMonth() + 1;
  const year = asOf.getUTCFullYear() % 10;
  const code = month <= 3 ? 'H' : month <= 6 ? 'M' : month <= 9 ? 'U' : 'Z';
  return `${family}${code}${year}`;
}
