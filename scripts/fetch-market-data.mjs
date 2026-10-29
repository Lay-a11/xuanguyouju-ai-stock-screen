import { mkdir, writeFile } from "node:fs/promises";

const universe = [
  ["600519", "1"], ["000858", "0"], ["601318", "1"], ["300750", "0"],
  ["600036", "1"], ["000333", "0"], ["600276", "1"], ["601012", "1"],
  ["600887", "1"], ["000651", "0"], ["600030", "1"], ["601166", "1"],
  ["600900", "1"], ["000001", "0"], ["600104", "1"], ["002594", "0"],
  ["600309", "1"], ["601888", "1"], ["000725", "0"], ["600438", "1"]
];

const marketUrl = new URL("https://push2.eastmoney.com/api/qt/ulist.np/get");
marketUrl.searchParams.set("fltt", "2");
marketUrl.searchParams.set("secids", universe.map(([code, market]) => `${market}.${code}`).join(","));
marketUrl.searchParams.set("fields", "f12,f14,f2,f9,f23,f3,f124");

const getJSON = async (url, attempts = 4) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 600 * attempt));
    }
  }
  throw lastError;
};

const market = await getJSON(marketUrl);
const quotes = new Map((market.data?.diff || []).map(row => [row.f12, row]));

async function getFinancial(code) {
  const url = new URL("https://datacenter-web.eastmoney.com/api/data/v1/get");
  url.searchParams.set("sortColumns", "REPORTDATE");
  url.searchParams.set("sortTypes", "-1");
  url.searchParams.set("pageSize", "8");
  url.searchParams.set("pageNumber", "1");
  url.searchParams.set("reportName", "RPT_LICO_FN_CPD");
  url.searchParams.set("columns", "SECURITY_CODE,SECURITY_NAME_ABBR,REPORTDATE,TOTAL_OPERATE_INCOME,PARENT_NETPROFIT,YSTZ,SJLTZ,NOTICE_DATE,QDATE,DATATYPE,PUBLISHNAME,SECUCODE");
  url.searchParams.set("filter", `(SECURITY_CODE=\"${code}\")`);
  const result = await getJSON(url);
  return result.result?.data?.[0] || null;
}

async function getVolatility(code, market) {
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  url.searchParams.set("secid", `${market}.${code}`);
  url.searchParams.set("klt", "101");
  url.searchParams.set("fqt", "1");
  url.searchParams.set("lmt", "22");
  url.searchParams.set("end", "20500101");
  url.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  url.searchParams.set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61");
  const result = await getJSON(url);
  const rows = result.data?.klines || [];
  const closes = rows.map(row => Number(row.split(",")[2])).filter(Number.isFinite);
  if (closes.length < 21) return { value: null, samples: closes.length };
  const returns = closes.slice(1).map((value, index) => Math.log(value / closes[index]));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return { value: Math.sqrt(variance) * Math.sqrt(252) * 100, samples: returns.length };
}

const stocks = [];
for (const [code, marketId] of universe) {
  try {
    const [financial, volatility] = await Promise.all([
      getFinancial(code),
      getVolatility(code, marketId)
    ]);
    const quote = quotes.get(code) || {};
    stocks.push({
      code,
      name: quote.f14 || financial?.SECURITY_NAME_ABBR || code,
      market: marketId === "1" ? "SH" : "SZ",
      industry: financial?.PUBLISHNAME || null,
      price: finite(quote.f2),
      changePct: finite(quote.f3),
      peTtm: positiveOrNull(quote.f9),
      pbMrq: positiveOrNull(quote.f23),
      revenueGrowth: finite(financial?.YSTZ),
      profitGrowth: finite(financial?.SJLTZ),
      volatility20d: round(volatility.value),
      volatilitySamples: volatility.samples,
      reportDate: dateOnly(financial?.REPORTDATE),
      noticeDate: dateOnly(financial?.NOTICE_DATE),
      reportType: financial?.DATATYPE || null,
      quoteTimestamp: quote.f124 ? new Date(quote.f124 * 1000).toISOString() : null,
      raw: {
        pe: { field: "f9", value: finite(quote.f9), unit: "倍" },
        pb: { field: "f23", value: finite(quote.f23), unit: "倍" },
        revenueGrowth: { field: "YSTZ", value: finite(financial?.YSTZ), unit: "%" },
        profitGrowth: { field: "SJLTZ", value: finite(financial?.SJLTZ), unit: "%" }
      }
    });
  } catch (error) {
    stocks.push({ code, market: marketId === "1" ? "SH" : "SZ", error: error.message });
  }
  await new Promise(resolve => setTimeout(resolve, 180));
}

const capturedAt = new Date().toISOString();
const payload = {
  schemaVersion: 1,
  capturedAt,
  universe: {
    name: "20 家沪深代表性公司演示池",
    size: universe.length,
    method: "为验证跨行业筛选与解释流程而固定的演示样本；不代表全 A 股覆盖或投资推荐。"
  },
  sources: [
    { name: "东方财富行情接口", url: marketUrl.origin, fields: ["最新价", "PE TTM", "PB MRQ", "行情时间"] },
    { name: "东方财富数据中心", url: "https://datacenter-web.eastmoney.com", fields: ["营收同比", "归母净利润同比", "报告期", "公告日期"] },
    { name: "东方财富历史行情接口", url: "https://push2his.eastmoney.com", fields: ["前复权日收盘价"] }
  ],
  stocks
};

await mkdir(new URL("../dist/data/", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/data/stocks.json", import.meta.url), JSON.stringify(payload, null, 2));
console.log(`Wrote ${stocks.length} records at ${capturedAt}; ${stocks.filter(s => !s.error).length} succeeded.`);

function finite(value) { const n = Number(value); return Number.isFinite(n) && value !== null ? round(n) : null; }
function positiveOrNull(value) { const n = finite(value); return n > 0 ? n : null; }
function round(value) { return value == null ? null : Math.round(Number(value) * 100) / 100; }
function dateOnly(value) { return value ? String(value).slice(0, 10) : null; }
