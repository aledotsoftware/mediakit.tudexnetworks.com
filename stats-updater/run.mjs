/**
 * Lista zonas y agrega solicitudes HTTP diarias (solo conteo).
 * Salida pública mínima: timeline total, totales por sitio, resumen.
 */

import { writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { mapLimit, buildPublicPayload } from './utils.mjs';

const CF_API_TOKEN = process.env.CF_API_TOKEN || '';
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || '';
const OUTPUT_PATH = process.env.OUTPUT_PATH || join(process.cwd(), 'stats.json');
const ZONE_DAYS = Math.min(31, Math.max(1, parseInt(process.env.ZONE_DAYS || '30', 10)));
const UPDATE_INTERVAL_MS = parseInt(
  process.env.UPDATE_INTERVAL_MS || String(24 * 60 * 60 * 1000),
  10
);
const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const REST_BASE = 'https://api.cloudflare.com/client/v4';

const QUERY = `
query ZoneDaily($zoneTag: String!, $since: Date!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequests1dGroups(
        limit: 100
        filter: { date_geq: $since }
        orderBy: [date_ASC]
      ) {
        dimensions { date }
        sum { requests }
      }
    }
  }
}`.replace(/\s+/g, ' ');

function sinceDateString() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - ZONE_DAYS);
  return d.toISOString().slice(0, 10);
}

async function listAllZones() {
  const zones = [];
  let page = 1;
  const headers = { Authorization: `Bearer ${CF_API_TOKEN}` };
  for (;;) {
    const url = new URL(`${REST_BASE}/zones`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', '50');
    if (CF_ACCOUNT_ID) url.searchParams.set('account.id', CF_ACCOUNT_ID);

    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!json.success) {
      const msg = json.errors?.map((e) => e.message).join('; ') || res.statusText;
      throw new Error(`Listar zonas: ${msg}`);
    }
    for (const z of json.result) {
      zones.push({
        zoneTag: z.id,
        name: z.name,
      });
    }
    if (json.result.length < 50) break;
    page += 1;
  }
  return zones;
}

async function fetchZoneDaily(zoneTag, since) {
  const body = { query: QUERY, variables: { zoneTag, since } };
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.errors?.length) {
    return { daily: [] };
  }
  const groups = json.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
  return {
    daily: groups.map((g) => ({
      date: g.dimensions?.date,
      requests: g.sum?.requests ?? 0,
    })),
  };
}


async function runOnce() {
  const since = sinceDateString();
  const empty = {
    updatedAt: new Date().toISOString(),
    error: true,
    message: 'Iniciando proceso...',
    summary: null,
    timeline: [],
    bySite: [],
  };

  if (!CF_API_TOKEN) {
    console.error('[traffic-stats] Error: CF_API_TOKEN no configurado.');
    empty.message = 'CF_API_TOKEN faltante';
    await writeAtomic(OUTPUT_PATH, JSON.stringify(empty, null, 2));
    return;
  }

  try {
    console.log('[traffic-stats] Listando zonas...');
    const zoneList = await listAllZones();
    console.log(`[traffic-stats] ${zoneList.length} zonas encontradas.`);
    
    if (zoneList.length === 0) {
      empty.error = false;
      empty.message = 'No se encontraron zonas en la cuenta.';
      await writeAtomic(OUTPUT_PATH, JSON.stringify(empty, null, 2));
      return;
    }

    const results = await mapLimit(zoneList, 4, async (z) => {
      try {
        const { daily } = await fetchZoneDaily(z.zoneTag, since);
        return { name: z.name, daily };
      } catch (e) {
        console.error(`[traffic-stats] Error en zona ${z.name}:`, e.message);
        return { name: z.name, daily: [] };
      }
    });

    const payload = buildPublicPayload(results, ZONE_DAYS);
    await writeAtomic(OUTPUT_PATH, JSON.stringify(payload, null, 2));
    console.log(
      `[traffic-stats] ${OUTPUT_PATH} actualizado — sitios con datos: ${payload.summary.sitesCount}, total req: ${payload.summary.totalRequests}`
    );
  } catch (e) {
    console.error('[traffic-stats] Error crítico:', e.message);
    empty.updatedAt = new Date().toISOString();
    empty.message = e.message;
    await writeAtomic(OUTPUT_PATH, JSON.stringify(empty, null, 2));
  }
}

async function writeAtomic(target, text) {
  const dir = dirname(target);
  const tmp = join(dir, `.stats.${process.pid}.tmp`);
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, target);
}

await runOnce();
setInterval(runOnce, UPDATE_INTERVAL_MS);
