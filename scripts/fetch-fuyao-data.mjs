import { mkdir, writeFile } from "node:fs/promises";

const key = process.env.FUYAO_API_KEY;
if (!key) throw new Error("FUYAO_API_KEY is required; inject it at runtime and never commit it.");

const base = "https://fuyao.aicubes.cn";
const universe = [
  "600519.SH", "000858.SZ", "601318.SH", "300750.SZ", "600036.SH",
  "000333.SZ", "600276.SH", "601012.SH", "600887.SH", "000651.SZ",
  "600030.SH", "601166.SH", "600900.SH", "000001.SZ", "600104.SH",
  "002594.SZ", "600309.SH", "601888.SH", "000725.SZ", "600438.SH"
];

async function call(path, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(`${base}${path}`, {
        headers: { "X-api-key": key },
        signal: AbortSignal.timeout(25_000)
      });
      const body = await response.json();
      if (!response.ok || body.code !== 0) throw new Error(`Fuyao code=${body.code} ${body.message}; request_id=${body.request_id || "none"}`);
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(700 * attempt);
    }
  }
  throw lastError;
}

const encodedUniverse = encodeURIComponent(universe.join(","));
const [priceResponse, valuationResponse] = await Promise.all([
  call(`/api/a-share/prices/snapshot?thscodes=${encodedUniverse}`),
  call(`/api/a-share/valuations/snapshot?thscodes=${encodedUniverse}`)
]);
const prices = new Map(priceResponse.data.item.map(item => [item.thscode, item]));
const valuations = new Map(valuationResponse.data.item.map(item => [item.thscode, item]));
const end = Date.now();
const start = end - 100 * 24 * 60 * 60 * 1000;
const stocks = [];

for (const thscode of universe) {
  const [code, market] = thscode.split(".");
  try {
    const [financialResponse, historyResponse] = await Promise.all([
      call(`/api/a-share/financials/income-statements?thscode=${thscode}&period=quarterly&limit=8`),
      call(`/api/a-share/prices/historical?thscode=${thscode}&interval=1d&start=${start}&end=${end}&adjust=forward`)
    ]);
    const financials = [...financialResponse.data.item].sort((a, b) => b.period_end_ms - a.period_end_ms);
    const latest = financials[0] || null;
    const comparable = latest ? financials.find(item => item.fiscal_year === latest.fiscal_year - 1 && item.fiscal_period === latest.fiscal_period) : null;
    const price = prices.get(thscode) || {};
    const valuation = valuations.get(thscode) || {};
    const bars = historyResponse.data.item || [];
    const volatility = calculateVolatility(bars.slice(-21).map(item => Number(item.close_price)));
    stocks.push({
      code,
      name: valuation.name || thscode,
      market,
      industry: null,
      price: finite(price.last_price),
      changePct: finite(price.price_change_ratio_pct),
      peTtm: positiveOrNull(valuation.pe_ttm),
      pbMrq: positiveOrNull(valuation.pb_mrq),
      revenueGrowth: growth(latest?.operating_income, comparable?.operating_income),
      profitGrowth: growth(latest?.parent_holder_net_profit, comparable?.parent_holder_net_profit),
      volatility20d: volatility.value,
      volatilitySamples: volatility.samples,
      reportDate: asDate(latest?.period_end_ms),
      noticeDate: asDate(latest?.report_date_ms),
      reportType: latest ? `${latest.fiscal_year} ${latest.fiscal_period}` : null,
      quoteTimestamp: asIso(priceResponse.data.timestamp),
      requestIds: {
        prices: priceResponse.request_id,
        valuations: valuationResponse.request_id,
        financials: financialResponse.request_id,
        history: historyResponse.request_id
      },
      raw: {
        pe: { field: "pe_ttm", value: finite(valuation.pe_ttm), unit: "倍" },
        pb: { field: "pb_mrq", value: finite(valuation.pb_mrq), unit: "倍" },
        revenueGrowth: { field: "operating_income", latest: finite(latest?.operating_income), comparable: finite(comparable?.operating_income), unit: "元" },
        profitGrowth: { field: "parent_holder_net_profit", latest: finite(latest?.parent_holder_net_profit), comparable: finite(comparable?.parent_holder_net_profit), unit: "元" }
      }
    });
  } catch (error) {
    stocks.push({ code, market, name: valuations.get(thscode)?.name || thscode, error: error.message });
  }
  await sleep(220);
}

const capturedAt = new Date().toISOString();
const payload = {
  schemaVersion: 2,
  capturedAt,
  universe: {
    name: "20 家沪深代表性公司演示池",
    size: universe.length,
    method: "为验证跨行业筛选与解释流程而固定的演示样本；不代表全 A 股覆盖或投资推荐。"
  },
  sources: [{
    name: "同花顺扶摇金融数据 API",
    url: "https://fuyao.aicubes.cn/docs/",
    fields: ["行情快照", "PE TTM", "PB MRQ", "整体合并利润表", "前复权历史日线"],
    priceRequestId: priceResponse.request_id,
    valuationRequestId: valuationResponse.request_id
  }],
  stocks
};

await mkdir(new URL("../dist/data/", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/data/stocks.json", import.meta.url), JSON.stringify(payload, null, 2));
console.log(`Wrote ${stocks.length} Fuyao records at ${capturedAt}; ${stocks.filter(stock => !stock.error).length} succeeded.`);

function growth(current, previous) {
  const now = Number(current); const baseValue = Number(previous);
  if (!Number.isFinite(now) || !Number.isFinite(baseValue) || baseValue <= 0) return null;
  return round((now / baseValue - 1) * 100);
}
function calculateVolatility(closes) {
  const valid = closes.filter(value => Number.isFinite(value) && value > 0);
  if (valid.length < 21) return { value: null, samples: Math.max(0, valid.length - 1) };
  const returns = valid.slice(1).map((value, index) => Math.log(value / valid[index]));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return { value: round(Math.sqrt(variance) * Math.sqrt(252) * 100), samples: returns.length };
}
function finite(value) { const n = Number(value); return Number.isFinite(n) && value !== null ? round(n) : null; }
function positiveOrNull(value) { const n = finite(value); return n > 0 ? n : null; }
function round(value) { return value == null ? null : Math.round(Number(value) * 100) / 100; }
function asDate(ms) {
  if (!ms) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
function asIso(ms) { return ms ? new Date(ms).toISOString() : null; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
