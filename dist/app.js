const catalog={
 revenueGrowth:{label:"营业收入增长",unit:"%",help:"最新报告期与上年同期营业收入比较"},
 profitGrowth:{label:"归母净利润增长",unit:"%",help:"最新报告期与上年同期归母净利润比较"},
 peTtm:{label:"市盈率",unit:"倍",help:"当前价格相对公司过去一年盈利的倍数"},
 pbMrq:{label:"市净率",unit:"倍",help:"当前价格相对公司最近净资产的倍数"},
 volatility20d:{label:"近期价格波动",unit:"%",help:"近20个交易日价格波动程度，越低越平稳"}
};
let dataset,conditions=[],results=[],activeTab="pass",previousRun=null,topic=null;
let requested={growth:false,price:false,stability:false},resolved={growth:false,price:false,stability:false},pendingGrowth="";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];

init();
async function init(){
 try{dataset=await(await fetch("./data/stocks.json",{cache:"no-store"})).json();const n=dataset.stocks.filter(s=>!s.error).length;$("#dataStatus").textContent=`真实数据快照 · ${time(dataset.capturedAt)}`;$("#universeDetail").textContent=`${dataset.universe.name} · ${n}/${dataset.universe.size} 家数据可用`;}catch{$("#dataStatus").textContent="数据读取失败";}
 $("#chatForm").addEventListener("submit",e=>{e.preventDefault();handleText($("#chatInput").value)});
 $("#chatInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("#chatForm").requestSubmit()}});
 $("#restartChat").addEventListener("click",restart);
 $("#stockSearch").addEventListener("input",renderResults);
 $$("[data-tab]").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));
 $("#saveStrategy").addEventListener("click",saveStrategy);$(".dialog-close").addEventListener("click",()=>$("#evidenceDialog").close());
}

function handleText(raw){
 const text=raw.trim();if(!text)return;$("#chatInput").value="";message("user",safe(text));
 if(/稳赚|必涨|收益承诺|买入|卖出|推荐.*股票|预测.*涨跌|涨停/.test(text)){message("ai","我不能提供直接买卖建议、确定性涨跌预测或收益承诺。我可以帮助你把研究偏好转成透明的数据条件，再展示哪些公司满足或不满足。");return}
 if(/现金流|行业.*最低|行业.*估值|ROE|股息|分红/i.test(text)){message("ai","你提到的条件目前不在这个演示版本支持范围内，我不会用其他指标静默替代。当前可执行的是收入增长、利润增长、市盈率、市净率和近期价格波动；你可以从中重新描述，或暂时不加入该条件。");return}
 if(/什么意思|是什么|怎么理解|为什么|解释|区别/.test(text))return explain(text);
 if(!Object.values(requested).some(Boolean))return understand(text);
 if(topic==="growthMeaning"){
  if(/收入.*利润|利润.*收入|两者|都看/.test(text))return askGrowthThreshold("both");
  if(/收入|营收|规模/.test(text))return askGrowthThreshold("revenue");
  if(/利润|盈利|赚钱/.test(text))return askGrowthThreshold("profit");
 }
 if(topic==="priceMeaning"&&/盈利|市盈率|估值/.test(text))return askPriceThreshold();
 if(topic==="stabilityMeaning"&&/波动|涨跌幅度/.test(text))return askStabilityThreshold();
 const num=Number(text.match(/\d+(?:\.\d+)?/)?.[0]);
 if(Number.isFinite(num)&&topic?.endsWith("Threshold")){
  if(topic==="growthThreshold"){if(["revenue","both"].includes(pendingGrowth))upsert("revenueGrowth","gte",pendingGrowth==="both"?0:num);if(["profit","both"].includes(pendingGrowth))upsert("profitGrowth","gte",num);resolved.growth=true}
  if(topic==="priceThreshold"){upsert("peTtm","lte",num);resolved.price=true}
  if(topic==="stabilityThreshold"){upsert("volatility20d","lte",num);resolved.stability=true}
  message("ai",`好的，已按你输入的 <strong>${num}${topic==="priceThreshold"?"倍":"%"}</strong> 记录。`);return next();
 }
 if(/不限制|删掉|先不看|不要这个/.test(text)&&topic){const k=topic.startsWith("growth")?"growth":topic.startsWith("price")?"price":"stability";removeTopic(k);resolved[k]=true;message("ai","好的，这一项暂时不作为筛选条件。");return next()}
 message("ai","我还不能确定这句话对应哪个标准。你可以选择上方选项、直接输入一个数字，或者问我“这是什么意思”。");
}
function understand(text){
 requested.growth=/经营|业绩|收入|营收|利润|盈利|赚钱|改善/.test(text);requested.price=/价格|便宜|贵|估值|市盈率|pe/i.test(text);requested.stability=/走势|稳定|波动|稳/.test(text);
 if(!Object.values(requested).some(Boolean))return message("ai","我暂时没识别出你想比较的方向。可以试着说：“经营在变好、价格别太贵、走势稳一点”。");
 const parts=[];if(requested.growth)parts.push("公司经营正在改善");if(requested.price)parts.push("当前价格不过高");if(requested.stability)parts.push("近期走势相对稳定");
 message("ai",`我理解你想找：<strong>${parts.join("、")}</strong>。这些说法可能有不同含义，我不会直接替你填数字；我们逐项确认，只问不明确的部分。`);next();
}
function next(){if(requested.growth&&!resolved.growth)return askGrowth();if(requested.price&&!resolved.price)return askPrice();if(requested.stability&&!resolved.stability)return askStability();strategyCard()}

function askGrowth(){topic="growthMeaning";question("你说的“经营改善”，最想表达哪一种变化？",[["收入增加","公司卖出的商品或服务更多了","growth-revenue"],["利润增加","公司最终赚到的钱更多了","growth-profit"],["两者都看","收入与利润都不能变差","growth-both"],["暂不限制","不把经营变化作为条件","growth-none"]],"这里先确认含义，不先替你决定增长多少。")}
function askGrowthThreshold(kind){topic="growthThreshold";pendingGrowth=kind;question("你希望“增长”达到什么程度？",[["只要不下降","至少 0%","growth-0"],["至少增长 10%","排除增长较弱的公司","growth-10"],["至少增长 20%","要求更明显的增长","growth-20"],["自己输入","直接回复一个百分比","growth-custom"]],"这些只是可选起点，没有唯一正确答案。")}
function askPrice(){topic="priceMeaning";question("你说的“价格合理”，具体是想比较什么？",[["价格相对盈利不算高","比较股价与公司过去一年盈利","price-earnings"],["比自己的历史价格低","比较当前价格与过去区间","price-history"],["接近我的买入价","按你的目标价格判断","price-target"],["暂不限制价格","不设置价格相关条件","price-none"]],"这里的“价格”可能指完全不同的事情，先把含义聊清楚。")}
function askPriceThreshold(){topic="priceThreshold";const impact=v=>dataset?dataset.stocks.filter(s=>Number.isFinite(s.peTtm)&&s.peTtm>0&&s.peTtm<=v).length:"—";question("如果用“价格相对盈利”判断，你希望市盈率最高不超过多少？",[["不超过 20 倍",`当前股票池单看此项可保留 ${impact(20)} 家`,"price-20"],["不超过 30 倍",`当前股票池单看此项可保留 ${impact(30)} 家`,"price-30"],["不超过 50 倍",`当前股票池单看此项可保留 ${impact(50)} 家`,"price-50"],["自己输入","直接回复一个倍数","price-custom"],["暂不限制","删除这一项","price-none"]],"市盈率 30 倍大致表示：公司过去一年每产生 1 元利润，市场给出 30 元价格；它不是股票单价。")}
function askStability(){topic="stabilityMeaning";question("你说的“走势稳定”，更接近哪一种意思？",[["每天涨跌幅度较小","关注近期价格波动大小","stability-volatility"],["最近没有明显下跌","关注趋势方向","stability-trend"],["价格维持在某个区间","关注上下限范围","stability-range"],["暂不限制走势","不设置走势条件","stability-none"]],"当前数据版本能直接执行的是“近期价格波动大小”。")}
function askStabilityThreshold(){topic="stabilityThreshold";question("近 20 个交易日的波动率，最高接受多少？",[["不超过 25%","筛出价格波动更小的公司","stability-25"],["不超过 35%","保留范围相对更大","stability-35"],["自己输入","直接回复一个百分比","stability-custom"],["暂不限制","删除这一项","stability-none"]],"波动率越低，只代表近期价格变化较小，不代表未来一定不会下跌。")}
function question(title,options,note){message("ai",`<p><strong>${title}</strong></p><p class="message-note">${note}</p><div class="chat-options">${options.map(([a,b,c])=>`<button type="button" data-action="${c}"><strong>${a}</strong><small>${b}</small></button>`).join("")}</div><button type="button" class="ask-link" data-action="explain">我还不太明白，先解释一下</button>`);bindActions()}
function bindActions(){$$("[data-action]").forEach(b=>{if(b.dataset.bound)return;b.dataset.bound=1;b.addEventListener("click",()=>action(b.dataset.action,b))})}
function action(a,b){
 if(a==="explain")return explain(topic||"");
 const title=b.querySelector("strong")?.textContent||b.textContent.trim();message("user",safe(title));b.closest(".chat-options")?.querySelectorAll("button").forEach(x=>x.disabled=true);
 if(/^growth-(revenue|profit|both)$/.test(a))return askGrowthThreshold(a.split("-")[1]);
 if(a==="growth-none"){removeTopic("growth");resolved.growth=true;return next()}
 if(/^growth-(0|10|20)$/.test(a)){const v=Number(a.split("-")[1]);if(["revenue","both"].includes(pendingGrowth))upsert("revenueGrowth","gte",pendingGrowth==="both"?0:v);if(["profit","both"].includes(pendingGrowth))upsert("profitGrowth","gte",v);resolved.growth=true;return next()}
 if(a==="growth-custom"){topic="growthThreshold";return message("ai","请直接输入希望的最低增长百分比，例如“15%”。")}
 if(a==="price-earnings")return askPriceThreshold();
 if(["price-history","price-target"].includes(a)){message("ai",a==="price-history"?"这需要历史估值区间或历史价格比较。当前版本暂时不能可靠执行，我不会偷偷替换成市盈率。":"目标买入价需要指定股票和具体价格，不适合当前跨公司筛选。");return askPrice()}
 if(/^price-(20|30|50)$/.test(a)){upsert("peTtm","lte",Number(a.split("-")[1]));resolved.price=true;return next()}
 if(a==="price-custom"){topic="priceThreshold";return message("ai","请直接输入能接受的市盈率上限，例如“25倍”。")}
 if(a==="price-none"){removeTopic("price");resolved.price=true;return next()}
 if(a==="stability-volatility")return askStabilityThreshold();
 if(["stability-trend","stability-range"].includes(a)){message("ai","这个含义与“波动小”不同，需要趋势或价格区间规则。当前版本不会强行转换成波动率。");return askStability()}
 if(/^stability-(25|35)$/.test(a)){upsert("volatility20d","lte",Number(a.split("-")[1]));resolved.stability=true;return next()}
 if(a==="stability-custom"){topic="stabilityThreshold";return message("ai","请直接输入能接受的波动率上限，例如“30%”。")}
 if(a==="stability-none"){removeTopic("stability");resolved.stability=true;return next()}
}
function explain(text){
 const k=/市盈率|价格|估值|price/i.test(text)?"price":/经营|收入|利润|growth/i.test(text)?"growth":/波动|走势|稳定|stability/i.test(text)?"stability":topic?.startsWith("price")?"price":topic?.startsWith("growth")?"growth":"stability";
 const e={price:"<strong>“价格合理”没有统一答案。</strong>它可能指股价相对盈利不高、比自身历史价格低，或接近你的目标买入价。市盈率比较的是价格与过去一年盈利，不是股票单价；它只能作为一个筛选维度。",growth:"<strong>“经营改善”也不是一个固定指标。</strong>收入增加说明生意规模扩大，利润增加说明最终赚到的钱更多；两者并不总是同时发生。它还可能指扭亏或现金流改善。",stability:"<strong>“走势稳定”可能指不同事情。</strong>波动小、没有明显下跌和维持在某个区间不是同一种规则。波动小也不代表未来不会下跌。"};
 message("ai",`<div class="explain-box">${e[k]}</div><p class="message-note">你可以继续追问，也可以回到刚才的问题作出选择。</p>`);
}

function strategyCard(){
 topic="ready";message("ai",`<section class="strategy-card"><span class="eyebrow">共同确认的最终策略</span><h2>我会按下面这些标准查找</h2><ol id="strategySummary">${conditions.map(c=>`<li>${sentence(c)}</li>`).join("")}</ol><p class="strategy-note">这些条件来自刚才的对话，不是系统替你认定的“正确答案”。</p><details class="fine-tune"><summary>精细调整</summary><p>这里是同一份策略的具体数字。修改后，上面的总结会同步更新。</p><div id="conditionList"></div><button id="addCondition" class="text-button" type="button">＋ 添加条件</button><div id="conflictBox" class="conflict hidden"></div></details><button id="runScreen" class="primary strategy-run" type="button">按这个策略筛选 <span>→</span></button></section>`);renderEditors();$("#runScreen").addEventListener("click",runScreen);$("#addCondition").addEventListener("click",()=>{conditions.push(cond("peTtm","lte",30));syncStrategy()})}
function renderEditors(){const box=$("#conditionList");if(!box)return;box.innerHTML=conditions.map(c=>`<article class="condition-card" data-id="${c.id}"><header><h3>${catalog[c.metric].label}</h3><button class="remove" type="button">×</button></header><div class="condition-editor"><select class="metric">${Object.keys(catalog).map(k=>`<option value="${k}" ${k===c.metric?"selected":""}>${catalog[k].label}</option>`).join("")}</select><select class="operator"><option value="gte" ${c.operator==="gte"?"selected":""}>不低于 ≥</option><option value="lte" ${c.operator==="lte"?"selected":""}>不超过 ≤</option></select><input class="value" type="number" value="${c.value}"><span>${catalog[c.metric].unit}</span></div><p>${catalog[c.metric].help}</p></article>`).join("");box.querySelectorAll(".condition-card").forEach(card=>{const id=card.dataset.id;card.querySelector(".remove").addEventListener("click",()=>{conditions=conditions.filter(c=>c.id!==id);syncStrategy()});["metric","operator","value"].forEach(f=>card.querySelector("."+f).addEventListener("change",e=>{const c=conditions.find(x=>x.id===id);c[f]=f==="value"?Number(e.target.value):e.target.value;syncStrategy()}))});validate()}
function syncStrategy(){const s=$("#strategySummary");if(s)s.innerHTML=conditions.map(c=>`<li>${sentence(c)}</li>`).join("");renderEditors()}
function validate(){const invalid=!conditions.length||conditions.some(c=>!Number.isFinite(c.value)),conf=findConflicts(),box=$("#conflictBox"),run=$("#runScreen");if(box){box.classList.toggle("hidden",!invalid&&!conf.length);box.textContent=invalid?"至少需要一个有效条件。":conf.join("；")}if(run)run.disabled=invalid||conf.length>0||!dataset}
function upsert(metric,operator,value){conditions=conditions.filter(c=>c.metric!==metric);conditions.push(cond(metric,operator,value))}
function removeTopic(k){const m={growth:["revenueGrowth","profitGrowth"],price:["peTtm","pbMrq"],stability:["volatility20d"]}[k];conditions=conditions.filter(c=>!m.includes(c.metric))}
function cond(metric,operator,value){return{id:crypto.randomUUID(),metric,operator,value}}
function sentence(c){return{revenueGrowth:`最新一期营业收入至少增长 ${c.value}%`,profitGrowth:`最新一期归母净利润至少增长 ${c.value}%`,peTtm:`每 1 元过去一年盈利，对应的市场价格不超过 ${c.value} 元（市盈率 ≤ ${c.value} 倍）`,pbMrq:`价格相对最近净资产不超过 ${c.value} 倍`,volatility20d:`近 20 个交易日价格波动率不超过 ${c.value}%`}[c.metric]}
function message(role,html){const a=document.createElement("article");a.className=`message ${role}-message`;a.innerHTML=role==="ai"?`<span class="message-avatar">AI</span><div class="bubble">${html}</div>`:`<div class="bubble">${html}</div><span class="message-avatar">你</span>`;$("#chatMessages").appendChild(a);a.scrollIntoView({behavior:"smooth",block:"nearest"})}
function restart(){conditions=[];results=[];topic=null;requested={growth:false,price:false,stability:false};resolved={growth:false,price:false,stability:false};$("#chatMessages").innerHTML='<article class="message ai-message"><span class="message-avatar">AI</span><div class="bubble"><p>你好。先不用考虑指标，请直接告诉我：<strong>你想找什么样的公司？</strong></p><p class="message-note">例如：“经营在变好、价格别太贵，最近走势稳一点。”</p></div></article>';$("#resultSection").classList.add("hidden");$("#chatInput").focus()}

function runScreen(){if(!dataset||!conditions.length)return;const applied=conditions.map(c=>({...c}));results=dataset.stocks.map(s=>evaluate(s,applied));const n=count(results);$("#passCount").textContent=n.pass;$("#failCount").textContent=n.fail;$("#unknownCount").textContent=n.unknown;$("#runMeta").textContent=`运行编号 ${shortId()} · 数据抓取 ${time(dataset.capturedAt)} · ${dataset.universe.name} · 全部条件同时满足`;$("#resultHeadline").textContent=n.pass?`找到 ${n.pass} 家符合全部条件的公司`:"这组条件下暂时没有符合的公司";$("#resultSubline").textContent=`检查 ${dataset.stocks.length} 家公司；${n.fail} 家至少一项未通过，${n.unknown} 家信息不足。`;reasonSummary();impact(results);previousRun={results:structuredClone(results)};activeTab=n.pass?"pass":n.fail?"fail":"unknown";switchTab(activeTab);$("#resultSection").classList.remove("hidden");$("#resultSection").scrollIntoView({behavior:"smooth"})}
function evaluate(stock,applied){const checks=applied.map(c=>{const actual=stock[c.metric];if(stock.error||actual==null||!Number.isFinite(Number(actual)))return{...c,status:"unknown",actual:null};return{...c,actual,status:(c.operator==="gte"?actual>=c.value:actual<=c.value)?"pass":"fail"}});const status=checks.some(c=>c.status==="fail")?"fail":checks.some(c=>c.status==="unknown")?"unknown":"pass";return{stock,checks,status}}
function count(items){return items.reduce((a,i)=>(a[i.status]++,a),{pass:0,fail:0,unknown:0})}
function switchTab(tab){activeTab=tab;$$("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));$("#activeTabLabel").textContent=`正在查看：${{pass:"符合条件",fail:"未通过",unknown:"信息不足"}[tab]}`;renderResults()}
function renderResults(){const q=$("#stockSearch").value.trim().toLowerCase(),list=results.filter(i=>i.status===activeTab&&(!q||(`${i.stock.name}${i.stock.code}`).toLowerCase().includes(q)));$("#resultList").innerHTML=list.length?list.map(i=>{const d=i.checks.filter(c=>c.status===(i.status==="pass"?"pass":i.status)).slice(0,3);return`<article class="stock-card"><div class="stock-name"><strong>${i.stock.name}</strong><small>${i.stock.code}.${i.stock.market}</small></div><button class="evidence-button" data-code="${i.stock.code}">查看数据依据</button><div class="plain-reason">${plain(d)}</div></article>`}).join(""):'<div class="empty">当前分类中没有匹配的公司。</div>';$$(".evidence-button").forEach(b=>b.addEventListener("click",()=>evidence(b.dataset.code)))}
function plain(checks){return checks.length?checks.map(c=>c.status==="unknown"?`${catalog[c.metric].label}暂时没有可验证数据`:`${catalog[c.metric].label}为 <b>${c.actual}${catalog[c.metric].unit}</b>，${c.status==="pass"?"符合":"没有达到"}你的要求`).join("；")+"。":"暂时没有可验证的数据。"}
function reasonSummary(){const f={};results.filter(i=>i.status==="fail").forEach(i=>i.checks.filter(c=>c.status==="fail").forEach(c=>f[c.metric]=(f[c.metric]||0)+1));const top=Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,3);$("#reasonSummary").innerHTML=top.length?`<strong>大家主要卡在哪里？</strong><div class="reason-bars">${top.map(([m,n])=>`<span>${catalog[m].label}：${n} 家未通过</span>`).join("")}</div>`:"<strong>没有明确的排除原因</strong>"}
function evidence(code){const i=results.find(x=>x.stock.code===code),s=i.stock,r=s.raw||{};$("#dialogContent").innerHTML=`<span class="eyebrow">数据依据</span><h2>${s.name} <small>${s.code}.${s.market}</small></h2><p class="dialog-lead">${plain(i.checks)}</p><table class="evidence-table"><thead><tr><th>共同确认的条件</th><th>实际数据</th><th>判定</th></tr></thead><tbody>${i.checks.map(c=>`<tr><td>${sentence(c)}</td><td>${c.actual==null?"不可验证":c.actual+catalog[c.metric].unit}</td><td>${{pass:"通过",fail:"未通过",unknown:"信息不足"}[c.status]}</td></tr>`).join("")}</tbody></table><h3>增长率怎么算？</h3><p>营收：本期 ${money(r.revenueGrowth?.latest)}，上年同期 ${money(r.revenueGrowth?.comparable)}；净利润：本期 ${money(r.profitGrowth?.latest)}，上年同期 ${money(r.profitGrowth?.comparable)}。</p><details class="audit-details"><summary>查看专业口径与请求追踪</summary><p>报告期：${s.reportDate||"未提供"} · 行情时间：${time(s.quoteTimestamp)} · 抓取时间：${time(dataset.capturedAt)}</p><p>来源：同花顺扶摇金融数据 API。请求追踪：行情 ${s.requestIds?.prices||"未提供"} · 估值 ${s.requestIds?.valuations||"未提供"} · 财务 ${s.requestIds?.financials||"未提供"} · 日线 ${s.requestIds?.history||"未提供"}</p></details><p><small>研究工具，不构成投资建议。缺失数据不推测补齐。</small></p>`;$("#evidenceDialog").showModal()}
function impact(current){if(!previousRun)return $("#impactPanel").classList.add("hidden");const before=new Map(previousRun.results.map(i=>[i.stock.code,i.status])),changed=current.filter(i=>before.get(i.stock.code)!==i.status);$("#impactPanel").innerHTML=`<strong>这次修改带来的影响</strong><p>${changed.length?changed.length+" 家公司的分类发生变化："+changed.slice(0,8).map(i=>i.stock.name).join("、"):"在同一批数据上，没有公司的分类发生变化。"}</p>`;$("#impactPanel").classList.remove("hidden")}
function findConflicts(){const a=[];Object.keys(catalog).forEach(m=>{const lo=conditions.filter(c=>c.metric===m&&c.operator==="gte").map(c=>c.value),hi=conditions.filter(c=>c.metric===m&&c.operator==="lte").map(c=>c.value);if(lo.length&&hi.length&&Math.max(...lo)>Math.min(...hi))a.push(catalog[m].label+"上下限冲突")});return a}
function saveStrategy(){localStorage.setItem("xuanguyouju:last-strategy",JSON.stringify({savedAt:new Date().toISOString(),conditions,capturedAt:dataset.capturedAt,summary:count(results)}));toast("策略和结果摘要已保存在当前浏览器")}
function time(v){return v?new Intl.DateTimeFormat("zh-CN",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Shanghai"}).format(new Date(v)):"未提供"}
function money(v){return v==null||!Number.isFinite(Number(v))?"不可验证":(Number(v)/1e8).toFixed(2)+" 亿元"}
function shortId(){return"RUN-"+Date.now().toString(36).toUpperCase().slice(-6)}
function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2400)}
function safe(t){const d=document.createElement("div");d.textContent=t;return d.innerHTML}
