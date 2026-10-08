'use client';

import type { SnapshotBlock, SnapshotResponse } from '@/lib/types';
import { hint, title } from './styles';

const muted = 'var(--color-muted-foreground, #5A6578)';
const up = '#12A36A';
const down = '#D64545';
const line = 'var(--color-border, #D5DBE5)';
const ink = 'var(--color-foreground, #0B1220)';
const mono = '"IBM Plex Mono", ui-monospace, monospace';

function fmt(n: number | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(n);
}

function signed(n: number | undefined): { text: string; color: string } {
  if (n == null) return { text: '—', color: muted };
  const text = `${n > 0 ? '+' : ''}${fmt(n)}`;
  const color = n > 0 ? up : n < 0 ? down : muted;
  return { text, color };
}

function Block({
  label,
  block,
  deltaContracts,
  deltaPersons,
}: {
  label: string;
  block: SnapshotBlock;
  deltaContracts?: SnapshotBlock | null;
  deltaPersons?: SnapshotBlock | null;
}) {
  const cols = [
    ['', 'Физ. длинные', 'Физ. короткие', 'Юр. длинные', 'Юр. короткие', 'Совокупный ОИ'],
    [
      'Количество договоров, шт.',
      fmt(block.fizLong),
      fmt(block.fizShort),
      fmt(block.yurLong),
      fmt(block.yurShort),
      fmt(block.totalOi),
    ],
  ];

  const dC = deltaContracts
    ? [
        'Изменение к предыдущему дню',
        signed(deltaContracts.fizLong),
        signed(deltaContracts.fizShort),
        signed(deltaContracts.yurLong),
        signed(deltaContracts.yurShort),
        signed(deltaContracts.totalOi),
      ]
    : null;
  const persons = [
    'Количество лиц',
    fmt(block.fizLongNum),
    fmt(block.fizShortNum),
    fmt(block.yurLongNum),
    fmt(block.yurShortNum),
    fmt(block.fizLongNum + block.fizShortNum + block.yurLongNum + block.yurShortNum),
  ];
  const dP = deltaPersons
    ? [
        'Изменение к предыдущему дню',
        signed(deltaPersons.fizLongNum),
        signed(deltaPersons.fizShortNum),
        signed(deltaPersons.yurLongNum),
        signed(deltaPersons.yurShortNum),
        signed(
          deltaPersons.fizLongNum +
            deltaPersons.fizShortNum +
            deltaPersons.yurLongNum +
            deltaPersons.yurShortNum,
        ),
      ]
    : null;

  return (
    <div style={{ marginBottom: 16, overflowX: 'auto' }}>
      <div style={{ fontSize: 11, color: muted, marginBottom: 6, fontFamily: mono, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, fontFamily: mono }}>
        <thead>
          <tr>
            {cols[0].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'right',
                  padding: '6px 8px',
                  borderBottom: `1px solid ${line}`,
                  fontWeight: 600,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {cols[1].map((c, i) => (
              <td key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '6px 8px' }}>
                {c}
              </td>
            ))}
          </tr>
          {dC ? (
            <tr>
              {dC.map((c, i) => (
                <td
                  key={i}
                  style={{
                    textAlign: i === 0 ? 'left' : 'right',
                    padding: '6px 8px',
                    color: typeof c === 'string' ? ink : c.color,
                  }}
                >
                  {typeof c === 'string' ? c : c.text}
                </td>
              ))}
            </tr>
          ) : null}
          <tr>
            {persons.map((c, i) => (
              <td key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '6px 8px' }}>
                {c}
              </td>
            ))}
          </tr>
          {dP ? (
            <tr>
              {dP.map((c, i) => (
                <td
                  key={i}
                  style={{
                    textAlign: i === 0 ? 'left' : 'right',
                    padding: '6px 8px',
                    color: typeof c === 'string' ? ink : c.color,
                  }}
                >
                  {typeof c === 'string' ? c : c.text}
                </td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function FutoiTable({ data }: { data: SnapshotResponse | null }) {
  if (!data?.current) {
    return <p style={hint}>Нет снимка FUTOI для {data?.secid ?? '—'}</p>;
  }
  const when = `${data.current.tradedate} ${data.current.tradetime}`.trim();
  return (
    <div>
      <h2 style={title}>Открытые позиции по фьючерсам</h2>
      <p style={hint}>
        {data.assetName}. Срез {when || '—'}. Обновление каждые 5 минут
        {data.stale ? ' · данные протухли' : ''}
      </p>
      <Block
        label={when || 'Текущий срез'}
        block={data.current}
        deltaContracts={data.deltaContracts}
        deltaPersons={data.deltaPersons}
      />
      {data.previousClose ? (
        <Block
          label={`${data.previousClose.tradedate} ${data.previousClose.tradetime}`.trim() || 'Предыдущий день'}
          block={data.previousClose}
        />
      ) : null}
    </div>
  );
}
