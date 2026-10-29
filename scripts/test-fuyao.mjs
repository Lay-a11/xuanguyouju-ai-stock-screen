const key = process.env.FUYAO_API_KEY;
if (!key) throw new Error("FUYAO_API_KEY is required");

const base = "https://fuyao.aicubes.cn";
async function call(path) {
  const response = await fetch(`${base}${path}`, {
    headers: { "X-api-key": key },
    signal: AbortSignal.timeout(20_000)
  });
  const body = await response.json();
  return {
    httpStatus: response.status,
    code: body.code,
    message: body.message,
    requestId: body.request_id,
    data: body.data
  };
}

const thscode = "600519.SH";
const end = Date.now();
const start = end - 90 * 24 * 60 * 60 * 1000;
const results = {
  prices: await call(`/api/a-share/prices/snapshot?thscodes=${thscode}`),
  valuations: await call(`/api/a-share/valuations/snapshot?thscodes=${thscode}`),
  financials: await call(`/api/a-share/financials/income-statements?thscode=${thscode}&period=quarterly&limit=2`),
  indicators: await call(`/api/a-share/financials/indicators?thscode=${thscode}&report=2026-3`),
  history: await call(`/api/a-share/prices/historical?thscode=${thscode}&interval=1d&start=${start}&end=${end}&adjust=forward`)
};

const summary = Object.fromEntries(Object.entries(results).map(([name, result]) => [name, {
  httpStatus: result.httpStatus,
  code: result.code,
  message: result.message,
  requestId: result.requestId,
  items: Array.isArray(result.data?.item) ? result.data.item.length : null,
  sampleFields: result.data?.item?.[0] ? Object.keys(result.data.item[0]) : []
}]));
console.log(JSON.stringify(summary, null, 2));
