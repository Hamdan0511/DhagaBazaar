#!/usr/bin/env node
/**
 * Superseded: the supplier → admin → retailer flow (with database and security
 * checks) now lives in scripts/e2e-journeys.mjs. This wrapper keeps the old
 * command working by delegating to it.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/e2e-supplier-admin.mjs <outDir> <photo.jpg>
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [out = 'e2e-shots', photo] = process.argv.slice(2);
const r = spawnSync(process.execPath, [path.join(here, 'e2e-journeys.mjs'), out, photo].filter(Boolean), { stdio: 'inherit' });
process.exit(r.status ?? 1);
