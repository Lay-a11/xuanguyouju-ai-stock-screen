import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../dist/app.js", import.meta.url), "utf8");
const data = JSON.parse(await readFile(new URL("../dist/data/stocks.json", import.meta.url), "utf8"));
const checks = [
  ["主页面包含自然语言输入", html.includes('id="chatInput"')],
  ["主页面采用单一对话入口", html.includes('class="chat-shell"') && !html.includes('class="guide-question"')],
  ["不再出现拆条件按钮", !html.includes("帮我拆成条件")],
  ["结果在对话下方生成", html.indexOf('id="resultSection"') > html.indexOf('class="chat-shell"')],
  ["支持概念解释与动态澄清", app.includes("function explain") && app.includes("function askPrice")],
  ["主页面包含三类结果", ["passCount", "failCount", "unknownCount"].every(id => html.includes(id))],
  ["筛选引擎区分信息不足", /status:\s*"unknown"/.test(app)],
  ["筛选引擎检测冲突", app.includes("findConflicts")],
  ["数据记录抓取时间", Boolean(data.capturedAt)],
  ["数据记录扶摇来源", Array.isArray(data.sources) && data.sources.some(source => source.name.includes("扶摇"))],
  ["股票记录请求追踪 ID", data.stocks.filter(stock => !stock.error).every(stock => stock.requestIds?.financials && stock.requestIds?.history)],
  ["股票池不少于 10 家", data.stocks.length >= 10],
  ["至少一条真实数据可用", data.stocks.some(stock => !stock.error && stock.price != null)]
];

let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed++;
}
if (failed) process.exit(1);
console.log(`\n${checks.length} checks passed.`);
