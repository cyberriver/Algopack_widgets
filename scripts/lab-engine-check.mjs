import assert from 'node:assert/strict';

function trueRange(prevClose, bar) {
  return Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
}

function atrAt(bars, index, period) {
  const start = Math.max(1, index - period);
  const ranges = [];
  for (let i = start; i < index; i++) ranges.push(trueRange(bars[i - 1].close, bars[i]));
  return ranges.reduce((a, b) => a + b, 0) / ranges.length;
}

function detect(bars, index, lookback) {
  const bar = bars[index];
  const prev = bars[index - 1];
  const slice = bars.slice(index - lookback, index);
  const u = Math.max(...slice.map((b) => b.high));
  const d = Math.min(...slice.map((b) => b.low));
  const atr = atrAt(bars, index, 20);
  const buffer = Math.max(2, 0.1 * atr);
  if (prev.close <= u + buffer && bar.close > u + buffer) return 'long';
  if (prev.close >= d - buffer && bar.close < d - buffer) return 'short';
  return null;
}

function bar(i, o, h, l, c) {
  return { begin: String(i), end: String(i + 1), open: o, high: h, low: l, close: c, complete: true };
}

const flat = [];
for (let i = 0; i < 24; i++) flat.push(bar(i, 100, 101, 99, 100));
flat.push(bar(24, 100, 110, 100, 108));
assert.equal(detect(flat, 24, 12), 'long');

const down = [];
for (let i = 0; i < 24; i++) down.push(bar(i, 100, 101, 99, 100));
down.push(bar(24, 100, 100, 90, 92));
assert.equal(detect(down, 24, 12), 'short');

assert.equal(detect(flat, 10, 12), null);

function joinAge(barStart, snap, now, maxAgeMin) {
  const ageVsBar = (Date.parse(barStart) - Date.parse(snap)) / 60_000;
  const ageVsNow = (Date.parse(now) - Date.parse(snap)) / 60_000;
  return { vsBar: ageVsBar <= maxAgeMin, vsNow: ageVsNow <= maxAgeMin };
}
const j = joinAge('2026-10-13T10:40:00.000Z', '2026-10-13T10:35:00.000Z', '2026-10-13T14:45:00.000Z', 10);
assert.equal(j.vsBar, true);
assert.equal(j.vsNow, false);

function oiChangeLn(now, ref) {
  return Math.log(now / ref);
}
assert.ok(oiChangeLn(110, 100) > 0);
assert.ok(oiChangeLn(90, 100) < 0);

function keepLast(barStart, snap) {
  return Date.parse(snap) < Date.parse(barStart);
}
assert.equal(keepLast('2026-10-13T11:20:00.000Z', '2026-10-13T10:35:00.000Z'), true);

function frontContract(family, asOf) {
  const month = asOf.getUTCMonth() + 1;
  const year = asOf.getUTCFullYear() % 10;
  const code = month <= 3 ? 'H' : month <= 6 ? 'M' : month <= 9 ? 'U' : 'Z';
  return `${family}${code}${year}`;
}
assert.equal(frontContract('Si', new Date('2026-10-15T12:00:00Z')), 'SiZ6');

function formatMmSs(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
assert.equal(formatMmSs(125), '02:05');

function normalizeColor(value) {
  const BARE_HSL = /^-?[\d.]+(deg)?[\s,]+[\d.]+%[\s,]+[\d.]+%(\s*\/\s*[\d.]+%?)?$/i;
  if (typeof value !== 'string') return '';
  const v = value.trim();
  return BARE_HSL.test(v) ? `hsl(${v})` : v;
}
assert.equal(normalizeColor('0 0% 100%'), 'hsl(0 0% 100%)');
assert.equal(normalizeColor('#101010'), '#101010');

console.log('lab engine check ok');
