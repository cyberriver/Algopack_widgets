import { createMockBridge } from '@finamx/extension-sdk/mock';

const bridge = createMockBridge({ grantedScopes: ['ui.toast', 'user.profile.read'] });
let publishes = 0;
let filter = { secid: 'Si', lookback: 'session' };

bridge.context.subscribe('fdc3.instrument', (payload) => {
  const ticker = payload?.id?.ticker;
  if (!ticker || ticker.toLowerCase() === filter.secid.toLowerCase()) return;
  filter = { ...filter, secid: ticker };
  // must NOT publish again — that was the freeze
});

const before = Date.now();
bridge.context.publish('fdc3.instrument', { type: 'fdc3.instrument', id: { ticker: 'BR' } });
publishes += 1;
const elapsed = Date.now() - before;

if (filter.secid !== 'BR') {
  console.error('FAIL: secid did not become BR');
  process.exit(1);
}
if (elapsed > 200) {
  console.error(`FAIL: took ${elapsed}ms — looks like a loop`);
  process.exit(1);
}
console.log(`ok: Si→BR in ${elapsed}ms, publishes=${publishes}, secid=${filter.secid}`);
