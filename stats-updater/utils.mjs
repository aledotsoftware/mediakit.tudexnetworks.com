/**
 * Mapea items con un límite de concurrencia por lotes.
 */
export async function mapLimit(items, limit, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

/**
 * Construye el payload público a partir de los datos de Cloudflare.
 */
export function buildPublicPayload(rows, zoneDays) {
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
