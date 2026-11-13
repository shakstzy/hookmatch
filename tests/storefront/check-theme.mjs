// Offline Shopify theme-check (theme app extension ruleset). Run: npm run check:theme
import { themeCheckRun } from '@shopify/theme-check-node';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../extensions/hookmatch-theme', import.meta.url));
const { offenses } = await themeCheckRun(root);
for (const o of offenses) console.log(o.severity, o.check, o.uri.split('/').slice(-2).join('/'), o.message);
console.log(`${offenses.length} offenses`);
process.exit(offenses.length ? 1 : 0);
