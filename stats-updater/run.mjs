/**
 * Lista zonas y agrega solicitudes HTTP diarias (solo conteo).
 * Salida pública mínima: timeline total, totales por sitio, resumen.
 */

import { writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CF_API_TOKEN = process.env.CF_API_TOKEN || '';
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || '';
const OUTPUT_PATH = process.env.OUTPUT_PATH || join(process.cwd(), 'stats.json');
const ZONE_DAYS = Math.min(31, Math.max(1, parseInt(process.env.ZONE_DAYS || '14', 10)));
const UPDATE_INTERVAL_MS = parseInt(
  process.env.UPDATE_INTERVAL_MS || String(24 * 60 * 60 * 1000),
  10
);
const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const REST_BASE = 'https://api.cloudflare.com/client/v4';

const QUERY = `
query ZoneDaily($zoneTag: string!, $since: Date!) {
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

async function mapLimit(items, limit, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

function buildPublicPayload(rows, zoneDays) {
  const timelineMap = new Map();
  const bySite = [];

  for (const z of rows) {
    let siteSum = 0;
    for (const row of z.daily || []) {
      const n = Number(row.requests) || 0;
      siteSum += n;
      const d = row.date;
      if (!d) continue;
      timelineMap.set(d, (timelineMap.get(d) || 0) + n);
    }
    if (siteSum > 0) bySite.push({ name: z.name, requests: siteSum });
  }

  const timeline = [...timelineMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, requests]) => ({ date, requests }));

  const totalRequests = bySite.reduce((a, s) => a + s.requests, 0);
  bySite.sort((a, b) => b.requests - a.requests);

  return {
    updatedAt: new Date().toISOString(),
    summary: {
      totalRequests,
      daysWithData: timeline.length,
      sitesCount: bySite.length,
      windowDays: zoneDays,
    },
    timeline,
    bySite: bySite.slice(0, 40),
  };
}

async function runOnce() {
  const since = sinceDateString();
  const empty = {
    updatedAt: null,
    error: true,
    summary: null,
    timeline: [],
    bySite: [],
  };

  if (!CF_API_TOKEN) {
    await writeAtomic(OUTPUT_PATH, JSON.stringify(empty, null, 2));
    return;
  }

  try {
    const zoneList = await listAllZones();
    const results = await mapLimit(zoneList, 4, async (z) => {
      const { daily } = await fetchZoneDaily(z.zoneTag, since);
      return { name: z.name, daily };
    });
    const payload = buildPublicPayload(results, ZONE_DAYS);
    await writeAtomic(OUTPUT_PATH, JSON.stringify(payload, null, 2));
    console.log(
      `[traffic-stats] ${OUTPUT_PATH} — sitios con datos: ${payload.summary.sitesCount}, total req: ${payload.summary.totalRequests}`
    );
  } catch (e) {
    empty.updatedAt = new Date().toISOString();
    await writeAtomic(OUTPUT_PATH, JSON.stringify(empty, null, 2));
    console.error('[traffic-stats]', e);
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
