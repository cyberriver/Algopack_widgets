'use client';

import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { setupEmbedShell, type ExtensionBridge } from '@finamx/extension-sdk';
import { useBridge } from '@/hooks/use-bridge';
import { useLab } from '@/hooks/use-lab';
import { useHostTokens } from '@/hooks/use-tokens';
import { HYPOTHESIS_CATALOG } from '@/lib/lab/hypotheses';
import { formatMmSs, frontContract } from '@/lib/lab/time';
import {
  LAB_ENGINE_VERSION,
  type HypothesisId,
  type HypothesisStatus,
  type LabEvent,
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

function LabShell({ slug, children }: { slug: WidgetSlug; children: ReactNode }) {
  const { bridge } = useBridge(extensionIdFor(slug));
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
        {children}
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
      <Card label="Что такое U">
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>
          U — верхняя граница недавнего диапазона: максимум <strong>high</strong> за последние {p?.lookback_bars ?? 12}{' '}
          закрытых баров <em>до</em> текущего. Сам бар, на котором ищем пробой, в U не входит.
        </p>
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>
          D — пара снизу: минимум <strong>low</strong> на том же окне. Буфер b = max(2 тика, 0.1 × ATR
          {p?.atr_bars ?? 20}). Уровень лонга — U+b, шорта — D−b.
        </p>
        <p style={{ fontSize: 13, margin: 0 }}>
          Пробой вверх: прошлый close был не выше U+b, текущий close закрылся выше U+b. Это не «коснулись хвостом», а
          закрытие за зоной.
        </p>
      </Card>
      <Card label="Что считаем">
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>
          Пробой (B0): close за U+b / D−b против прошлого close. Окно U/D — {p?.lookback_bars ?? 12} баров, ATR
          {p?.atr_bars ?? 20}.
        </p>
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>
          Подтверждение (B1): тот же пробой и ΔOI = ln(OI_now / OI_ref) &gt; 0. Разница контрактов пишется рядом, в фильтр
          не идёт.
        </p>
        <p style={{ fontSize: 13, margin: 0 }}>FUTOI приходит раз в 5 минут. Lifetime — как давно APIM ответил успешно.</p>
      </Card>
      <Card label="Почему B1 не вошёл">
        <Row k="oi_unavailable" v="снимка не было вообще — не «фильтр сказал нет»" />
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
        <Row k="Основной ТФ" v={`${p.primary_timeframe} · тени не в P0`} />
        <Row k="D" v="только график ФинамХ, без сделок лаборатории" />
        <Row k="История инд." v="across_sessions" />
        <Row k="Ночь" v="forbidden" />
        <Row k="OI окно" v={`${p.oi_window_min} мин, available_time < bar_start`} />
        <Row k="Свежесть" v={`oi_fresh ≤ ${p.max_snapshot_age_min} мин; старше — держим, не discard`} />
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
    return (
      <>
        <h2 style={title}>Лаборатория B</h2>
        <p style={hint}>Событий M5 ещё нет. Холст пустой — смотрите лампу цены в готовности, не рисуем фейковые свечи.</p>
      </>
    );
  }
  const b0 = data?.trades.find((t) => t.event_id === ev.event_id && t.variant_id === 'B_PRICE');
  const b1 = data?.trades.find((t) => t.event_id === ev.event_id && t.variant_id === 'B_OI_POSITIVE');
  return (
    <>
      <h2 style={title}>Лаборатория B · продолжение</h2>
      <p style={hint}>
        M5 · {ev.contract} · B_PRICE {tradeLine(b0)} · B1 {tradeLine(b1)}
      </p>
      <Card label="Уровни последнего факта">
        <Row k="U / D" v={`${fmt(ev.range_u)} / ${fmt(ev.range_d)}`} />
        <Row k="ATR / буфер" v={`${fmt(ev.atr)} / ${fmt(ev.buffer)}`} />
        <Row k="close / уровень" v={`${fmt(ev.close)} / ${fmt(ev.level)} ${ev.direction}`} />
      </Card>
      <Card label="Последнее событие">
        <Row k="id" v={`${ev.event_id} · episode ${ev.market_episode_id}`} />
        <Row k="OI" v={oiLine(ev)} />
        <Row k="age / life" v={`${formatMmSs(ev.snapshot_age_sec)} / ${formatMmSs(ev.futoi_lifetime_sec)}`} />
        <Row k="B0" v={tradeLine(b0)} />
        <Row k="B1" v={tradeLine(b1)} />
        <Row k="delay" v={`${ev.processing_delay_ms} мс · ${ev.decision_lateness}`} />
        <p style={hint}>Вердикта на графике нет. Факт только здесь и в таблице наблюдений.</p>
      </Card>
    </>
  );
}

function ObservationsPane() {
  const { data, loading, error, annotate } = useLab();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  if (loading && !data) return <p style={hint}>Журнал…</p>;
  if (error && !data) return <p style={hint}>{error}</p>;
  const events = [...(data?.events ?? [])].reverse();
  const ev = events.find((e) => e.event_id === selected) ?? events[0];
  const linked = ev ? (data?.annotations[ev.event_id]?.hypothesis_ids ?? []) : [];
  return (
    <>
      <h2 style={title}>Наблюдения</h2>
      <p style={hint}>Факты не правятся в ячейке. Качество, гипотезы и заметка — слой аннотаций.</p>
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 880 }}>
          <thead>
            <tr>
              {['событие', 'ТФ', 'напр.', 'ΔOI ln', 'age', 'life', 'fresh', 'B0', 'B1', 'кач.', 'H'].map((h) => (
                <th key={h} style={th}>
                  {h}
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
                  <td style={td}>{e.event_id.slice(-10)}</td>
                  <td style={td}>{e.timeframe}</td>
                  <td style={td}>{e.direction}</td>
                  <td style={td}>{e.oi_status === 'available' ? fmtLn(e.oi_change_ln) : 'unavail'}</td>
                  <td style={td}>{formatMmSs(e.snapshot_age_sec)}</td>
                  <td style={td}>{formatMmSs(e.futoi_lifetime_sec)}</td>
                  <td style={td}>{e.oi_fresh == null ? '—' : e.oi_fresh ? 'да' : 'нет'}</td>
                  <td style={td}>{shortTrade(b0)}</td>
                  <td style={td}>{shortTrade(b1)}</td>
                  <td style={td}>{q}</td>
                  <td style={td}>{(ann?.hypothesis_ids ?? []).join(',') || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ev ? (
        <Card label={`Факт ${ev.event_id}`}>
          <p style={hint}>
            close {fmt(ev.close)} · ATR {fmt(ev.atr)} · {oiLine(ev)} · delay {ev.processing_delay_ms} мс ·{' '}
            {ev.decision_lateness} · source detector
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
  const { data, loading, error } = useLab();
  if (loading && !data) return <p style={hint}>Сводка…</p>;
  if (error && !data) return <p style={hint}>{error}</p>;
  const n = data?.events.length ?? 0;
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
                <td style={td}>{row.variant}</td>
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

function oiLine(ev: LabEvent): string {
  if (ev.oi_status !== 'available') return 'unavailable';
  const fresh = ev.oi_fresh ? 'fresh' : 'stale';
  return `${fmt(ev.oi)} Δ ${fmt(ev.oi_change)} ln ${fmtLn(ev.oi_change_ln)} ${fresh}`;
}

function tradeLine(t: LabTrade | undefined): string {
  if (!t) return 'нет';
  if (t.status === 'skipped') return `skip · ${t.skip_reason}`;
  if (t.status === 'pending_entry') return 'ждёт вход следующего бара';
  if (t.status === 'open') return `в рынке ${fmt(t.entry_price)} / стоп ${fmt(t.stop)} / тейк ${fmt(t.target)}`;
  return `закрыто ${fmt(t.net_r)}R · ${t.exit_reason}`;
}

function shortTrade(t: LabTrade | undefined): string {
  if (!t) return '—';
  if (t.status === 'skipped') return t.skip_reason ?? 'skip';
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
  if (slug === 'lab-protocol') body = <ProtocolPane />;
  else if (slug === 'lab-readiness') body = <ReadinessPane />;
  else if (slug === 'lab-b') body = <LabBPane />;
  else if (slug === 'lab-observations') body = <ObservationsPane />;
  else if (slug === 'lab-summary') body = <SummaryPane />;
  else if (slug === 'lab-method') body = <MethodPane />;
  else if (slug === 'lab-hypotheses') body = <HypothesesPane />;
  else if (slug === 'lab-instrument') body = <InstrumentPane />;
  else body = <CombinedLab />;
  return <LabShell slug={slug}>{body}</LabShell>;
}

export function isLabSlug(slug: string): boolean {
  return slug.startsWith('lab');
}
