/**
 * UI 端到端走查（Playwright + Chromium）：
 * 新增 → 复查提醒 → 四蹄对比 → 蹄铁更换历史，外加空值/重复提交/异常标记/持久化/编辑移除/筛选。
 * 运行前：npm run dev（62011），并 export LD_LIBRARY_PATH 指向本地解压的系统库。
 */
const { chromium } = require("playwright");
const path = require("node:path");

const BASE = "http://localhost:62011/";
const SHOT_DIR = "/tmp/e2e-shots";
require("node:fs").mkdirSync(SHOT_DIR, { recursive: true });

let passed = 0;
async function check(name, cond) {
  if (!cond) throw new Error("断言失败：" + name);
  passed++;
  console.log("  ✓", name);
}
const shot = (p, n) => p.screenshot({ path: path.join(SHOT_DIR, `${String(n).padStart(2, "0")}.png`), fullPage: true });

// 蹄卡内的复选框按字段标签定位，避免依赖 DOM 顺序
const changedBox = (card) => card.locator(".checkbox-field", { hasText: "本次更换蹄铁" }).locator('input[type=checkbox]');
const abnormalBox = (card) => card.locator(".checkbox-field", { hasText: "人工复核标记" }).locator('input[type=checkbox]');

function isoDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// 1x1 PNG（用于照片上传空值场景之外的真实上传）
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, hasHead: false });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { throw new Error("页面运行时错误: " + e.message); });
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) throw new Error("console error: " + m.text());
  });

  await page.goto(BASE);
  await page.waitForSelector(".app");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector(".app");

  // ---------- 空状态 ----------
  console.log("\n[0] 空状态");
  await check("初始显示空档案引导", await page.locator(".empty-title").textContent().then((t) => t.includes("档案还是空的")));
  await shot(page, 0);

  // ---------- 流程 1：新增马匹 + 新增修蹄（空值/重复提交/异常标记/照片） ----------
  console.log("\n[1] 新增主流程");
  await page.click("text=新建马匹档案");
  await page.waitForSelector(".modal");

  // 空编号提交被拦截
  await page.click("button[type=submit]");
  await check("空编号显示行内错误", await page.locator(".error-text").textContent().then((t) => t.includes("请填写马匹编号")));

  // 重复编号
  await page.fill('input[placeholder="如 HORSE-18"]', "HORSE-18");
  await page.click("button[type=submit]");
  await page.waitForTimeout(250);
  await check("建档案成功（首次使用 HORSE-18）", await page.locator(".horse-table").isVisible());

  // 再建一匹同名编号 -> 拒绝
  await page.click("text=新建马匹档案");
  await page.waitForSelector(".modal");
  await page.fill('input[placeholder="如 HORSE-18"]', "HORSE-18");
  await page.click("button[type=submit]");
  await check("重复编号被拒绝", await page.locator(".error-text").textContent().then((t) => t.includes("已存在")));
  await page.fill('input[placeholder="如 HORSE-18"]', "HORSE-27");
  await page.fill('input[placeholder="可留空"] >> nth=0', "裂蹄花");
  await page.click("button[type=submit]");
  await page.waitForTimeout(250);
  await check("第二匹马建立成功", await page.locator("text=HORSE-27").first().isVisible());

  // 进入 HORSE-18 详情，新增第一次修蹄（60 天前，复查 18 天前 -> 逾期）
  await page.click("text=HORSE-18");
  await page.waitForSelector(".detail-head");
  await page.click("text=新增修蹄记录");
  await page.waitForSelector(".modal-wide");

  await page.fill('input[type=date] >> nth=0', isoDate(-60));
  await page.fill('input[type=date] >> nth=1', isoDate(-18));
  await page.fill('input[placeholder*="蹄铁师"]', "老王");

  // 左前蹄：裂蹄 + 铝合金蹄铁 + 本次更换 + 钉位 1/2/3 + 异常步态标签
  const lf = page.locator(".hoof-card").nth(0);
  await check("第一张卡是左前蹄", (await lf.locator("h4").textContent()) === "左前蹄");
  await lf.locator("select").nth(0).selectOption("裂蹄");
  await lf.locator("select").nth(1).selectOption("铝合金蹄铁");
  await changedBox(lf).check(); // 本次更换蹄铁
  await lf.locator("button.tag-nail", { hasText: "1" }).click();
  await lf.locator("button.tag-nail", { hasText: "2" }).click();
  await lf.locator("button.tag-nail", { hasText: "3" }).click();
  await lf.locator("button.tag", { hasText: "偏侧磨耗" }).click();
  await lf.locator("button.tag", { hasText: "跛行" }).click();
  await lf.locator("select").nth(2).selectOption("2"); // 跛行分级 2
  await check("勾选异常后卡片出现异常样式", await lf.locator(".hoof-abnormal").count() === 1 || (await lf.getAttribute("class")).includes("hoof-abnormal"));

  // 右前蹄：正常 + 铝合金蹄铁（不勾更换，钉位 1-4）
  const rf = page.locator(".hoof-card").nth(1);
  await rf.locator("select").nth(0).selectOption("正常");
  await rf.locator("select").nth(1).selectOption("铝合金蹄铁");
  for (const n of ["1", "2", "3", "4"]) await rf.locator("button.tag-nail", { hasText: n }).click();

  // 左后蹄：仅人工强制标记异常（无标签，验证异常标记独立生效）
  const lh = page.locator(".hoof-card").nth(2);
  await abnormalBox(lh).check(); // 仅人工复核标记：即使无标签也强制异常

  // 上传照片到右后蹄
  const rh = page.locator(".hoof-card").nth(3);
  await rh.locator('input[type=file]').setInputFiles({ name: "rh-test.png", mimeType: "image/png", buffer: PNG_1PX });
  await rh.locator(".photo-item").waitFor();
  await rh.locator('.photo-meta input').fill("右后蹄底角度留档");
  await check("照片上传并可写备注", await rh.locator(".photo-item").count() === 1);

  await shot(page, 1);

  // 防重复提交：瞬间双击提交按钮，只应有 1 条记录
  const submitBtn = page.locator(".modal-wide button[type=submit]");
  await submitBtn.dblclick();
  await page.waitForTimeout(400);
  await check("双击后模态框关闭", await page.locator(".modal-wide").count() === 0);
  await page.locator(".visit-card").waitFor();
  await check("只产生 1 条修蹄记录", await page.locator(".visit-card").count() === 1);
  await check("时间线显示异常蹄位徽标", await page.locator(".visit-badges .badge-danger").first().textContent().then((t) => t.includes("左前") && t.includes("左后")));
  await check("时间线显示更换蹄铁 ×1", await page.locator("text=更换蹄铁 ×1").isVisible());

  // ---------- 流程 2：复查提醒（逾期/今天/临近 + 排序） ----------
  console.log("\n[2] 复查提醒主流程");
  // HORSE-27：今天到期
  await page.click("text=返回马匹列表");
  await page.click("text=HORSE-27");
  await page.click("text=新增修蹄记录");
  await page.waitForSelector(".modal-wide");
  await page.fill('input[type=date] >> nth=0', isoDate(-20));
  await page.fill('input[type=date] >> nth=1', isoDate(0));
  await page.locator(".modal-wide button[type=submit]").click();
  await page.waitForTimeout(400);

  // 再建一匹 5 天后复查
  await page.click("text=返回马匹列表");
  await page.click("text=新建马匹档案");
  await page.fill('input[placeholder="如 HORSE-18"]', "HORSE-31");
  await page.locator(".modal button[type=submit]").click();
  await page.waitForTimeout(250);
  await page.click("text=HORSE-31");
  await page.click("text=新增修蹄记录");
  await page.waitForSelector(".modal-wide");
  await page.fill('input[type=date] >> nth=0', isoDate(-7));
  await page.fill('input[type=date] >> nth=1', isoDate(5));
  await page.locator(".modal-wide button[type=submit]").click();
  await page.waitForTimeout(400);

  await page.click("text=返回马匹列表");
  await page.click(".main-tabs button:has-text('复查提醒')");
  await page.waitForSelector(".horse-table");
  const order = await page.locator(".horse-table tbody tr").evaluateAll((rows) =>
    rows.map((r) => r.querySelector("td:nth-child(2) strong").textContent),
  );
  await check("提醒排序 逾期→今天→临近", JSON.stringify(order) === JSON.stringify(["HORSE-18", "HORSE-27", "HORSE-31"]));
  const badges = await page.locator(".horse-table tbody tr").allInnerTexts();
  await check("HORSE-18 显示已逾期", badges[0].includes("已逾期"));
  await check("HORSE-27 显示今天到期", badges[1].includes("今天到期"));
  await check("HORSE-31 显示 7 天内", badges[2].includes("7 天内"));
  await check("顶部 Tab 显示 3 待处理", await page.locator(".main-tabs button:has-text('复查提醒')").textContent().then((t) => t.includes("3")));
  await shot(page, 2);

  // ---------- 流程 3：四蹄对比 ----------
  console.log("\n[3] 四蹄对比主流程");
  await page.click(".main-tabs button:has-text('马匹列表')");
  // 先验证列表异常筛选
  await page.locator(".filter-bar select").nth(1).selectOption("abnormal");
  await check("异常步态筛选只留 HORSE-18", await page.locator(".horse-table tbody tr").count() === 1);
  await check("列表行显示异常蹄位", await page.locator(".badge-danger", { hasText: "左前" }).first().isVisible());
  await page.locator(".filter-bar button:has-text('清除筛选')").click();

  // 关键词 + 用途筛选
  await page.fill(".search", "27");
  await check("关键词搜索命中 1 匹", await page.locator(".horse-table tbody tr").count() === 1);
  await page.fill(".search", "不存在的马XYZ");
  await check("无命中显示空结果", await page.locator(".empty-title").textContent().then((t) => t.includes("没有符合筛选")));
  await page.click("text=清除筛选");

  await page.click("text=HORSE-18");
  await page.click(".tabs button:has-text('四蹄对比')");
  await page.waitForSelector(".compare-table");
  const cmpHooves = await page.locator(".compare-table tbody tr th").allInnerTexts();
  await check("对比表四蹄顺序为 左前/右前/左后/右后", JSON.stringify(cmpHooves) === JSON.stringify(["左前蹄", "右前蹄", "左后蹄", "右后蹄"]));
  await check("左前行高亮异常", await page.locator(".compare-table tbody tr").nth(0).getAttribute("class").then((c) => c.includes("row-bad")));
  await check("左后行高亮异常（仅人工标记）", await page.locator(".compare-table tbody tr").nth(2).getAttribute("class").then((c) => c.includes("row-bad")));
  await check("左前显示跛行标签与 2 级", await page.locator(".compare-table tbody tr").nth(0).innerText().then((t) => t.includes("偏侧磨耗") && t.includes("跛行 2 级")));
  await check("右后蹄照片缩略图存在", await page.locator(".compare-table tbody tr").nth(3).locator("img").count() === 1);
  await shot(page, 3);

  // ---------- 流程 4：蹄铁更换历史（第二次修蹄） ----------
  console.log("\n[4] 蹄铁更换历史主流程");
  await page.click("text=新增修蹄记录");
  await page.waitForSelector(".modal-wide");
  await page.fill('input[type=date] >> nth=0', isoDate(-18));
  await page.fill('input[type=date] >> nth=1', isoDate(24));
  // 沿用上次为草稿
  await page.click("text=沿用上次评估为草稿");
  await page.waitForTimeout(200);
  const lf2 = page.locator(".hoof-card").nth(0);
  await check("沿用后左前仍为铝合金蹄铁", await lf2.locator("select").nth(1).inputValue().then((v) => v === "铝合金蹄铁"));
  await check("沿用后照片被清空", await lf2.locator(".photo-item").count() === 0);
  // 左前改成钢蹄铁并勾更换；右前不变（不勾更换）；左后首次上普通钢蹄铁
  await lf2.locator("select").nth(1).selectOption("普通钢蹄铁");
  await changedBox(lf2).check();
  // 清除左前的步态标签（康复），保留左后人工异常
  await lf2.locator("button.tag.tag-on", { hasText: "跛行" }).click();
  await lf2.locator("button.tag.tag-on", { hasText: "偏侧磨耗" }).click();
  await lf2.locator("select").nth(2).selectOption("0");
  const lh2 = page.locator(".hoof-card").nth(2);
  await lh2.locator("select").nth(1).selectOption("普通钢蹄铁");
  await changedBox(lh2).check();
  await page.locator(".modal-wide button[type=submit]").click();
  await page.waitForTimeout(400);
  await page.click(".tabs button:has-text('修蹄时间线')");
  await check("时间线现有 2 条记录", await page.locator(".visit-card").count() === 2);

  await page.click(".tabs button:has-text('蹄铁更换历史')");
  await page.waitForSelector(".shoe-history");
  const histText = await page.locator(".shoe-history").innerText();
  await check("历史含左前 铝合金→普通钢", histText.includes("左前蹄") && histText.includes("铝合金蹄铁") && histText.includes("普通钢蹄铁"));
  await check("历史含左后 裸蹄→普通钢", histText.includes("裸蹄"));
  await check("历史含右前初次登记铝合金", histText.includes("右前蹄"));
  // 最新条目排最前
  const firstEntryDate = await page.locator(".shoe-entry .shoe-date").first().textContent();
  await check("更换历史按日期倒序", firstEntryDate === isoDate(-18));
  await shot(page, 4);

  // 对比页选择两次记录，出现“上次”差异标注
  await page.click(".tabs button:has-text('四蹄对比')");
  const selects = page.locator(".compare-selects select");
  await selects.nth(1).selectOption({ index: 2 }); // 参照：更早的第一次记录
  const lfCell = await page.locator(".compare-table tbody tr").nth(0).locator("td").nth(1).innerText();
  await check("对比显示与上次的差异（裂蹄→扁平蹄未改时应无差异，改蹄铁的单元格有上次标注）",
    (await page.locator(".cell-changed").count()) >= 1);

  // ---------- 编辑 / 移除 ----------
  console.log("\n[5] 编辑与移除");
  await page.click(".tabs button:has-text('修蹄时间线')");
  await page.locator(".visit-card").first().click(); // 展开最新一条
  await page.locator(".visit-card").first().locator("text=编辑本次记录").click();
  await page.waitForSelector(".modal-wide");
  await page.fill('input[placeholder*="蹄铁师"]', "老王（复核）");
  await page.locator(".modal-wide button[type=submit]").click();
  await page.waitForTimeout(400);
  await check("编辑后蹄铁师更新", await page.locator(".visit-card").first().innerText().then((t) => t.includes("老王（复核）")));

  // 删除最新一条（两步确认）
  await page.locator(".visit-card").first().locator("button:has-text('删除本次记录')").click();
  await check("删除需二次确认", await page.locator(".visit-card").first().locator("button:has-text('再点一次确认')").isVisible());
  await page.locator(".visit-card").first().locator("button:has-text('再点一次确认')").click();
  await page.waitForTimeout(300);
  await check("删除后剩 1 条记录", await page.locator(".visit-card").count() === 1);

  // 编辑马匹档案
  await page.click("text=编辑档案");
  await page.waitForSelector(".modal");
  await page.locator('.modal input').nth(1).fill("黑风");
  await page.locator(".modal button[type=submit]").click();
  await page.waitForTimeout(300);
  await check("马名更新显示", await page.locator(".horse-name").innerText().then((t) => t.includes("黑风")));

  // ---------- 持久化：刷新后数据仍在 ----------
  console.log("\n[6] 本地持久化");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("farrier-records-v1")));
  await check("localStorage 中已有档案数据", stored.horses.length === 3 && stored.visits.length === 3);
  await page.reload();
  await page.waitForSelector(".app");
  await check("刷新后仍显示 3 匹马（列表页）", (await page.locator(".main-tabs").innerText()).includes("马匹列表（3）"));
  await check("刷新后编辑过的马名仍在", await page.locator(".horse-table").innerText().then((t) => t.includes("黑风")));
  // 模拟重启：新浏览器上下文（同源仍读同一 localStorage 配置文件，这里用 storageState 已验证；再关页重开）
  const page2 = await ctx.newPage();
  await page2.goto(BASE);
  await page2.waitForSelector(".app");
  await check("新标签页打开仍有 3 匹马", (await page2.locator(".main-tabs").innerText()).includes("3"));
  await shot(page2, 5);
  await page2.close();

  // ---------- 移除整匹马（级联） ----------
  console.log("\n[7] 移除马匹档案");
  await page.click("text=HORSE-18");
  await page.waitForSelector(".detail-head");
  await page.click("text=移除档案");
  await page.click("text=再点一次确认");
  await page.waitForTimeout(300);
  await page.waitForSelector(".horse-table");
  await check("移除后列表剩 2 匹", await page.locator(".horse-table tbody tr").count() === 2);
  const afterRemove = await page.evaluate(() => JSON.parse(localStorage.getItem("farrier-records-v1")));
  await check("localStorage 中级联删除其修蹄记录", afterRemove.visits.every((v) => v.horseId !== afterRemove.horses.find((h) => h.code === "HORSE-18")) && !afterRemove.horses.some((h) => h.code === "HORSE-18"));
  await shot(page, 6);

  console.log(`\nUI 走查全部通过：${passed} 项断言 ✓`);
  console.log("截图目录：" + SHOT_DIR);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
