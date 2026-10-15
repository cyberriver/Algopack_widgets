import { WidgetView } from '@/components/widget-view';
import { serverTokenReady } from '@/lib/token-store';
import { WIDGETS, type WidgetSlug } from '@/lib/types';

export function generateStaticParams() {
  return WIDGETS.map((w) => ({ slug: w.slug }));
}

export default async function WidgetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const known = WIDGETS.some((w) => w.slug === slug);
  if (!known) return <p style={{ padding: 16, fontFamily: 'system-ui' }}>Неизвестный виджет</p>;
  const tokenStatus = (await serverTokenReady()) ? 'ok' : 'no_token';
  return <WidgetView slug={slug as WidgetSlug} tokenStatus={tokenStatus} />;
}
