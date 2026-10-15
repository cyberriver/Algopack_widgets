'use client';

import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { setupEmbedShell, type ExtensionBridge } from '@finamx/extension-sdk';
import { useBridge } from '@/hooks/use-bridge';
import { useLab } from '@/hooks/use-lab';
import { useHostTokens } from '@/hooks/use-tokens';
import { HYPOTHESIS_CATALOG } from '@/lib/lab/hypotheses';
import { formatMmSs, frontContract } from '@/lib/lab/time';
import type { OhlcBar } from '@/lib/moex';
import {
  LAB_ENGINE_VERSION,
  type InstrumentProfile,
  type HypothesisId,
  type HypothesisStatus,
  type LabEvent,
  type LabExperiment,
  type LabMarket,
  type LabTrade,
  type Lamp,
  type QualityReview,
} from '@/lib/lab/types';
import { ASSET_NAMES, DEFAULT_UNIVERSE, extensionIdFor, type WidgetSlug } from '@/lib/types';
import { eyebrow, hint, input, primaryBtn, secondaryBtn, title } from './styles';

const LabRuntime = createContext<{ slug: WidgetSlug; bridge: ExtensionBridge | null }>({
  slug: 'lab',
  bridge: null,
});

const LAMP_COLOR: Record<Lamp, string> = {
  green: 'var(--color-primary)',
  yellow: 'var(--warn)',
  red: 'var(--color-destructive)',
  gray: 'var(--color-muted-foreground)',
};

const LAMP_RU: Record<Lamp, string> = {
  green: 'зелёный',
  yellow: 'жёлтый',
  red: 'красный',
  gray: 'серый',
};

const HYP_STATUSES: HypothesisStatus[] = ['open', 'watching', 'abandoned'];

function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function ageFrom(now: number, iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now - t) / 1000));
}

function LabShell({ slug, children }: { slug: WidgetSlug; children: ReactNode }) {
  const { bridge, error } = useBridge(extensionIdFor(slug));
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const rootRef = useCallback((node: HTMLDivElement | null) => setRootEl(node), []);
  useHostTokens(bridge, rootEl);
  useEffect(() => {
    if (!bridge || !rootEl) return;
    return setupEmbedShell(bridge, rootEl);
  }, [bridge, rootEl]);
  return (
    <LabRuntime.Provider value={{ slug, bridge }}>
      <div ref={rootRef} style={{ minHeight: '100%', background: 'var(--color-background)', color: 'var(--color-foreground)' }}>
        {error ? (
          <Card label="Нет связи с Open Platform">
            <p style={hint}>{error}. Обновите виджет; если ошибка повторится, проверьте host session.</p>
          </Card>
        ) : children}
      </div>
    </LabRuntime.Provider>
  );
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: 12,
        marginBottom: 12,
        background: 'var(--color-card)',
        color: 'var(--color-card-foreground)',
      }}
    >
      <div style={eyebrow}>{label}</div>
      {children}
    </section>
  );
}

function MethodPane() {
  const { data } = useLab();
  const p = data?.protocol;
  return (
    <>
      <h2 style={title}>Методология</h2>
      <p style={hint}>
        {p?.id ?? 'Si_breakout_v0.2'} · вопрос: ценность 15-мин ΔOI · движок {LAB_ENGINE_VERSION}
      </p>
      <Card label="Сопротивление и поддержка диапазона">
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>
          <strong>Сопротивление</strong> — максимум high за последние {p?.lookback_bars ?? 12} закрытых баров{' '}
          <em>до</em> текущего. Сам бар, на котором ищем пробой, в расчёт не входит.
        </p>
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>
          <strong>Поддержка</strong> — минимум low на том же окне. Буфер = max(2 тика, 0.1 × ATR
          {p?.atr_bars ?? 20}). Уровень пробоя вверх — сопротивление + буфер, вниз — поддержка − буфер.
        </p>
        <p style={{ fontSize: 13, margin: 0 }}>
          Пробой вверх: прошлый close был не выше уровня пробоя, текущий close закрылся выше него. Это не «коснулись
          хвостом», а закрытие за зоной. Дополнительно из стакана Algopack: VWAP bid/ask 10 уровней (obstats).
        </p>
      </Card>
      <Card label="Что считаем">
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>
          «Пробой цены»: close за сопротивлением + буфер или поддержкой − буфер против прошлого close. Окно уровней —{' '}
          {p?.lookback_bars ?? 12} баров, ATR {p?.atr_bars ?? 20}.
        </p>
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>
          «Пробой цены + рост OI»: тот же пробой и ΔOI = ln(OI_now / OI_ref) &gt; 0. Разница контрактов пишется рядом, в фильтр
          не идёт.
        </p>
        <p style={{ fontSize: 13, margin: 0 }}>FUTOI приходит раз в 5 минут. Lifetime — как давно APIM ответил успешно.</p>
      </Card>
      <Card label="Почему не вошёл вариант с ростом OI">
        <Row k="oi_unavailable" v="снимка не было вообще — не «фильтр сказал нет»" />
        <Row k="oi_received_late" v="FUTOI впервые получен после deadline; пробой цены продолжает, вариант с OI пропускается" />
        <Row k="price_received_late" v="финальная M5-свеча впервые получена после deadline; оба варианта пропускаются" />
        <Row k="processing_late" v="пакеты лежали вовремя, но worker начал расчёт с опозданием" />
        <Row k="filter" v="снимок есть, роста ln не было" />
        <Row k="stale" v="снимок старше 10 мин; держим, в вклад фильтра не кладём" />
      </Card>
      <p style={hint}>Не утверждаем: робот, допуск в live, «OI помог» на графике. Текст не редактор протокола.</p>
    </>
  );
}

function ProtocolPane() {
  const { data, loading, error } = useLab();
  if (loading && !data) return <p style={hint}>Загрузка протокола…</p>;
  if (error && !data) return <p style={hint}>{error}</p>;
  if (!data) return <p style={hint}>Нет протокола на BFF.</p>;
  const p = data.protocol;
  return (
    <>
      <h2 style={title}>Протокол</h2>
      <p style={hint}>
        {p.id} · live_variant: {p.live_variant} · журнал {data.session.id} · движок {LAB_ENGINE_VERSION}
      </p>
      <Card label="Заморозка">
        <Row k="Серия" v={`${p.contract} · заморожена на сессию`} />
        <Row k="Таймфрейм" v={`Основной ТФ: ${p.primary_timeframe}. Другие таймфреймы пока не рассчитываются`} />
        <Row k="D" v="только график ФинамХ, без сделок лаборатории" />
        <Row k="История инд." v="across_sessions" />
        <Row k="Ночь" v="forbidden" />
        <Row k="OI окно" v={`${p.oi_window_min} мин; source_time < bar_start, received_at ≤ deadline`} />
        <Row k="Свежесть" v={`oi_fresh ≤ ${p.max_snapshot_age_min} мин; старше — держим, не discard`} />
        <Row k="Барьер" v={`решение до T + ${p.decision_deadline_ms / 1000} сек`} />
        <Row k="Worker delay" v={`processing_late после ${p.max_signal_processing_ms / 1000} сек от готовности барьера`} />
        <Row k="Наложение" v="событие да / сделка skip position_already_open" />
      </Card>
      <Card label="Варианты (чтение)">
        <Row k="B_PRICE" v="пробой M5" />
        <Row k="B_OI_POSITIVE" v="ln(OI_now/OI_ref) > 0 иначе filter; нет снимка → oi_unavailable" />
        <Row k="F_*" v="P1" />
      </Card>
      <p style={hint}>Смена поля = новая версия протокола, не правка этой.</p>
    </>
  );
}

function ReadinessPane() {
  const { data, loading, error, tick } = useLab();
  if (loading && !data) return <p style={hint}>Сверяю лампы…</p>;
  if (error && !data) return <p style={hint}>{error}</p>;
  const r = data?.readiness;
  return (
    <>
      <h2 style={title}>Готовность сессии</h2>
      <p style={hint}>
        ТФ {r?.timeframe ?? 'M5'} · тик {data?.last_tick_at ?? 'ещё не было'}
        {data?.last_futoi_ok_at ? ` · FUTOI ok ${data.last_futoi_ok_at}` : ''}
        {data?.fetched ? ` · бары ${data.fetched.bars} · FUTOI ${data.fetched.futoi}` : ''}
      </p>
      {r ? (
        <Card label="Три лампы">
          <LampRow name="цена" lamp={r.price_ready} detail={r.price_detail} />
          <LampRow name="OI" lamp={r.oi_ready} detail={r.oi_detail} />
          <LampRow name="исполнение" lamp={r.execution_ready} detail={r.execution_detail} />
          <p style={{ ...hint, marginTop: 8 }}>{r.consequence}</p>
        </Card>
      ) : (
        <p style={hint}>Worker ещё не вернул готовность. Нажмите «Обновить».</p>
      )}
      {data?.last_error ? <p style={hint}>Ошибка тика: {data.last_error}</p> : null}
      <button type="button" style={secondaryBtn} onClick={() => void tick()}>
        Обновить
      </button>
    </>
  );
}

function LabBPane() {
  const { data, loading, error } = useLab();
  if (loading && !data) return <p style={hint}>Детектор…</p>;
  if (error && !data) return <p style={hint}>{error}</p>;
  const ev = data?.events.at(-1);
  if (!ev) {
    const market = data?.market;
    const upDistance =
      market?.resistance != null ? Math.max(0, market.resistance - market.close) : null;
    const downDistance =
      market?.support != null ? Math.max(0, market.close - market.support) : null;
    return (
      <>
        <h2 style={title}>Детектор пробоя M5</h2>
        <p style={hint}>Событий после запуска ещё нет. Ниже показано текущее состояние детектора, а не торговый сигнал.</p>
        {market ? (
          <Card label={`${market.contract} · текущий M5`}>
            <Row k="Последняя цена" v={fmt(market.close)} />
            <Row k="Сопротивление / поддержка" v={`${fmt(market.resistance)} / ${fmt(market.support)}`} />
            <Row k="До пробоя вверх" v={upDistance == null ? '—' : `${fmt(upDistance)} пунктов`} />
            <Row k="До пробоя вниз" v={downDistance == null ? '—' : `${fmt(downDistance)} пунктов`} />
            <Row k="ATR / буфер" v={`${fmt(market.atr)} / ${fmt(market.buffer)}`} />
            <Row k="Бар" v={`${eventTimestamp(market.bar_begin)} → ${eventTimestamp(market.bar_end)} · ${market.complete ? 'закрыт' : 'формируется'}`} />
          </Card>
        ) : <p style={hint}>Рынок ещё не загружен.</p>}
      </>
    );
  }
  const b0 = data?.trades.find((t) => t.event_id === ev.event_id && t.variant_id === 'B_PRICE');
  const b1 = data?.trades.find((t) => t.event_id === ev.event_id && t.variant_id === 'B_OI_POSITIVE');
  return (
    <>
      <h2 style={title}>Детектор пробоя M5</h2>
      <p style={hint}>
        M5 · {ev.contract} · Пробой цены {tradeLine(b0)} · Пробой + рост OI {tradeLine(b1)}
      </p>
      <Card label="Уровни последнего факта">
        <Row k="Сопротивление / поддержка" v={`${fmt(ev.range_u)} / ${fmt(ev.range_d)}`} />
        <Row k="ATR / буфер" v={`${fmt(ev.atr)} / ${fmt(ev.buffer)}`} />
        <Row k="close / уровень" v={`${fmt(ev.close)} / ${fmt(ev.level)} ${ev.direction}`} />
      </Card>
      <Card label="Последнее событие">
        <Row k="id" v={`${ev.event_id} · episode ${ev.market_episode_id}`} />
        <Row k="OI" v={oiLine(ev)} />
        <Row k="age / life" v={`${formatMmSs(ev.snapshot_age_sec)} / ${formatMmSs(ev.futoi_lifetime_sec)}`} />
        <Row k="Пробой цены" v={tradeLine(b0)} />
        <Row k="Пробой + рост OI" v={tradeLine(b1)} />
        <Row k="delay" v={`${ev.processing_delay_ms} мс · ${ev.decision_lateness}`} />
        <p style={hint}>Вердикта на графике нет. Факт только здесь и в таблице наблюдений.</p>
      </Card>
    </>
  );
}

type ObservationSortKey =
  | 'index'
  | 'time'
  | 'priceReceived'
  | 'oiReceived'
  | 'deadline'
  | 'processing'
  | 'event'
  | 'price'
  | 'move'
  | 'resistance'
  | 'support'
  | 'volume'
  | 'orders'
  | 'oi'
  | 'age'
  | 'life'
  | 'b0'
  | 'b1'
  | 'quality';

const OBSERVATION_COLUMNS: Array<{ key: ObservationSortKey; label: string }> = [
  { key: 'index', label: '№' },
  { key: 'time', label: 'source time' },
  { key: 'priceReceived', label: 'price received' },
  { key: 'oiReceived', label: 'OI received' },
  { key: 'deadline', label: 'deadline' },
  { key: 'processing', label: 'processing, мс' },
  { key: 'event', label: 'событие' },
  { key: 'price', label: 'цена' },
  { key: 'move', label: 'Δ5м' },
  { key: 'resistance', label: 'сопротивление' },
  { key: 'support', label: 'поддержка' },
  { key: 'volume', label: 'объём' },
  { key: 'orders', label: 'заявки' },
  { key: 'oi', label: 'ΔOI ln' },
  { key: 'age', label: 'age@бар' },
  { key: 'life', label: 'life@событие' },
  { key: 'b0', label: 'Пробой цены' },
  { key: 'b1', label: 'Пробой + OI' },
  { key: 'quality', label: 'качество' },
];

function eventTimestamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toISOString().replace('T', ' ').replace('.000Z', 'Z');
}

function compareValues(a: string | number | null, b: string | number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'ru', { numeric: true });
}

function ObservationsPane() {
  const { data, loading, error, annotate } = useLab();
  const now = useNow();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sort, setSort] = useState<{ key: ObservationSortKey; direction: 'asc' | 'desc' }>({
    key: 'time',
    direction: 'desc',
  });
  if (loading && !data) return <p style={hint}>Журнал…</p>;
  if (error && !data) return <p style={hint}>{error}</p>;
  const chronological = data?.events ?? [];
  const ordinal = new Map(chronological.map((event, index) => [event.event_id, index + 1]));
  const trade = (event: LabEvent, variant: 'B_PRICE' | 'B_OI_POSITIVE') =>
    data?.trades.find((item) => item.event_id === event.event_id && item.variant_id === variant);
  const quality = (event: LabEvent) => data?.annotations[event.event_id]?.quality_review ?? 'not_reviewed';
  const sortValue = (event: LabEvent, key: ObservationSortKey): string | number | null => {
    switch (key) {
      case 'index': return ordinal.get(event.event_id) ?? 0;
      case 'time': return Date.parse(event.signal_time);
      case 'priceReceived': return Date.parse(event.price_received_at);
      case 'oiReceived': return event.received_time ? Date.parse(event.received_time) : null;
      case 'deadline': return Date.parse(event.decision_deadline);
      case 'processing': return event.processing_delay_ms;
      case 'event': return event.event_id;
      case 'price': return event.close;
      case 'move': return event.move ?? null;
      case 'resistance': return event.range_u;
      case 'support': return event.range_d;
      case 'volume': return event.volume ?? null;
      case 'orders':
        return event.put_vol_b == null && event.put_vol_s == null
          ? null
          : (event.put_vol_b ?? 0) + (event.put_vol_s ?? 0);
      case 'oi': return event.oi_change_ln;
      case 'age': return event.snapshot_age_sec;
      case 'life': return event.futoi_lifetime_sec;
      case 'b0': return shortTrade(trade(event, 'B_PRICE'));
      case 'b1': return shortTrade(trade(event, 'B_OI_POSITIVE'));
      case 'quality': return quality(event);
    }
  };
  const events = [...chronological].sort((a, b) => {
    const result = compareValues(sortValue(a, sort.key), sortValue(b, sort.key));
    return sort.direction === 'asc' ? result : -result;
  });
  const ev = events.find((event) => event.event_id === selected) ?? events[0];
  const linked = ev ? (data?.annotations[ev.event_id]?.hypothesis_ids ?? []) : [];
  const liveAge = ageFrom(now, data?.last_futoi_asof ?? data?.market?.last_futoi_asof);
  const liveLife = ageFrom(now, data?.last_futoi_ok_at);
  return (
    <>
      <h2 style={title}>Наблюдения</h2>
      <p style={hint}>
        В верхней плашке age растёт до нового пакета FUTOI. В строке age — возраст снимка на момент M5-бара,
        life — давность успешного ответа APIM на момент события. Значения строки не меняются.
      </p>
      <p style={hint}>
        «Поздняя обработка» (processing_late) — исторический бар найден позже допустимых{' '}
        {data?.protocol.max_signal_processing_ms ?? 120_000} мс. Событие остаётся в журнале, но виртуальная сделка
        не открывается задним числом.
      </p>
      <QuoteStrip market={data?.market ?? null} liveAge={liveAge} liveLife={liveLife} />
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 2150 }}>
          <thead>
            <tr>
              {OBSERVATION_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  style={{ ...th, cursor: 'pointer', userSelect: 'none' }}
                  aria-sort={sort.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() =>
                    setSort((current) => ({
                      key: column.key,
                      direction: current.key === column.key && current.direction === 'asc' ? 'desc' : 'asc',
                    }))
                  }
                >
                  {column.label} {sort.key === column.key ? (sort.direction === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const b0 = data?.trades.find((t) => t.event_id === e.event_id && t.variant_id === 'B_PRICE');
              const b1 = data?.trades.find((t) => t.event_id === e.event_id && t.variant_id === 'B_OI_POSITIVE');
              const ann = data?.annotations[e.event_id];
              const q = ann?.quality_review ?? 'not_reviewed';
              return (
                <tr
                  key={e.event_id}
                  onClick={() => {
                    setSelected(e.event_id);
                    setNote(ann?.research_note ?? '');
                  }}
                  style={{
                    cursor: 'pointer',
                    background: ev?.event_id === e.event_id ? 'var(--color-muted)' : undefined,
                  }}
                >
                  <td style={td}>{ordinal.get(e.event_id)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{eventTimestamp(e.signal_time)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{eventTimestamp(e.price_received_at)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{e.received_time ? eventTimestamp(e.received_time) : '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{eventTimestamp(e.decision_deadline)}</td>
                  <td style={td}>{e.processing_delay_ms}</td>
                  <td style={td}>{e.event_id.slice(-10)}</td>
                  <td style={td}>{fmt(e.close)}</td>
                  <td style={td}>{signed(e.move)}</td>
                  <td style={td}>{fmt(e.range_u)}</td>
                  <td style={td}>{fmt(e.range_d)}</td>
                  <td style={td}>{fmtInt(e.volume)}</td>
                  <td style={td}>{putLine(e)}</td>
                  <td style={td}>
                    {e.oi_status === 'available' ? fmtLn(e.oi_change_ln) : e.oi_status === 'received_late' ? 'late' : 'unavail'}
                  </td>
                  <td style={td}>{formatMmSs(e.snapshot_age_sec)}</td>
                  <td style={td}>{formatMmSs(e.futoi_lifetime_sec)}</td>
                  <td style={td}>{shortTrade(b0)}</td>
                  <td style={td}>{shortTrade(b1)}</td>
                  <td style={td}>{q}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ev ? (
        <Card label={`Факт ${ev.event_id}`}>
          <p style={hint}>
            {eventTimestamp(ev.signal_time)} · close {fmt(ev.close)} · Δ бара {signed(ev.move)} · сопротивление{' '}
            {fmt(ev.range_u)} / поддержка {fmt(ev.range_d)} · объём {fmtInt(ev.volume)} · заявки {putLine(ev)} · ATR{' '}
            {fmt(ev.atr)} · {oiLine(ev)} · задержка {ev.processing_delay_ms} мс · {ev.decision_lateness}
          </p>
          <p style={hint}>
            source time {eventTimestamp(ev.signal_time)} · price received {eventTimestamp(ev.price_received_at)} · OI
            received {ev.received_time ? ` ${eventTimestamp(ev.received_time)}` : ' —'} · barrier{' '}
            {eventTimestamp(ev.barrier_ready_at)} · deadline {eventTimestamp(ev.decision_deadline)}
          </p>
          <p style={hint}>
            текущий возраст пакета {formatMmSs(ageFrom(now, ev.snapshot_time))} · age@бар{' '}
            {formatMmSs(ev.snapshot_age_sec)} · life@событие {formatMmSs(ev.futoi_lifetime_sec)}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {(['not_reviewed', 'valid', 'data_issue', 'protocol_issue'] as QualityReview[]).map((q) => (
              <button
                key={q}
                type="button"
                style={secondaryBtn}
                onClick={() => void annotate(ev.event_id, { quality_review: q })}
              >
                {q}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {HYPOTHESIS_CATALOG.map((h) => {
              const on = linked.includes(h.id);
              return (
                <button
                  key={h.id}
                  type="button"
                  style={on ? primaryBtn : secondaryBtn}
                  onClick={() => {
                    const next = on ? linked.filter((id) => id !== h.id) : [...linked, h.id];
                    void annotate(ev.event_id, { hypothesis_ids: next });
                  }}
                >
                  {h.id}
                </button>
              );
            })}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ ...input, height: 72, padding: 8 }}
            placeholder="заметка исследователя — не факт"
          />
          <div style={{ marginTop: 8 }}>
            <button type="button" style={primaryBtn} onClick={() => void annotate(ev.event_id, { research_note: note })}>
              Сохранить заметку
            </button>
          </div>
        </Card>
      ) : (
        <p style={hint}>Детектор ещё не записал событие.</p>
      )}
    </>
  );
}

function HypothesesPane() {
  const { data, loading, error, setHypothesis, annotate } = useLab();
  const [picked, setPicked] = useState<HypothesisId>('H-CONF');
  if (loading && !data) return <p style={hint}>Реестр…</p>;
  if (error && !data) return <p style={hint}>{error}</p>;
  const rows = HYPOTHESIS_CATALOG.map((h) => data?.hypotheses?.[h.id] ?? { ...h, status: 'watching' as const, updated_at: '' });
  const linkedEvents = (data?.events ?? []).filter((e) => data?.annotations[e.event_id]?.hypothesis_ids?.includes(picked));
  return (
    <>
      <h2 style={title}>Гипотезы</h2>
      <p style={hint}>Статус — не вердикт. Кнопки «подтверждена» нет.</p>
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead>
            <tr>
              {['id', 'утверждение', 'статус', 'n'].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const n = (data?.events ?? []).filter((e) =>
                data?.annotations[e.event_id]?.hypothesis_ids?.includes(row.id),
              ).length;
              return (
                <tr
                  key={row.id}
                  onClick={() => setPicked(row.id)}
                  style={{
                    cursor: 'pointer',
                    background: picked === row.id ? 'var(--color-muted)' : undefined,
                  }}
                >
                  <td style={td}>{row.id}</td>
                  <td style={td}>{row.claim}</td>
                  <td style={td}>{row.status}</td>
                  <td style={td}>{n}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Card label={`Выбрана ${picked}`}>
        <p style={hint}>
          {picked === 'H-CONF' ? 'В среднее только oi_fresh. ' : ''}
          связанных событий: {linkedEvents.map((e) => e.event_id.slice(-10)).join(', ') || 'нет'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {HYP_STATUSES.map((st) => (
            <button key={st} type="button" style={secondaryBtn} onClick={() => void setHypothesis(picked, st)}>
              {st}
            </button>
          ))}
        </div>
        <p style={hint}>Последние события — связать / отвязать:</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[...(data?.events ?? [])].reverse().slice(0, 8).map((e) => {
            const ids = data?.annotations[e.event_id]?.hypothesis_ids ?? [];
            const on = ids.includes(picked);
            return (
              <button
                key={e.event_id}
                type="button"
                style={on ? primaryBtn : secondaryBtn}
                onClick={() => {
                  const next = on ? ids.filter((id) => id !== picked) : [...ids, picked];
                  void annotate(e.event_id, { hypothesis_ids: next });
                }}
              >
                {e.event_id.slice(-10)}
              </button>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function InstrumentPane() {
  const { data, loading, error, setInstrument, tick } = useLab();
  const { bridge } = useContext(LabRuntime);
  const [family, setFamily] = useState('Si');
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data?.protocol.family) setFamily(data.protocol.family);
  }, [data?.protocol.family]);

  useEffect(() => {
    if (!bridge) return;
    return bridge.context.subscribe('fdc3.instrument', (payload) => {
      const ticker = (payload as { id?: { ticker?: string } } | null)?.id?.ticker?.trim();
      if (!ticker) return;
      const current = data?.protocol.contract;
      const fam = data?.protocol.family;
      if (ticker === current || ticker === fam) return;
      setPending(ticker);
    });
  }, [bridge, data?.protocol.contract, data?.protocol.family]);

  const apply = async (ticker: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await setInstrument(ticker);
      bridge?.context.publish('fdc3.instrument', { type: 'fdc3.instrument', id: { ticker } });
      setPending(null);
      setMsg('Журнал закрыт, новый прогрев');
      await tick();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <p style={hint}>Инструмент…</p>;
  if (error && !data) return <p style={hint}>{error}</p>;
  const contract = data?.protocol.contract ?? frontContract(family);
  return (
    <>
      <h2 style={title}>Инструмент</h2>
      <p style={hint}>Слышу fdc3.instrument · timeframe не слушаю. Смена закрывает журнал и сбрасывает прогрев.</p>
      <Card label="Сессия">
        <Row k="Семейство" v={`${data?.protocol.family ?? family} · ${ASSET_NAMES[data?.protocol.family ?? family] ?? ''}`} />
        <Row k="Серия" v={`${contract} · заморожена на журнал`} />
        <Row k="Журнал" v={data?.session.id ?? '—'} />
      </Card>
      <Card label="Сменить">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {DEFAULT_UNIVERSE.map((u) => (
            <button key={u} type="button" style={family === u ? primaryBtn : secondaryBtn} onClick={() => setFamily(u)}>
              {u}
            </button>
          ))}
        </div>
        <p style={hint}>
          Предпросмотр серии {frontContract(family)}. Подтверждение обязательно.
        </p>
        <button
          type="button"
          style={primaryBtn}
          disabled={busy || family === data?.protocol.family}
          onClick={() => void apply(family)}
        >
          Сменить на {family} / {frontContract(family)}
        </button>
      </Card>
      {pending ? (
        <Card label="С доски">
          <p style={hint}>Пришёл {pending}. Применить — закроет текущий журнал.</p>
          <button type="button" style={primaryBtn} disabled={busy} onClick={() => void apply(pending)}>
            Принять {pending}
          </button>
        </Card>
      ) : null}
      {msg ? <p style={hint}>{msg}</p> : null}
    </>
  );
}

function SummaryPane() {
  const { data, loading, error, resetExperiment } = useLab();
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  if (loading && !data) return <p style={hint}>Сводка…</p>;
  if (error && !data) return <p style={hint}>{error}</p>;
  const n = data?.events.length ?? 0;
  const eventsById = new Map((data?.events ?? []).map((event) => [event.event_id, event]));
  const trades = [...(data?.trades ?? [])].sort((a, b) => {
    const aTime = eventsById.get(a.event_id)?.signal_time ?? '';
    const bTime = eventsById.get(b.event_id)?.signal_time ?? '';
    return bTime.localeCompare(aTime);
  });
  return (
    <>
      <h2 style={title}>Сводка</h2>
      <p style={hint}>
        M5 · {n} событий{n < 30 ? ' · меньше 30 — не вывод' : ''}. Вклад фильтра ≠ рабочая система.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead>
            <tr>
              {['вариант', 'события', 'сделок', 'закрыто', 'skip', 'wins', 'net R', 'avg R'].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.summary ?? []).map((row) => (
              <tr key={row.variant}>
                <td style={td}>{row.variant === 'B_PRICE' ? 'Пробой цены' : 'Пробой цены + рост OI'}</td>
                <td style={td}>{row.events}</td>
                <td style={td}>{row.trades}</td>
                <td style={td}>{row.closed}</td>
                <td style={td}>{row.skipped}</td>
                <td style={td}>{row.wins}</td>
                <td style={td}>{row.net_r}</td>
                <td style={td}>{row.avg_r ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={hint}>
        oi_unavailable не усредняется во вкладе фильтра. stale не в среднем H-CONF. PlaceOrder выключен до P4.
      </p>
      <Card label="Чистый запуск">
        <p style={hint}>
          Удаляет текущие события и виртуальные сделки. Исторические бары до нового старта отмечаются обработанными,
          поэтому processing_late из backfill не появится снова.
        </p>
        {confirmReset ? (
          <p style={hint}>Подтвердите: журнал и виртуальные сделки текущего эксперимента будут удалены.</p>
        ) : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={secondaryBtn}
            disabled={resetting}
            onClick={async () => {
              if (!confirmReset) {
                setConfirmReset(true);
                setResetMessage('');
                return;
              }
              setResetting(true);
              setResetMessage('');
              try {
                await resetExperiment();
                setResetMessage('Новая чистая сессия запущена.');
                setConfirmReset(false);
              } catch (resetError) {
                setResetMessage(resetError instanceof Error ? resetError.message : String(resetError));
              } finally {
                setResetting(false);
              }
            }}
          >
            {resetting ? 'Перезапуск…' : confirmReset ? 'Подтвердить чистый запуск' : 'Начать чистый эксперимент'}
          </button>
          {confirmReset && !resetting ? (
            <button type="button" style={secondaryBtn} onClick={() => setConfirmReset(false)}>
              Отмена
            </button>
          ) : null}
        </div>
        {resetMessage ? <p style={hint}>{resetMessage}</p> : null}
      </Card>
      <h3 style={{ ...title, fontSize: 16 }}>Виртуальные заявки и сделки</h3>
      <p style={hint}>
        Это исследовательская симуляция, не брокерские заявки. Доходность указана в R: +1R — прибыль в размере
        первоначального риска между ценой входа и стопом.
      </p>
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 1350 }}>
          <thead>
            <tr>
              {[
                '№',
                'сигнал',
                'вариант',
                'сторона',
                'статус',
                'причина',
                'вход',
                'цена входа',
                'стоп',
                'цель',
                'выход',
                'цена выхода',
                'доходность, R',
              ].map((heading) => (
                <th key={heading} style={th}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, index) => {
              const event = eventsById.get(trade.event_id);
              return (
                <tr key={trade.trade_id}>
                  <td style={td}>{index + 1}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{event ? eventTimestamp(event.signal_time) : '—'}</td>
                  <td style={td}>{trade.variant_id === 'B_PRICE' ? 'Пробой цены' : 'Пробой + рост OI'}</td>
                  <td style={td}>{trade.direction === 'long' ? 'лонг' : 'шорт'}</td>
                  <td style={td}>{trade.status}</td>
                  <td style={td}>{trade.status === 'skipped' ? skipReasonLabel(trade.skip_reason) : trade.exit_reason ?? '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{trade.entry_time ? eventTimestamp(trade.entry_time) : '—'}</td>
                  <td style={td}>{fmt(trade.entry_price)}</td>
                  <td style={td}>{fmt(trade.stop)}</td>
                  <td style={td}>{fmt(trade.target)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{trade.exit_time ? eventTimestamp(trade.exit_time) : '—'}</td>
                  <td style={td}>{fmt(trade.exit_price)}</td>
                  <td style={td}>{trade.net_r == null ? '—' : `${trade.net_r > 0 ? '+' : ''}${trade.net_r}R`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ExperimentsPane() {
  const { data, loading, error, createExperiment, experimentAction, loadProfile, runBacktest } = useLab();
  const { bridge } = useContext(LabRuntime);
  const [name, setName] = useState('Эксперимент пробоя');
  const [family, setFamily] = useState('Si');
  const [entryRule, setEntryRule] = useState<'price_breakout' | 'price_breakout_oi_up'>('price_breakout');
  const [executionMode, setExecutionMode] = useState<'virtual' | 'real'>('virtual');
  const [capital, setCapital] = useState(15_000);
  const [quantityMode, setQuantityMode] = useState<'fixed_lots' | 'max_by_capital'>('fixed_lots');
  const [fixedLots, setFixedLots] = useState(1);
  const [lookback, setLookback] = useState(12);
  const [atrBars, setAtrBars] = useState(20);
  const [stopAtr, setStopAtr] = useState(1);
  const [targetAtr, setTargetAtr] = useState(2);
  const [maxHold, setMaxHold] = useState(12);
  const [oiWindow, setOiWindow] = useState(15);
  const [deadlineSec, setDeadlineSec] = useState(120);
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<InstrumentProfile | null>(null);
  const [profileError, setProfileError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [backtestDays, setBacktestDays] = useState(20);
  const [calibrationPercent, setCalibrationPercent] = useState(70);
  const [backtestCapital, setBacktestCapital] = useState(15_000);
  const [backtestRiskPercent, setBacktestRiskPercent] = useState(1);
  const [backtestFor, setBacktestFor] = useState<string | null>(null);
  const [experimentMessages, setExperimentMessages] = useState<Record<string, string>>({});
  const contract = frontContract(family);
  const selectedExperiment = data?.experiments?.find((experiment) => experiment.id === data.selected_experiment_id);
  const selectedId = selectedExperiment?.id;
  const selectedFamily = selectedExperiment?.protocol.family;
  useEffect(() => {
    if (!bridge || !selectedFamily) return;
    bridge.context.publish('fdc3.instrument', {
      type: 'fdc3.instrument',
      id: { ticker: selectedFamily },
      name: ASSET_NAMES[selectedFamily] ?? selectedFamily,
    });
  }, [bridge, selectedId, selectedFamily]);
  useEffect(() => {
    if (!bridge) return;
    return bridge.context.subscribe('fdc3.instrument', (payload) => {
      const ticker = (payload as { id?: { ticker?: string } } | null)?.id?.ticker;
      const normalized = DEFAULT_UNIVERSE.find((item) => item.toLowerCase() === ticker?.toLowerCase());
      if (normalized) setFamily(normalized);
    });
  }, [bridge]);
  useEffect(() => {
    let cancelled = false;
    setProfileLoading(true);
    setProfileError('');
    const timer = setTimeout(() => {
      void loadProfile(family, contract, 20)
        .then((next) => {
          if (!cancelled) setProfile(next);
        })
        .catch((caught) => {
          if (!cancelled) {
            setProfile(null);
            setProfileError(caught instanceof Error ? caught.message : String(caught));
          }
        })
        .finally(() => {
          if (!cancelled) setProfileLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [family, contract, loadProfile]);
  if (loading && !data) return <p style={hint}>Эксперименты…</p>;
  if (error && !data) return <p style={hint}>{error}</p>;
  const act = async (id: string, action: 'select' | 'start' | 'pause' | 'complete' | 'clone') => {
    setBusy(true);
    setActiveAction(`${id}:${action}`);
    setMessage('');
    setExperimentMessages((current) => ({ ...current, [id]: 'Выполняется…' }));
    try {
      await experimentAction(id, action);
      setExperimentMessages((current) => ({ ...current, [id]: 'Готово.' }));
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : String(caught);
      setMessage(text);
      setExperimentMessages((current) => ({ ...current, [id]: `Ошибка: ${text}` }));
    } finally {
      setBusy(false);
      setActiveAction(null);
    }
  };
  const atrFact = profile?.atr.find((item) => item.period === atrBars);
  const levelFact = profile?.levels.find((item) => item.bars === lookback);
  const stopFact = profile?.stop.find((item) => item.atr === stopAtr);
  const targetFact = profile?.target.find((item) => item.atr === targetAtr);
  const oiFact = profile?.oi.change.find((item) => item.minutes === oiWindow);
  const parameterWarnings = [
    lookback < 6 || lookback > 48 ? 'Период уровней вне исследованного диапазона 6–48 M5-баров.' : null,
    atrBars < 7 || atrBars > 50 ? 'Период ATR вне практического диапазона 7–50 баров.' : null,
    stopAtr < 0.5 || stopAtr > 3 ? 'Стоп вне диапазона 0,5–3 ATR: риск частых выбиваний или чрезмерно большой позиции.' : null,
    targetAtr < 0.5 || targetAtr > 5 ? 'Цель вне диапазона 0,5–5 ATR.' : null,
    maxHold > 36 ? 'Удержание больше трёх часов выходит за исследованный внутридневной горизонт.' : null,
    oiWindow < 5 || oiWindow > 120 ? 'Период OI вне диапазона 5–120 минут для доступной частоты снимков.' : null,
  ].filter((warning): warning is string => Boolean(warning));
  return (
    <>
      <h2 style={title}>Эксперименты</h2>
      <p style={hint}>
        Collector общий, а конфигурация, события и книга сделок у каждого эксперимента свои. Работающие параметры
        неизменяемы — для изменения используйте «Клонировать».
      </p>
      <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
        {(data?.experiments ?? []).map((experiment) => {
          const selected = experiment.id === data?.selected_experiment_id;
          return (
            <Card key={experiment.id} label={experiment.name}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
                <span style={{ padding: '4px 8px', borderRadius: 999, background: 'var(--color-muted)', fontSize: 12 }}>
                  {experiment.status === 'running' ? 'Live запущен' : experiment.status === 'paused' ? 'На паузе' : experiment.status === 'completed' ? 'Завершён' : 'Черновик'}
                </span>
                {selected ? <span style={{ ...hint, margin: 0 }}>● выбран</span> : null}
              </div>
              <Row k="Инструмент" v={`${experiment.protocol.family} / ${experiment.protocol.contract} · M5`} />
              <Row
                k="Условие"
                v={experiment.entry_rule === 'price_breakout' ? 'Пробой цены' : 'Пробой цены + рост OI'}
              />
              <Row k="Live" v={`${experiment.events.length} событий · ${experiment.trades.filter((item) => item.status === 'closed').length} закрытых сделок`} />
              {experiment.backtests.at(0) ? (
                <>
                  <Row
                    k="Последний бэктест · проверка"
                    v={`${experiment.backtests[0].holdout.closed} сделок · ${experiment.backtests[0].holdout.net_r}R · win rate ${experiment.backtests[0].holdout.win_rate == null ? '—' : `${Math.round(experiment.backtests[0].holdout.win_rate * 100)}%`} · max DD ${experiment.backtests[0].holdout.max_drawdown_r}R`}
                  />
                  <Row
                    k="Историческая модель"
                    v={`${experiment.backtests[0].from}—${experiment.backtests[0].to} · ${experiment.backtests[0].latency_model_id}`}
                  />
                </>
              ) : <Row k="Бэктест" v="ещё не запускался" />}
              {experiment.completion_report ? (
                <div style={{ marginTop: 10, padding: 10, borderLeft: '3px solid var(--color-primary)', background: 'var(--color-muted)' }}>
                  <strong style={{ fontSize: 13 }}>Итоговый live-отчёт</strong>
                  <Row k="Результат" v={`${signed(experiment.completion_report.net_r)}R · edge ${fmt(experiment.completion_report.edge_r)}R`} />
                  <Row k="Риск" v={`Sharpe ${fmt(experiment.completion_report.sharpe)} · Sortino ${fmt(experiment.completion_report.sortino)} · max DD ${fmt(experiment.completion_report.max_drawdown_r)}R`} />
                  <Row k="Выборка" v={`${experiment.completion_report.closed} закрыто · ${experiment.completion_report.skipped} пропущено · win rate ${experiment.completion_report.win_rate == null ? '—' : `${Math.round(experiment.completion_report.win_rate * 100)}%`}`} />
                </div>
              ) : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {!selected && experiment.status !== 'completed' ? <button style={secondaryBtn} disabled={busy} aria-busy={activeAction === `${experiment.id}:select`} onClick={() => void act(experiment.id, 'select')}>{activeAction === `${experiment.id}:select` ? 'Выбираем…' : 'Выбрать для live'}</button> : null}
                {experiment.status === 'draft' || experiment.status === 'paused' ? (
                  <button style={primaryBtn} disabled={busy || experiment.execution_mode === 'real'} aria-busy={activeAction === `${experiment.id}:start`} onClick={() => void act(experiment.id, 'start')}>
                    {activeAction === `${experiment.id}:start` ? 'Запускаем…' : 'Запустить live'}
                  </button>
                ) : null}
                {experiment.status === 'running' ? <button style={secondaryBtn} disabled={busy} aria-busy={activeAction === `${experiment.id}:pause`} onClick={() => void act(experiment.id, 'pause')}>{activeAction === `${experiment.id}:pause` ? 'Ставим на паузу…' : 'Пауза'}</button> : null}
                {experiment.status !== 'completed' ? <button style={secondaryBtn} disabled={busy} aria-busy={activeAction === `${experiment.id}:complete`} onClick={() => void act(experiment.id, 'complete')}>{activeAction === `${experiment.id}:complete` ? 'Завершаем…' : 'Завершить'}</button> : null}
                <button style={secondaryBtn} disabled={busy} aria-busy={activeAction === `${experiment.id}:clone`} onClick={() => void act(experiment.id, 'clone')}>{activeAction === `${experiment.id}:clone` ? 'Клонируем…' : 'Клонировать'}</button>
                <button
                  style={secondaryBtn}
                  disabled={busy}
                  aria-expanded={backtestFor === experiment.id}
                  onClick={() => setBacktestFor((current) => current === experiment.id ? null : experiment.id)}
                >
                  {backtestFor === experiment.id ? 'Скрыть параметры бэктеста' : 'Настроить бэктест'}
                </button>
              </div>
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--color-muted-foreground)', minHeight: 44, display: 'flex', alignItems: 'center' }}>Конфигурация и технические детали</summary>
                <Row
                  k="Исполнение"
                  v={
                    experiment.execution_mode === 'virtual'
                      ? 'Виртуальное'
                      : `Реальное · лимит ${fmtInt(experiment.capital_limit_rub)} ₽ · отправка заявок пока выключена`
                  }
                />
                <Row
                  k="Параметры"
                  v={`уровни ${experiment.protocol.lookback_bars} баров · ATR ${experiment.protocol.atr_bars} · стоп ${experiment.protocol.stop_atr} ATR · цель ${experiment.protocol.target_atr} ATR`}
                />
                <Row k="Сессия" v={`${experiment.session.id} · ${eventTimestamp(experiment.session.started_at)}`} />
              </details>
              {backtestFor === experiment.id ? (
                <div style={{ marginTop: 12, padding: 10, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                    <label style={hint}>Исторический период, календарных дней
                      <input
                        style={input}
                        type="number"
                        min={5}
                        max={60}
                        step={1}
                        value={backtestDays}
                        onChange={(event) => setBacktestDays(Math.floor(Number(event.target.value)))}
                      />
                      <ParamHint>Можно указать любое целое число от 5 до 60, например 7 или 14. Сегодня входит в период.</ParamHint>
                      {(!Number.isFinite(backtestDays) || backtestDays < 5 || backtestDays > 60) ? <ParamHint>Введите значение от 5 до 60 дней.</ParamHint> : null}
                    </label>
                    <label style={hint}>Разделение истории
                      <select style={input} value={calibrationPercent} onChange={(event) => setCalibrationPercent(+event.target.value)}>
                        <option value={60}>60% период настройки / 40% проверочный период</option>
                        <option value={70}>70% период настройки / 30% проверочный период</option>
                        <option value={80}>80% период настройки / 20% проверочный период</option>
                      </select>
                      <ParamHint>Первая часть истории нужна для выбора параметров. Последняя часть остаётся отдельно для честной проверки выбранных настроек.</ParamHint>
                    </label>
                    <label style={hint}>Расчётный капитал, ₽
                      <input style={input} type="number" min={1000} step={1000} value={backtestCapital} onChange={(event) => setBacktestCapital(+event.target.value)} />
                      <ParamHint>Только денежная модель бэктеста. Заявки на эту сумму не отправляются.</ParamHint>
                    </label>
                    <label style={hint}>Риск на одну сделку, %
                      <input style={input} type="number" min={0.1} max={20} step={0.1} value={backtestRiskPercent} onChange={(event) => setBacktestRiskPercent(+event.target.value)} />
                      <ParamHint>1R = этот процент от стартового капитала. Расчёт фиксированный, без сложного процента.</ParamHint>
                    </label>
                  </div>
                  <Row k="Конфигурация" v={`${experiment.protocol.contract} · уровни ${experiment.protocol.lookback_bars} · ATR ${experiment.protocol.atr_bars} · стоп ${experiment.protocol.stop_atr} · цель ${experiment.protocol.target_atr} · удержание ${experiment.protocol.max_hold_bars} M5`} />
                  <Row k="Доступность данных" v="source_time_no_delay — исторический replay, не восстановленный live received_at" />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    <button
                      style={primaryBtn}
                      disabled={
                        busy ||
                        !Number.isFinite(backtestDays) ||
                        backtestDays < 5 ||
                        backtestDays > 60 ||
                        !Number.isFinite(backtestCapital) ||
                        backtestCapital < 1000 ||
                        !Number.isFinite(backtestRiskPercent) ||
                        backtestRiskPercent < 0.1 ||
                        backtestRiskPercent > 20
                      }
                      aria-busy={activeAction === `${experiment.id}:backtest`}
                      onClick={async () => {
                        setBusy(true);
                        setActiveAction(`${experiment.id}:backtest`);
                        setMessage('');
                        setExperimentMessages((current) => ({ ...current, [experiment.id]: 'Загружаем историю и считаем бэктест…' }));
                        try {
                          await runBacktest(experiment.id, backtestDays, calibrationPercent, backtestCapital, backtestRiskPercent);
                          setMessage(`Бэктест ${experiment.name} завершён и сохранён отдельно от live.`);
                          setExperimentMessages((current) => ({ ...current, [experiment.id]: 'Бэктест завершён. Результат показан выше и во вкладке «Результаты».' }));
                        } catch (caught) {
                          const text = caught instanceof Error ? caught.message : String(caught);
                          setMessage(text);
                          setExperimentMessages((current) => ({ ...current, [experiment.id]: `Ошибка бэктеста: ${text}` }));
                        } finally {
                          setBusy(false);
                          setActiveAction(null);
                        }
                      }}
                    >
                      {activeAction === `${experiment.id}:backtest` ? 'Считаем бэктест…' : 'Запустить бэктест'}
                    </button>
                    <button style={secondaryBtn} disabled={busy} onClick={() => setBacktestFor(null)}>Отмена</button>
                  </div>
                </div>
              ) : null}
              {experimentMessages[experiment.id] ? <p style={hint} role="status">{experimentMessages[experiment.id]}</p> : null}
            </Card>
          );
        })}
      </div>
      <Card label={`Фактический профиль ${family} / ${contract}`}>
        {profileLoading ? <p style={hint}>Рассчитываем профиль по истории Algopack…</p> : null}
        {profileError ? <p style={hint}>Профиль недоступен: {profileError}</p> : null}
        {profile ? (
          <>
            <p style={hint}>
              {profile.from}—{profile.to} · {profile.bars} закрытых M5-баров · {profile.trading_days} торговых дней.
              Подсказки описывают историю, а не гарантируют будущий результат.
            </p>
            <Row
              k="ATR"
              v={profile.atr.map((item) => `${item.period}: ${item.points} п. (${item.percent}%)`).join(' · ')}
            />
            <Row
              k="Уровни"
              v={profile.levels.map((item) => `${item.bars} баров: диапазон ${item.median_width} п., ${item.breakouts_per_day} пробоя/день`).join(' · ')}
            />
            <Row
              k="Стоп не задет"
              v={profile.stop.map((item) => `${item.atr} ATR: ${item.survival_rate == null ? '—' : `${Math.round(item.survival_rate * 100)}%`}`).join(' · ')}
            />
            <Row
              k="Цель достигалась"
              v={profile.target.map((item) => `${item.atr} ATR: ${item.reach_rate == null ? '—' : `${Math.round(item.reach_rate * 100)}%`}`).join(' · ')}
            />
            <Row
              k="OI"
              v={`${profile.oi.snapshots} снимков · медианный интервал ${profile.oi.median_interval_min == null ? '—' : `${fmt(profile.oi.median_interval_min)} мин`}`}
            />
            {profile.warnings.map((warning) => <p key={warning} style={{ ...hint, color: 'var(--warn)' }}>{warning}</p>)}
          </>
        ) : null}
      </Card>
      <Card label="Новый эксперимент">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          <label style={hint}>Название<input style={input} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label style={hint}>Инструмент
            <select style={input} value={family} onChange={(event) => setFamily(event.target.value)}>
              {DEFAULT_UNIVERSE.map((item) => <option key={item} value={item}>{item} · {ASSET_NAMES[item]}</option>)}
            </select>
          </label>
          <label style={hint}>Условие
            <select style={input} value={entryRule} onChange={(event) => setEntryRule(event.target.value as typeof entryRule)}>
              <option value="price_breakout">Пробой цены</option>
              <option value="price_breakout_oi_up">Пробой цены + рост OI</option>
            </select>
          </label>
          <label style={hint}>Исполнение
            <select style={input} value={executionMode} onChange={(event) => setExecutionMode(event.target.value as typeof executionMode)}>
              <option value="virtual">Виртуальное</option>
              <option value="real">Реальное (Trade API ещё не подключён)</option>
            </select>
          </label>
          {executionMode === 'real' ? <label style={hint}>Лимит капитала, ₽<input style={input} type="number" min={1} value={capital} onChange={(event) => setCapital(+event.target.value)} /></label> : null}
          <label style={hint}>Расчёт количества
            <select style={input} value={quantityMode} onChange={(event) => setQuantityMode(event.target.value as typeof quantityMode)}>
              <option value="fixed_lots">Фиксированные лоты</option>
              <option value="max_by_capital">Максимум по лимиту</option>
            </select>
          </label>
          {quantityMode === 'fixed_lots' ? <label style={hint}>Лотов<input style={input} type="number" min={1} value={fixedLots} onChange={(event) => setFixedLots(+event.target.value)} /></label> : null}
          <label style={hint}>Период формирования поддержки/сопротивления, баров
            <input style={input} type="number" min={2} value={lookback} onChange={(event) => setLookback(+event.target.value)} />
            <ParamHint>{levelFact ? `На истории: медианный диапазон ${levelFact.median_width} п., ${levelFact.breakouts_per_day} пробоя/день.` : 'Ориентиры профиля: 6, 12 и 24 M5-бара.'}</ParamHint>
          </label>
          <label style={hint}>Период ATR, баров
            <input style={input} type="number" min={2} value={atrBars} onChange={(event) => setAtrBars(+event.target.value)} />
            <ParamHint>{atrFact ? `Wilder ATR = ${atrFact.points} п. (${atrFact.percent}% цены).` : 'Профиль сравнивает Wilder ATR 14, 20 и 28.'}</ParamHint>
          </label>
          <label style={hint}>Стоп, ATR
            <input style={input} type="number" min={0.1} step={0.1} value={stopAtr} onChange={(event) => setStopAtr(+event.target.value)} />
            <ParamHint>{stopFact ? `${stopFact.points} п.; исторически не задет в ${stopFact.survival_rate == null ? '—' : `${Math.round(stopFact.survival_rate * 100)}%`} эпизодов.` : `≈ ${fmt((profile?.atr.find((item) => item.period === 20)?.points ?? 0) * stopAtr)} п.; профиль предлагает 1 / 1,5 / 2 ATR.`}</ParamHint>
          </label>
          <label style={hint}>Цель, ATR
            <input style={input} type="number" min={0.1} step={0.1} value={targetAtr} onChange={(event) => setTargetAtr(+event.target.value)} />
            <ParamHint>{targetFact ? `${targetFact.points} п.; достигалась в ${targetFact.reach_rate == null ? '—' : `${Math.round(targetFact.reach_rate * 100)}%`} эпизодов.` : 'Профиль предлагает 1 / 2 / 3 ATR.'}</ParamHint>
          </label>
          <label style={hint}>Максимальное удержание, M5-баров
            <input style={input} type="number" min={1} value={maxHold} onChange={(event) => setMaxHold(+event.target.value)} />
            <ParamHint>{profile?.holding.median_bars == null ? 'Один бар = 5 минут.' : `Факт: медиана ${fmt(profile.holding.median_bars)} баров, p75 ${fmt(profile.holding.p75_bars)}.`}</ParamHint>
          </label>
          <label style={hint}>Период измерения изменения OI, минут
            <input style={input} type="number" min={5} value={oiWindow} onChange={(event) => setOiWindow(+event.target.value)} />
            <ParamHint>{oiFact ? `Δln OI: p25 ${fmtLn(oiFact.p25)}, медиана ${fmtLn(oiFact.median)}, p75 ${fmtLn(oiFact.p75)}.` : 'Исторические ориентиры: 5 / 15 / 30 / 60 минут.'}</ParamHint>
          </label>
          <label style={hint}>Ожидание данных после закрытия бара, секунд
            <input style={input} type="number" min={30} value={deadlineSec} onChange={(event) => setDeadlineSec(+event.target.value)} />
            <ParamHint>Это live-параметр. История не содержит настоящего received_at; ориентир появится по накопленным live-задержкам.</ParamHint>
          </label>
        </div>
        {parameterWarnings.map((warning) => <p key={warning} style={{ ...hint, color: 'var(--warn)' }}>⚠ {warning}</p>)}
        <p style={hint}>Будет создан draft: {family} / {contract}. Реальный draft нельзя запустить до подключения Trade API и подтверждения пользователя.</p>
        <button
          type="button"
          style={primaryBtn}
          disabled={busy || !name.trim()}
          aria-busy={activeAction === 'create'}
          onClick={async () => {
            setBusy(true);
            setActiveAction('create');
            setMessage('');
            try {
              await createExperiment({
                name,
                family,
                contract,
                entry_rule: entryRule,
                execution_mode: executionMode,
                capital_limit_rub: executionMode === 'real' ? capital : null,
                quantity_mode: quantityMode,
                fixed_lots: fixedLots,
                parameters: {
                  lookback_bars: lookback,
                  atr_bars: atrBars,
                  stop_atr: stopAtr,
                  target_atr: targetAtr,
                  max_hold_bars: maxHold,
                  oi_window_min: oiWindow,
                  decision_deadline_ms: deadlineSec * 1000,
                },
              });
              setMessage('Draft создан.');
            } catch (caught) {
              setMessage(caught instanceof Error ? caught.message : String(caught));
            } finally {
              setBusy(false);
              setActiveAction(null);
            }
          }}
        >
          {activeAction === 'create' ? 'Создаём draft…' : 'Создать draft'}
        </button>
        {message ? <p style={hint}>{message}</p> : null}
      </Card>
      <MethodPane />
    </>
  );
}

function liveEquity(experiment: LabExperiment): Array<{ time: string; net_r: number }> {
  let net = 0;
  return experiment.trades
    .filter((trade) => trade.status === 'closed' && trade.net_r != null && trade.exit_time)
    .sort((a, b) => (a.exit_time ?? '').localeCompare(b.exit_time ?? ''))
    .map((trade) => {
      net += trade.net_r ?? 0;
      return { time: trade.exit_time!, net_r: net };
    });
}

function ExperimentComparison({ experiments }: { experiments: LabExperiment[] }) {
  const colors = ['var(--color-primary)', 'var(--color-destructive)', 'var(--warn)', 'var(--color-foreground)'];
  const series = experiments.flatMap((experiment, index) => {
    const historical = experiment.backtests.at(0)?.equity ?? [];
    const live = liveEquity(experiment);
    return [
      { id: `${experiment.id}:backtest`, label: `${experiment.name} · бэктест`, values: historical, color: colors[index % colors.length], dashed: false },
      { id: `${experiment.id}:live`, label: `${experiment.name} · live`, values: live, color: colors[index % colors.length], dashed: true },
    ].filter((item) => item.values.length);
  });
  if (!series.length) return <p style={hint}>Запустите бэктест или дождитесь закрытых live-сделок — тогда появится сравнение equity в R.</p>;
  const values = series.flatMap((item) => item.values.map((point) => point.net_r));
  const times = series.flatMap((item) => item.values.map((point) => Date.parse(point.time))).filter(Number.isFinite);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = Math.max(1, max - min);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeSpan = Math.max(1, maxTime - minTime);
  const width = 760;
  const height = 260;
  const left = 58;
  const right = 18;
  const top = 16;
  const bottom = 50;
  const xTicks = Array.from({ length: 5 }, (_, index) => minTime + (timeSpan * index) / 4);
  const yTicks = [min, min + span / 2, max];
  const signatures = experiments.map((experiment) =>
    JSON.stringify({
      entry_rule: experiment.entry_rule,
      protocol: experiment.protocol,
      execution_mode: experiment.execution_mode,
    }),
  );
  const identicalConfigurations = new Set(signatures).size < signatures.length;
  return (
    <Card label="Сравнение equity, R">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Сравнение накопленной доходности экспериментов" style={{ width: '100%', minHeight: 180 }}>
        <line x1={left} y1={top} x2={left} y2={height - bottom} stroke="var(--color-border)" />
        <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} stroke="var(--color-border)" />
        {yTicks.map((tick) => {
          const y = height - bottom - ((tick - min) / span) * (height - top - bottom);
          return (
            <g key={`y:${tick}`}>
              <line x1={left} y1={y} x2={width - right} y2={y} stroke="var(--color-border)" opacity={0.45} />
              <text x={left - 7} y={y + 4} textAnchor="end" fontSize={10} fill="var(--color-muted-foreground)">{tick.toFixed(1)}R</text>
            </g>
          );
        })}
        {xTicks.map((tick) => {
          const x = left + ((tick - minTime) / timeSpan) * (width - left - right);
          const label = new Date(tick).toISOString().slice(5, 16).replace('T', ' ');
          return (
            <g key={`x:${tick}`}>
              <line x1={x} y1={top} x2={x} y2={height - bottom} stroke="var(--color-border)" opacity={0.25} />
              <text x={x} y={height - bottom + 16} textAnchor="middle" fontSize={9} fill="var(--color-muted-foreground)">{label}</text>
            </g>
          );
        })}
        <text x={14} y={(top + height - bottom) / 2} textAnchor="middle" fontSize={10} fill="var(--color-muted-foreground)" transform={`rotate(-90 14 ${(top + height - bottom) / 2})`}>Накопленный результат, R</text>
        <text x={(left + width - right) / 2} y={height - 8} textAnchor="middle" fontSize={10} fill="var(--color-muted-foreground)">Дата и время источника, UTC</text>
        {series.map((item) => {
          const points = item.values.map((point) => {
            const x = left + ((Date.parse(point.time) - minTime) / timeSpan) * (width - left - right);
            const y = height - bottom - ((point.net_r - min) / span) * (height - top - bottom);
            return `${x},${y}`;
          }).join(' ');
          return <polyline key={item.id} points={points} fill="none" stroke={item.color} strokeWidth={2} strokeDasharray={item.dashed ? '6 5' : undefined} />;
        })}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {series.map((item) => <span key={item.id} style={{ ...hint, color: item.color }}>{item.dashed ? '┄' : '━'} {item.label}</span>)}
      </div>
      <p style={hint}>X — фактические дата и время закрытия сделки. Y — накопленный результат в R. Сплошная линия — historical replay; пунктир — отдельный live-журнал.</p>
      {identicalConfigurations ? (
        <p style={{ ...hint, color: 'var(--warn)' }}>
          У части выбранных экспериментов совпадают инструмент, условие и параметры. Движок детерминированный, поэтому на одном периоде их кривые накладываются точно друг на друга. Клонируйте эксперимент и измените параметры, чтобы сравнение имело смысл.
        </p>
      ) : null}
    </Card>
  );
}

type MonitorSignal = {
  key: string;
  experiment: LabExperiment;
  event: LabEvent;
  trade: LabTrade | undefined;
  kind: 'price' | 'confirmed' | 'filtered' | 'skipped';
};

function signalColor(signal: MonitorSignal): string {
  if (signal.kind === 'confirmed') return 'hsl(142 65% 38%)';
  if (signal.kind === 'filtered') return 'var(--warn)';
  if (signal.kind === 'skipped') return 'var(--color-muted-foreground)';
  return signal.event.direction === 'long' ? 'var(--color-primary)' : 'var(--warn)';
}

function signalLabel(signal: MonitorSignal): string {
  if (signal.kind === 'confirmed') return 'Пробой подтверждён OI';
  if (signal.kind === 'filtered') return 'OI не подтвердил вход';
  if (signal.kind === 'skipped') return `Вход пропущен: ${signal.trade?.skip_reason ?? 'неизвестная причина'}`;
  return 'Ценовой пробой';
}

function BreakoutTimeline({
  bars,
  experiments,
  market,
}: {
  bars: OhlcBar[];
  experiments: LabExperiment[];
  market: LabMarket | null;
}) {
  const visibleBars = bars.slice(-60);
  const barIndex = new Map(visibleBars.map((bar, index) => [bar.end, index]));
  const allSignals: MonitorSignal[] = experiments.flatMap((experiment) =>
    experiment.events
      .filter((event) => event.contract === market?.contract && barIndex.has(event.bar_end))
      .map((event) => {
        const variant = experiment.entry_rule === 'price_breakout_oi_up' ? 'B_OI_POSITIVE' : 'B_PRICE';
        const trade = experiment.trades.find((item) => item.event_id === event.event_id && item.variant_id === variant);
        const kind: MonitorSignal['kind'] =
          trade?.status === 'skipped' && trade.skip_reason === 'filter'
            ? 'filtered'
            : trade?.status === 'skipped'
              ? 'skipped'
              : experiment.entry_rule === 'price_breakout_oi_up' && event.filter_passed
                ? 'confirmed'
                : 'price';
        return { key: `${experiment.id}:${event.event_id}`, experiment, event, trade, kind };
      }),
  );
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'problems'>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const shownSignals = allSignals.filter((signal) =>
    filter === 'confirmed'
      ? signal.kind === 'confirmed'
      : filter === 'problems'
        ? signal.kind === 'filtered' || signal.kind === 'skipped'
        : true,
  );
  const selected = shownSignals.find((signal) => signal.key === selectedKey) ?? shownSignals.at(-1) ?? null;
  if (!visibleBars.length) {
    return <Card label="M5 и события пробоя"><p style={hint}>Свечи ещё загружаются.</p></Card>;
  }
  const width = 900;
  const height = 290;
  const left = 62;
  const right = 20;
  const top = 18;
  const bottom = 42;
  const priceValues = visibleBars.flatMap((bar) => [bar.low, bar.high]);
  if (market?.resistance != null) priceValues.push(market.resistance);
  if (market?.support != null) priceValues.push(market.support);
  const rawMin = Math.min(...priceValues);
  const rawMax = Math.max(...priceValues);
  const pricePad = Math.max(1, (rawMax - rawMin) * 0.08);
  const minPrice = rawMin - pricePad;
  const maxPrice = rawMax + pricePad;
  const priceSpan = Math.max(1, maxPrice - minPrice);
  const x = (index: number) => left + (index / Math.max(1, visibleBars.length - 1)) * (width - left - right);
  const y = (price: number) => top + ((maxPrice - price) / priceSpan) * (height - top - bottom);
  const yTicks = Array.from({ length: 4 }, (_, index) => minPrice + (priceSpan * index) / 3);
  const xTickIndexes = [...new Set([0, Math.floor((visibleBars.length - 1) / 4), Math.floor((visibleBars.length - 1) / 2), Math.floor(((visibleBars.length - 1) * 3) / 4), visibleBars.length - 1])];
  return (
    <>
      <Card label="M5 и события пробоя">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button type="button" style={filter === 'all' ? primaryBtn : secondaryBtn} onClick={() => setFilter('all')}>Все события</button>
          <button type="button" style={filter === 'confirmed' ? primaryBtn : secondaryBtn} onClick={() => setFilter('confirmed')}>Подтверждены OI</button>
          <button type="button" style={filter === 'problems' ? primaryBtn : secondaryBtn} onClick={() => setFilter('problems')}>Фильтры и пропуски</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 720 }} role="img" aria-label="M5 свечи и события пробоя">
            {yTicks.map((tick) => (
              <g key={tick}>
                <line x1={left} y1={y(tick)} x2={width - right} y2={y(tick)} stroke="var(--color-border)" opacity={0.5} />
                <text x={left - 7} y={y(tick) + 4} textAnchor="end" fontSize={10} fill="var(--color-muted-foreground)">{fmtInt(tick)}</text>
              </g>
            ))}
            {market?.resistance != null ? (
              <g>
                <line x1={left} y1={y(market.resistance)} x2={width - right} y2={y(market.resistance)} stroke="var(--color-primary)" strokeDasharray="6 5" />
                <text x={width - right - 3} y={y(market.resistance) - 5} textAnchor="end" fontSize={9} fill="var(--color-primary)">текущее сопротивление {fmtInt(market.resistance)}</text>
              </g>
            ) : null}
            {market?.support != null ? (
              <g>
                <line x1={left} y1={y(market.support)} x2={width - right} y2={y(market.support)} stroke="var(--warn)" strokeDasharray="6 5" />
                <text x={width - right - 3} y={y(market.support) - 5} textAnchor="end" fontSize={9} fill="var(--warn)">текущая поддержка {fmtInt(market.support)}</text>
              </g>
            ) : null}
            {visibleBars.map((bar, index) => {
              const cx = x(index);
              const up = bar.close >= bar.open;
              const color = up ? 'hsl(142 55% 38%)' : 'var(--color-destructive)';
              return (
                <g key={bar.end}>
                  <line x1={cx} y1={y(bar.high)} x2={cx} y2={y(bar.low)} stroke={color} strokeWidth={1} />
                  <rect
                    x={cx - 3}
                    y={Math.min(y(bar.open), y(bar.close))}
                    width={6}
                    height={Math.max(1.5, Math.abs(y(bar.open) - y(bar.close)))}
                    fill={up ? 'var(--color-card)' : color}
                    stroke={color}
                  />
                </g>
              );
            })}
            {shownSignals.map((signal) => {
              const index = barIndex.get(signal.event.bar_end);
              if (index == null) return null;
              const bar = visibleBars[index];
              const cx = x(index);
              const cy = signal.event.direction === 'long' ? y(bar.high) - 13 : y(bar.low) + 13;
              const color = signalColor(signal);
              const points = signal.event.direction === 'long'
                ? `${cx},${cy - 7} ${cx - 7},${cy + 5} ${cx + 7},${cy + 5}`
                : `${cx},${cy + 7} ${cx - 7},${cy - 5} ${cx + 7},${cy - 5}`;
              return (
                <g key={signal.key} onClick={() => setSelectedKey(signal.key)} style={{ cursor: 'pointer' }}>
                  <circle cx={cx} cy={cy} r={selected?.key === signal.key ? 12 : 9} fill="var(--color-card)" stroke={color} strokeWidth={selected?.key === signal.key ? 3 : 1.5} />
                  <polygon points={points} fill={signal.kind === 'filtered' || signal.kind === 'skipped' ? 'var(--color-card)' : color} stroke={color} strokeWidth={1.5} />
                  {signal.kind === 'confirmed' ? <circle cx={cx} cy={cy} r={7.5} fill="none" stroke={color} strokeWidth={1.5} /> : null}
                  {signal.kind === 'skipped' ? <path d={`M ${cx - 5} ${cy - 5} L ${cx + 5} ${cy + 5} M ${cx + 5} ${cy - 5} L ${cx - 5} ${cy + 5}`} stroke={color} strokeWidth={1.5} /> : null}
                </g>
              );
            })}
            {xTickIndexes.map((index) => (
              <text key={index} x={x(index)} y={height - 16} textAnchor="middle" fontSize={9} fill="var(--color-muted-foreground)">
                {new Date(visibleBars[index].begin).toISOString().slice(5, 16).replace('T', ' ')}
              </text>
            ))}
            <text x={(left + width - right) / 2} y={height - 2} textAnchor="middle" fontSize={10} fill="var(--color-muted-foreground)">Дата и время M5-бара, UTC</text>
            <text x={14} y={height / 2} textAnchor="middle" fontSize={10} fill="var(--color-muted-foreground)" transform={`rotate(-90 14 ${height / 2})`}>Цена, пункты</text>
          </svg>
        </div>
        <p style={hint}>Цвет и форма обозначают исходный сигнал, а не будущую прибыль. Нажмите маркер или точку на дорожке для деталей.</p>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 12 }}>
        <Card label="Дорожки экспериментов">
          {experiments.map((experiment) => {
            const laneSignals = shownSignals.filter((signal) => signal.experiment.id === experiment.id);
            return (
              <div key={experiment.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 190px) 1fr', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12 }}>{experiment.name}</span>
                <div style={{ position: 'relative', height: 26, borderRadius: 4, background: 'var(--color-muted)' }}>
                  {laneSignals.map((signal) => {
                    const index = barIndex.get(signal.event.bar_end);
                    if (index == null) return null;
                    return (
                      <button
                        key={signal.key}
                        type="button"
                        title={`${eventTimestamp(signal.event.signal_time)} · ${signalLabel(signal)}`}
                        onClick={() => setSelectedKey(signal.key)}
                        style={{
                          position: 'absolute',
                          left: `${(index / Math.max(1, visibleBars.length - 1)) * 100}%`,
                          top: 4,
                          width: 18,
                          height: 18,
                          padding: 0,
                          transform: 'translateX(-50%)',
                          borderRadius: 99,
                          border: `2px solid ${signalColor(signal)}`,
                          background: signal.kind === 'filtered' || signal.kind === 'skipped' ? 'var(--color-card)' : signalColor(signal),
                          cursor: 'pointer',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p style={hint}>Заполненная точка — вход состоялся; контур — условие не выполнено или вход пропущен.</p>
        </Card>
        <Card label={selected ? `Событие ${selected.event.event_id}` : 'Событие'}>
          {selected ? (
            <>
              <Row k="Время" v={eventTimestamp(selected.event.signal_time)} />
              <Row k="Направление" v={selected.event.direction === 'long' ? 'Пробой вверх' : 'Пробой вниз'} />
              <Row k="Цена / уровень" v={`${fmt(selected.event.close)} / ${fmt(selected.event.level)}`} />
              <Row k="OI" v={selected.event.oi_change_ln == null ? 'нет значения' : fmtLn(selected.event.oi_change_ln)} />
              <Row k="Эксперимент" v={selected.experiment.name} />
              <Row k="Решение" v={signalLabel(selected)} />
              <Row k="Результат" v={selected.trade?.net_r == null ? 'ещё нет' : `${signed(selected.trade.net_r)}R`} />
            </>
          ) : <p style={hint}>В видимом диапазоне событий нет.</p>}
        </Card>
      </div>
      <Card label="Легенда">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12 }}>
          <span style={{ color: 'var(--color-primary)' }}>▲ пробой вверх</span>
          <span style={{ color: 'var(--warn)' }}>▼ пробой вниз / OI не подтвердил</span>
          <span style={{ color: 'hsl(142 65% 38%)' }}>◎ подтверждён ростом OI</span>
          <span style={{ color: 'var(--color-muted-foreground)' }}>× вход пропущен</span>
        </div>
      </Card>
    </>
  );
}

function MonitorPane() {
  const { data, experimentAction } = useLab();
  const [compared, setCompared] = useState<string[]>([]);
  const now = useNow();
  const liveAge = ageFrom(now, data?.last_futoi_asof ?? data?.market?.last_futoi_asof);
  const liveLife = ageFrom(now, data?.last_futoi_ok_at);
  const experiments = data?.experiments ?? [];
  const selected = experiments.find((item) => item.id === data?.selected_experiment_id);
  useEffect(() => {
    if (!experiments.length) return;
    setCompared((current) => {
      const valid = current.filter((id) => experiments.some((item) => item.id === id));
      if (selected && !valid.includes(selected.id)) valid.unshift(selected.id);
      return valid.slice(0, 4);
    });
  }, [experiments, selected]);
  const comparedExperiments = compared
    .map((id) => experiments.find((item) => item.id === id))
    .filter((item): item is LabExperiment => Boolean(item));
  return (
    <>
      <h2 style={title}>Монитор</h2>
      <Card label="Эксперименты в мониторе">
        <label style={hint}>Основной эксперимент
          <select
            style={input}
            value={data?.selected_experiment_id ?? ''}
            onChange={(event) => void experimentAction(event.target.value, 'select')}
          >
            {experiments.map((experiment) => <option key={experiment.id} value={experiment.id}>{experiment.name}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
          {experiments.map((experiment) => {
            const checked = compared.includes(experiment.id);
            return (
              <label key={experiment.id} style={hint}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && compared.length >= 4}
                  onChange={() => setCompared((current) => checked ? current.filter((id) => id !== experiment.id) : [...current, experiment.id])}
                />{' '}
                {experiment.name}
              </label>
            );
          })}
        </div>
      </Card>
      <ExperimentComparison experiments={comparedExperiments} />
      <BreakoutTimeline
        bars={data?.recent_bars ?? []}
        experiments={comparedExperiments}
        market={data?.market ?? null}
      />
      <QuoteStrip market={data?.market ?? null} liveAge={liveAge} liveLife={liveLife} />
      <ReadinessPane />
      <LabBPane />
    </>
  );
}

function BacktestResultsPane() {
  const { data, experimentAction } = useLab();
  const experiment = data?.experiments.find((item) => item.id === data.selected_experiment_id);
  const run = experiment?.backtests.at(0);
  const selector = (
    <Card label="Эксперимент в результатах">
      <label style={hint}>Выберите эксперимент
        <select
          style={input}
          value={data?.selected_experiment_id ?? ''}
          onChange={(event) => void experimentAction(event.target.value, 'select')}
        >
          {(data?.experiments ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.status === 'completed' ? 'завершён' : item.status}
            </option>
          ))}
        </select>
      </label>
    </Card>
  );
  if (!run) {
    return (
      <>
        <h2 style={title}>Исторический прогон</h2>
        {selector}
        {experiment?.completion_report ? <CompletionReportCard experiment={experiment} /> : null}
        <p style={hint}>Для выбранного эксперимента бэктест ещё не запускался.</p>
      </>
    );
  }
  return (
    <>
      <h2 style={title}>Исторический прогон</h2>
      {selector}
      {experiment?.completion_report ? <CompletionReportCard experiment={experiment} /> : null}
      <p style={hint}>
        {experiment?.name} · {run.from}—{run.to} · период настройки {run.calibration_percent ?? 70}% / проверочный период {100 - (run.calibration_percent ?? 70)}% · проверка с {eventTimestamp(run.split_at)} · модель доступности {run.latency_model_id}.
        Это replay, не восстановленный live.
      </p>
      <Card label="Итог всего исторического периода">
        <Row k="Edge" v={`${fmt(run.full.edge_r)}R на закрытую сделку`} />
        <Row k="Sharpe / Sortino" v={`${fmt(run.full.sharpe)} / ${fmt(run.full.sortino)}`} />
        <Row k="Доходность" v={run.full.return_pct == null ? '—' : `${signed(run.full.return_pct)}%`} />
        <Row k="Заработали" v={run.full.profit_rub == null ? '—' : `${signed(run.full.profit_rub)} ₽`} />
        <Row k="Денежная модель" v={`${fmtInt(run.starting_capital_rub)} ₽ · риск ${fmt(run.risk_per_trade_percent)}% капитала на 1R · без сложного процента`} />
      </Card>
      <Card label="Период настройки">
        <Row k="Сделки / события" v={`${run.calibration.closed} / ${run.calibration.events}`} />
        <Row k="Net / avg R" v={`${run.calibration.net_r} / ${fmt(run.calibration.avg_r)}`} />
        <Row k="Win rate" v={run.calibration.win_rate == null ? '—' : `${Math.round(run.calibration.win_rate * 100)}%`} />
        <Row k="Max drawdown" v={`${run.calibration.max_drawdown_r}R`} />
        <Row k="Edge / Sharpe / Sortino" v={`${fmt(run.calibration.edge_r)}R / ${fmt(run.calibration.sharpe)} / ${fmt(run.calibration.sortino)}`} />
        <Row k="Доходность / заработали" v={run.calibration.return_pct == null ? '—' : `${signed(run.calibration.return_pct)}% / ${signed(run.calibration.profit_rub)} ₽`} />
      </Card>
      <Card label="Проверочный период">
        <Row k="Сделки / события" v={`${run.holdout.closed} / ${run.holdout.events}`} />
        <Row k="Net / avg R" v={`${run.holdout.net_r} / ${fmt(run.holdout.avg_r)}`} />
        <Row k="Win rate" v={run.holdout.win_rate == null ? '—' : `${Math.round(run.holdout.win_rate * 100)}%`} />
        <Row k="Max drawdown" v={`${run.holdout.max_drawdown_r}R`} />
        <Row k="Edge / Sharpe / Sortino" v={`${fmt(run.holdout.edge_r)}R / ${fmt(run.holdout.sharpe)} / ${fmt(run.holdout.sortino)}`} />
        <Row k="Доходность / заработали" v={run.holdout.return_pct == null ? '—' : `${signed(run.holdout.return_pct)}% / ${signed(run.holdout.profit_rub)} ₽`} />
      </Card>
      <p style={hint}>Edge — средний результат закрытой сделки в R. Sharpe и Sortino рассчитаны по результатам отдельных сделок, масштабированы на √N и не являются годовой доходностью.</p>
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <thead><tr>{['source time', 'сторона', 'статус', 'причина', 'вход', 'выход', 'R'].map((heading) => <th key={heading} style={th}>{heading}</th>)}</tr></thead>
          <tbody>
            {[...run.trades].reverse().slice(0, 100).map((trade, index) => (
              <tr key={`${trade.signal_time}:${index}`}>
                <td style={td}>{eventTimestamp(trade.signal_time)}</td>
                <td style={td}>{trade.direction === 'long' ? 'лонг' : 'шорт'}</td>
                <td style={td}>{trade.status}</td>
                <td style={td}>{trade.skip_reason ?? '—'}</td>
                <td style={td}>{fmt(trade.entry_price)}</td>
                <td style={td}>{fmt(trade.exit_price)}</td>
                <td style={td}>{trade.net_r == null ? '—' : signed(trade.net_r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CompletionReportCard({ experiment }: { experiment: LabExperiment }) {
  const report = experiment.completion_report;
  if (!report) return null;
  const skipped = Object.entries(report.skip_reasons)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${reason}: ${count}`)
    .join(' · ');
  return (
    <Card label="Итоговый отчёт live-эксперимента">
      <Row k="Период" v={`${report.started_at ? eventTimestamp(report.started_at) : 'не запускался'} — ${eventTimestamp(report.completed_at)}`} />
      <Row k="Выборка" v={`${report.events} событий · ${report.closed} закрытых сделок · ${report.skipped} пропусков`} />
      <Row k="Результат" v={`${signed(report.net_r)}R · edge ${fmt(report.edge_r)}R · win rate ${report.win_rate == null ? '—' : `${Math.round(report.win_rate * 100)}%`}`} />
      <Row k="Риск" v={`Sharpe ${fmt(report.sharpe)} · Sortino ${fmt(report.sortino)} · max DD ${fmt(report.max_drawdown_r)}R`} />
      <Row k="Пропуски" v={skipped || 'нет'} />
      <Row k="Рубли" v="не рассчитываются: live работает виртуально, стоимость пункта и фактическое исполнение отсутствуют" />
    </Card>
  );
}

function ResultsPane() {
  return (
    <>
      <BacktestResultsPane />
      <ObservationsPane />
      <SummaryPane />
      <HypothesesPane />
    </>
  );
}

function CombinedLab() {
  return (
    <>
      <MethodPane />
      <InstrumentPane />
      <ProtocolPane />
      <ReadinessPane />
      <LabBPane />
      <HypothesesPane />
      <ObservationsPane />
      <SummaryPane />
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 13, marginBottom: 4 }}>
      <span style={{ width: 120, color: 'var(--color-muted-foreground)', flexShrink: 0 }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function ParamHint({ children }: { children: ReactNode }) {
  return (
    <small style={{ display: 'block', marginTop: 4, lineHeight: 1.35, color: 'var(--color-muted-foreground)' }}>
      {children}
    </small>
  );
}

function LampRow({ name, lamp, detail }: { name: string; lamp: Lamp; detail: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 6, fontSize: 13 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 99,
          background: LAMP_COLOR[lamp],
          flexShrink: 0,
        }}
      />
      <strong style={{ width: 90 }}>{name}</strong>
      <span style={{ color: LAMP_COLOR[lamp], width: 70 }}>{LAMP_RU[lamp]}</span>
      <span style={hint}>{detail}</span>
    </div>
  );
}

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtLn(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(4);
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);
}

function signed(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  const text = fmt(n);
  return n > 0 ? `+${text}` : text;
}

function putLine(e: { put_vol_b?: number | null; put_vol_s?: number | null }): string {
  if (e.put_vol_b == null && e.put_vol_s == null) return '—';
  return `${fmtInt(e.put_vol_b)} / ${fmtInt(e.put_vol_s)}`;
}

function QuoteStrip({
  market,
  liveAge,
  liveLife,
}: {
  market: LabMarket | null;
  liveAge: number | null;
  liveLife: number | null;
}) {
  if (!market) {
    return (
      <Card label="M5 сейчас">
        <p style={hint}>Нет Super Candles. Age {formatMmSs(liveAge)} · life {formatMmSs(liveLife)}</p>
      </Card>
    );
  }
  const put =
    market.put_vol_b == null && market.put_vol_s == null
      ? 'нет пакета orderstats'
      : `${fmtInt(market.put_vol_b)} bid / ${fmtInt(market.put_vol_s)} ask`;
  return (
    <Card label={`M5 сейчас · ${market.contract}${market.complete ? '' : ' · бар ещё открыт'}`}>
      <Row k="Цена" v={`${fmt(market.close)} · Δ бара ${signed(market.move)} · к пред. ${signed(market.move_prev)}`} />
      <Row k="Диапазон бара" v={`${fmt(market.low)} … ${fmt(market.high)}`} />
      <Row
        k="Сопротивление"
        v={
          market.range_u == null
            ? 'мало баров'
            : `${fmt(market.range_u)} · уровень пробоя ${fmt(market.resistance)} · стакан ask ${fmt(market.book_ask_vwap)}`
        }
      />
      <Row
        k="Поддержка"
        v={
          market.range_d == null
            ? 'мало баров'
            : `${fmt(market.range_d)} · уровень пробоя ${fmt(market.support)} · стакан bid ${fmt(market.book_bid_vwap)}`
        }
      />
      <Row k="Сделки M5" v={`${fmtInt(market.volume)} контрактов · buy ${fmtInt(market.vol_b)} / sell ${fmtInt(market.vol_s)}`} />
      <Row k="Заявки M5" v={put} />
      <Row k="age / life" v={`${formatMmSs(liveAge)} / ${formatMmSs(liveLife)}`} />
      <p style={hint}>
        Сопротивление = максимум pr_high за 12 прошлых M5, поддержка = минимум pr_low; текущий бар не входит.
        Стакан — VWAP 10 уровней obstats. Заявки — put_vol из orderstats (выставлено за эти 5 мин).
      </p>
    </Card>
  );
}

function oiLine(ev: LabEvent): string {
  if (ev.oi_status === 'received_late') return 'получен после deadline';
  if (ev.oi_status !== 'available') return 'unavailable';
  const fresh = ev.oi_fresh ? 'fresh' : 'stale';
  return `${fmt(ev.oi)} Δ ${fmt(ev.oi_change)} ln ${fmtLn(ev.oi_change_ln)} ${fresh}`;
}

function skipReasonLabel(reason: string | undefined): string {
  if (reason === 'price_received_late') return 'свеча получена после deadline';
  if (reason === 'oi_received_late') return 'FUTOI получен после deadline';
  if (reason === 'processing_late') return 'поздняя обработка';
  if (reason === 'oi_unavailable') return 'OI недоступен';
  if (reason === 'position_already_open') return 'позиция уже открыта';
  if (reason === 'session_close') return 'закрытие сессии';
  if (reason === 'filter') return 'OI-фильтр не пройден';
  return reason ?? 'пропущено';
}

function tradeLine(t: LabTrade | undefined): string {
  if (!t) return 'нет';
  if (t.status === 'skipped') return `пропущено · ${skipReasonLabel(t.skip_reason)}`;
  if (t.status === 'pending_entry') return 'ждёт вход следующего бара';
  if (t.status === 'open') return `в рынке ${fmt(t.entry_price)} / стоп ${fmt(t.stop)} / тейк ${fmt(t.target)}`;
  return `закрыто ${fmt(t.net_r)}R · ${t.exit_reason}`;
}

function shortTrade(t: LabTrade | undefined): string {
  if (!t) return '—';
  if (t.status === 'skipped') return skipReasonLabel(t.skip_reason);
  if (t.net_r != null) return `${t.net_r > 0 ? '+' : ''}${t.net_r}`;
  return t.status;
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid var(--color-border)',
  color: 'var(--color-muted-foreground)',
  fontWeight: 500,
};

const td: CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--color-border)',
  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
};

export function LabWidget({ slug }: { slug: WidgetSlug }) {
  let body: ReactNode;
  if (slug === 'lab-experiments' || slug === 'lab' || slug === 'lab-instrument' || slug === 'lab-protocol') body = <ExperimentsPane />;
  else if (slug === 'lab-monitor' || slug === 'lab-readiness' || slug === 'lab-b') body = <MonitorPane />;
  else if (slug === 'lab-results' || slug === 'lab-observations' || slug === 'lab-summary' || slug === 'lab-hypotheses') body = <ResultsPane />;
  else if (slug === 'lab-method') body = <MethodPane />;
  else body = <CombinedLab />;
  return <LabShell slug={slug}>{body}</LabShell>;
}

export function isLabSlug(slug: string): boolean {
  return slug.startsWith('lab');
}
