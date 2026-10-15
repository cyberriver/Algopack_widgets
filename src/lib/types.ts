export const EXTENSION_PREFIX = 'com.finamx.algopack.futoi';
export const LAB_PREFIX = 'com.finamx.algopack.lab';
export const FILTER_TOPIC = 'com.finamx.algopack.futoi.filter';
export const DEFAULT_SECID = 'Si';
export const POLL_MS = 10 * 60 * 1000;
export const HISTORY_FLOOR = '2019-01-01';

export const DEFAULT_UNIVERSE = ['Si', 'BR', 'RI', 'GD', 'CR', 'GZ', 'NG', 'SV'] as const;

export const ASSET_NAMES: Record<string, string> = {
  Si: 'Курс доллар США — российский рубль',
  BR: 'Нефть Brent',
  RI: 'Индекс РТС',
  GD: 'Золото',
  CR: 'Курс китайский юань — российский рубль',
  GZ: 'Газпром',
  NG: 'Природный газ',
  SV: 'Серебро',
};

export type Lookback = 'session' | '5d' | '20d' | '60d';
export type ClGroup = 'FIZ' | 'YUR';
export type TokenStatus = 'no_token' | 'connecting' | 'ok' | 'subscription_expired' | 'upstream_error';

export type FutoiFilterPayload = {
  secid: string;
  assetName?: string;
  sessionDate?: string;
  lookback?: Lookback;
};

export type FutoiRow = {
  ticker: string;
  tradedate: string;
  tradetime: string;
  clgroup: ClGroup;
  posLong: number;
  posShort: number;
  posLongNum: number;
  posShortNum: number;
};

export type PricePoint = {
  ts: string;
  price: number;
};

export type SeriesPoint = {
  ts: string;
  price: number | null;
  fiz: GroupMetrics;
  yur: GroupMetrics;
};

export type GroupMetrics = {
  posLong: number;
  posShort: number;
  posLongNum: number;
  posShortNum: number;
  openInterest: number;
  directed: number;
};

export type SnapshotBlock = {
  tradedate: string;
  tradetime: string;
  fizLong: number;
  fizShort: number;
  yurLong: number;
  yurShort: number;
  fizLongNum: number;
  fizShortNum: number;
  yurLongNum: number;
  yurShortNum: number;
  totalOi: number;
};

export type SnapshotResponse = {
  secid: string;
  assetName: string;
  current: SnapshotBlock | null;
  previousClose: SnapshotBlock | null;
  deltaContracts: SnapshotBlock | null;
  deltaPersons: SnapshotBlock | null;
  stale?: boolean;
  error?: TokenStatus;
};

export type SeriesResponse = {
  secid: string;
  points: SeriesPoint[];
  stale?: boolean;
  error?: TokenStatus;
};

export type UniverseItem = { secid: string; assetName: string };

export type LoadProgress = {
  current?: string;
  done: number;
  total: number;
  etaSec: number;
};

export type WidgetSlug =
  | 'filter'
  | 'table'
  | 'long-short-fiz'
  | 'long-short-yur'
  | 'persons-fiz'
  | 'persons-yur'
  | 'oi-fiz'
  | 'oi-yur'
  | 'directed-fiz'
  | 'directed-yur'
  | 'dashboard'
  | 'lab-experiments'
  | 'lab-monitor'
  | 'lab-results'
  | 'lab-protocol'
  | 'lab-readiness'
  | 'lab-b'
  | 'lab-observations'
  | 'lab-summary'
  | 'lab-method'
  | 'lab-hypotheses'
  | 'lab-instrument'
  | 'lab';

export const WIDGETS: Array<{
  slug: WidgetSlug;
  name: string;
  displayName: string;
  description: string;
}> = [
  { slug: 'filter', name: 'filter', displayName: 'FUTOI фильтр', description: 'Выбор фьючерсного контракта.' },
  { slug: 'table', name: 'table', displayName: 'FUTOI таблица', description: 'Снимок открытых позиций.' },
  { slug: 'long-short-fiz', name: 'long-short-fiz', displayName: 'FUTOI long/short физлица', description: 'Длинные и короткие позиции физлиц.' },
  { slug: 'long-short-yur', name: 'long-short-yur', displayName: 'FUTOI long/short юрлица', description: 'Длинные и короткие позиции юрлиц.' },
  { slug: 'persons-fiz', name: 'persons-fiz', displayName: 'FUTOI число лиц физлица', description: 'Количество физлиц с позициями.' },
  { slug: 'persons-yur', name: 'persons-yur', displayName: 'FUTOI число лиц юрлица', description: 'Количество юрлиц с позициями.' },
  { slug: 'oi-fiz', name: 'oi-fiz', displayName: 'FUTOI открытый интерес физлица', description: 'Сумма позиций физлиц.' },
  { slug: 'oi-yur', name: 'oi-yur', displayName: 'FUTOI открытый интерес юрлица', description: 'Сумма позиций юрлиц.' },
  { slug: 'directed-fiz', name: 'directed-fiz', displayName: 'FUTOI направленная физлица', description: 'Направленная позиция физлиц.' },
  { slug: 'directed-yur', name: 'directed-yur', displayName: 'FUTOI направленная юрлица', description: 'Направленная позиция юрлиц.' },
  { slug: 'dashboard', name: 'dashboard', displayName: 'FUTOI обзор', description: 'Таблица и все графики.' },
  { slug: 'lab-experiments', name: 'lab-experiments', displayName: 'Лаборатория: эксперименты', description: 'Параллельные неизменяемые конфигурации стратегии.' },
  { slug: 'lab-monitor', name: 'lab-monitor', displayName: 'Лаборатория: монитор', description: 'Потоки Algopack, M5, сигналы и открытые виртуальные сделки.' },
  { slug: 'lab-results', name: 'lab-results', displayName: 'Лаборатория: результаты', description: 'События, сделки, доходность и сравнение экспериментов.' },
  { slug: 'lab-protocol', name: 'lab-protocol', displayName: 'Лаборатория: протокол', description: 'Замороженные правила Si_breakout_v0.2.' },
  { slug: 'lab-readiness', name: 'lab-readiness', displayName: 'Лаборатория: готовность', description: 'Три лампы: цена, OI, исполнение.' },
  { slug: 'lab-b', name: 'lab-b', displayName: 'Лаборатория: детектор пробоя', description: 'Последний автодетект пробоя M5 без вердикта на графике.' },
  { slug: 'lab-observations', name: 'lab-observations', displayName: 'Лаборатория: наблюдения', description: 'Неизменяемые события B0/B1 и аннотации.' },
  { slug: 'lab-summary', name: 'lab-summary', displayName: 'Лаборатория: сводка', description: 'Счётчики вариантов, не допуск в live.' },
  { slug: 'lab-method', name: 'lab-method', displayName: 'Лаборатория: методология', description: 'B0/B1, ΔOI и oi_unavailable простыми словами.' },
  { slug: 'lab-hypotheses', name: 'lab-hypotheses', displayName: 'Лаборатория: гипотезы', description: 'Реестр H-MOVE / H-OI / H-BRK / H-CONF.' },
  { slug: 'lab-instrument', name: 'lab-instrument', displayName: 'Лаборатория: инструмент', description: 'Семейство и серия. Смена закрывает журнал.' },
  { slug: 'lab', name: 'lab', displayName: 'Лаборатория: обзор', description: 'Экраны P0.1 на одной карточке.' },
];

const LAB_EXTENSION_SUFFIX: Record<string, string> = {
  'lab-experiments': 'experiments',
  'lab-monitor': 'monitor',
  'lab-results': 'results',
  'lab-protocol': 'protocol',
  'lab-readiness': 'readiness',
  'lab-b': 'b',
  'lab-observations': 'observations',
  'lab-summary': 'summary',
  'lab-method': 'method',
  'lab-hypotheses': 'hypotheses',
  'lab-instrument': 'instrument',
  lab: 'combined',
};

export function extensionIdFor(slug: string): string {
  const lab = LAB_EXTENSION_SUFFIX[slug];
  if (lab) return `${LAB_PREFIX}.${lab}`;
  return `${EXTENSION_PREFIX}.${slug}`;
}

export function emptyMetrics(): GroupMetrics {
  return {
    posLong: 0,
    posShort: 0,
    posLongNum: 0,
    posShortNum: 0,
    openInterest: 0,
    directed: 0,
  };
}

export function metricsFromRow(row: FutoiRow): GroupMetrics {
  const posLong = Math.abs(row.posLong);
  const posShort = Math.abs(row.posShort);
  return {
    posLong,
    posShort,
    posLongNum: row.posLongNum,
    posShortNum: row.posShortNum,
    openInterest: posLong + posShort,
    directed: posLong - posShort,
  };
}
