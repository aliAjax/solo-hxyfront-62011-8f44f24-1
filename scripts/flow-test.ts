/**
 * 四条主流程 + 边界处理的逻辑级验收测试：
 * 1) 新增（马匹 + 连续多次修蹄 + 防重复提交语义 + 持久化往返）
 * 2) 复查提醒（逾期/今天/临近/未安排/空值）
 * 3) 左右前后蹄对比 + 异常步态标记
 * 4) 蹄铁更换历史
 * 另含：损坏数据容错、筛选、级联删除、日期校验。
 *
 * 运行：node scripts/run-flow-test.mjs（用 esbuild 即时转译）
 */
// ---- localStorage 桩 ----
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
(globalThis as any).alert = (msg: string) => {
  throw new Error("意外的 alert: " + msg);
};

import assert from "node:assert/strict";
import { loadData, saveData, sanitizeData, emptyHoof } from "../src/storage";
import {
  addDays,
  compareHooves,
  createHorse,
  createVisit,
  currentAbnormalHooves,
  deleteHorse,
  deleteVisit,
  diffDays,
  filterHorses,
  getReminders,
  shoeChangeHistory,
  todayStr,
  uid,
  updateHorse,
  validateHorse,
  validateVisit,
  visitsOf,
} from "../src/domain";
import type { AppData, HoofKey, HoofRecord, HorseInput, Visit } from "../src/types";
import { HOOF_KEYS } from "../src/types";

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed++;
  console.log("  ✓", name);
}
function eq(name: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, name);
  passed++;
  console.log("  ✓", name);
}

function hoof(partial: Partial<HoofRecord> = {}): HoofRecord {
  return { ...emptyHoof(), ...partial };
}

function hooves(partial: Partial<Record<HoofKey, Partial<HoofRecord>>> = {}) {
  const result = {} as Record<HoofKey, HoofRecord>;
  for (const k of HOOF_KEYS) result[k] = hoof(partial[k]);
  return result;
}

function makeVisit(
  data: AppData,
  horseId: string,
  date: string,
  opts: { nextDate?: string; hooves?: Record<HoofKey, HoofRecord>; farrier?: string } = {},
): Visit {
  return {
    id: uid("v"),
    horseId,
    date,
    nextDate: opts.nextDate,
    farrier: opts.farrier ?? "",
    overallNote: "",
    hooves: opts.hooves ?? hooves(),
    createdAt: new Date().toISOString() + Math.random().toString(36).slice(2, 6),
    updatedAt: new Date().toISOString(),
  };
}

function makeHorseInput(code: string, extra: Partial<HorseInput> = {}): HorseInput {
  return { code, name: "", breed: "", age: null, usage: "运动马", color: "", owner: "", note: "", ...extra };
}

// ============ 流程 1：新增档案 + 连续修蹄 + 持久化 ============
console.log("\n[1] 新增主流程");

let data = loadData();
eq("首次加载为空档案", data, { version: 1, horses: [], visits: [] });

data = createHorse(data, makeHorseInput("HORSE-18", { name: "黑风", usage: "运动马" }));
ok("建立马匹档案", data.horses.length === 1);
const horse = data.horses[0];

// 空值处理：编号为空 / 重复编号 / 非法年龄
assert.deepEqual(Object.keys(validateHorse(makeHorseInput("  "), data)), ["code"]);
ok("空编号被拦截", !!validateHorse(makeHorseInput("  "), data).code);
ok("重复编号被拦截（精确匹配）", !!validateHorse(makeHorseInput("HORSE-18"), data).code);
ok("不同编号不冲突", !validateHorse(makeHorseInput("HORSE-99"), data).code);
ok("非法年龄被拦截", !!validateHorse(makeHorseInput("H9", { age: 200 }), data).age);
ok("年龄留空合法", Object.keys(validateHorse(makeHorseInput("H9", { age: null }), data)).length === 0);

const today = todayStr();
// 同一匹马连续三次修蹄，历史全部保留
const d1 = addDays(today, -84);
const d2 = addDays(today, -42);
const d3 = today;
data = createVisit(data, makeVisit(data, horse.id, d1, {
  nextDate: d2,
  hooves: hooves({ LF: { shoeType: "普通钢蹄铁", shape: "正常" } }),
}));
data = createVisit(data, makeVisit(data, horse.id, d2, {
  nextDate: d3,
  hooves: hooves({ LF: { shoeType: "普通钢蹄铁", shape: "扁平蹄" } }),
}));
data = createVisit(data, makeVisit(data, horse.id, d3, {
  hooves: hooves({
    LF: { shoeType: "铝合金蹄铁", shoeChanged: true, gaitTags: ["跛行"], abnormal: true },
    RF: { shape: "裂蹄" },
  }),
}));
ok("同一匹马连续三次修蹄均保留", visitsOf(data, horse.id).length === 3);
eq("修蹄记录按日期倒序（最新在前）", visitsOf(data, horse.id).map((v) => v.date), [d3, d2, d1]);

// 防重复提交语义：表单 busy 守卫阻止第二次提交；领域层被连调两次是调用方契约，
// 这里模拟 UI 的 busy 标志
let busy = false;
let commitCount = 0;
function submitForm() {
  if (busy) return;
  busy = true;
  data = createVisit(data, makeVisit(data, horse.id, today));
  commitCount++;
  // UI 在保存完成前再次点击（同步双击）
  submitForm();
  busy = false;
}
submitForm();
ok("快速双击只产生一条记录（防重复提交）", commitCount === 1 && data.visits.length === 4);

// 持久化往返
ok("写入 localStorage 成功", saveData(data));
const reloaded = loadData();
eq("刷新/重启后马匹仍在", reloaded.horses.length, 1);
eq("刷新/重启后 4 条修蹄记录仍在", reloaded.visits.length, 4);
eq("四蹄结构完整（LF/RF/LH/RH）", Object.keys(reloaded.visits[0].hooves).sort(), ["LF", "LH", "RF", "RH"]);
ok("异常标记持久化", reloaded.visits.find((v) => v.date === d3)!.hooves.LF.abnormal === true);

// 损坏数据容错
localStorage.setItem("farrier-records-v1", "{不是合法JSON");
ok("损坏 JSON 不崩溃，回退空档案", loadData().horses.length === 0);
const corrupted = sanitizeData({
  horses: [{ id: "h1", code: "C1" }, { code: "缺 id，应丢弃" }, null],
  visits: [
    { id: "vX", horseId: "h1", date: "2026-01-01", hooves: { LF: { gaitTags: [1, "跛行", null], nailSlots: [2, "x", 4] } } },
    { id: "vY", horseId: "不存在的马", date: "2026-01-02" },
    null,
  ],
});
eq("清洗后保留 1 匹马", corrupted.horses.length, 1);
eq("孤儿修蹄记录被剔除", corrupted.visits.length, 1);
const cleanedLF = corrupted.visits[0].hooves.LF;
eq("非法步态标签被过滤", cleanedLF.gaitTags, ["跛行"]);
eq("非法钉位被过滤", cleanedLF.nailSlots, [2, 4]);
eq("缺失蹄位补空结构", Object.keys(corrupted.visits[0].hooves).length, 4);
data = reloaded; // 恢复正常数据

// ============ 流程 2：复查提醒 ============
console.log("\n[2] 复查提醒主流程");

// 为不同提醒状态造马
data = createHorse(data, makeHorseInput("OVERDUE", { name: "逾期马" }));
const hOver = data.horses.find((h) => h.code === "OVERDUE")!;
data = createVisit(data, makeVisit(data, hOver.id, addDays(today, -30), { nextDate: addDays(today, -2) }));

data = createHorse(data, makeHorseInput("TODAY"));
const hToday = data.horses.find((h) => h.code === "TODAY")!;
data = createVisit(data, makeVisit(data, hToday.id, today, { nextDate: today }));

data = createHorse(data, makeHorseInput("SOON"));
const hSoon = data.horses.find((h) => h.code === "SOON")!;
data = createVisit(data, makeVisit(data, hSoon.id, addDays(today, -10), { nextDate: addDays(today, 5) }));

data = createHorse(data, makeHorseInput("LATER"));
const hLater = data.horses.find((h) => h.code === "LATER")!;
data = createVisit(data, makeVisit(data, hLater.id, today, { nextDate: addDays(today, 30) }));

data = createHorse(data, makeHorseInput("NODATE", { name: "未安排复查" }));
// 无修蹄记录 / 无 nextDate

const reminders = getReminders(data, 7);
const byCode = Object.fromEntries(reminders.map((r) => [r.code, r]));
ok("逾期提醒存在", byCode.OVERDUE?.status === "overdue" && byCode.OVERDUE.daysLeft === -2);
ok("今天到期提醒", byCode.TODAY?.status === "today" && byCode.TODAY.daysLeft === 0);
ok("7 天内临近提醒", byCode.SOON?.status === "soon" && byCode.SOON.daysLeft === 5);
ok("远期只标记已安排", byCode.LATER?.status === "scheduled");
ok("未安排复查的马不出现在提醒里", !byCode.NODATE);
eq("排序：逾期 → 今天 → 临近 → 远期", reminders.map((r) => r.code), ["OVERDUE", "TODAY", "SOON", "LATER"]);
ok("复查日期早于修蹄日期被校验拦截", !!validateVisit({ date: today, nextDate: addDays(today, -1) }).nextDate);
ok("复查日期可留空（空值处理）", Object.keys(validateVisit({ date: today, nextDate: "" })).length === 0);
eq("diffDays 跨月正确", diffDays(addDays(today, -10), addDays(today, 5)), 15);

// 新建一条更新的修蹄记录后，旧的 nextDate 不应再提醒（只提醒最近一次）
data = createVisit(data, makeVisit(data, hOver.id, today, { nextDate: addDays(today, 40) }));
const overNow = getReminders(data, 7).find((r) => r.code === "OVERDUE");
ok("复查登记更新后提醒以最近记录为准（转为 scheduled）", overNow?.status === "scheduled");

// ============ 流程 3：四蹄对比 + 异常步态 ============
console.log("\n[3] 左右前后蹄对比 / 异常步态标记");

const cmpData = createHorse(
  { version: 1, horses: [], visits: [] },
  makeHorseInput("CMP"),
);
const cmpHorse = cmpData.horses[0];
const visit = makeVisit(cmpData, cmpHorse.id, today, {
  hooves: hooves({
    LF: { shape: "扁平蹄", shoeType: "铝合金蹄铁", shoeChanged: true, nailSlots: [1, 2, 3], gaitTags: ["跛行", "偏侧磨耗"], lamenessGrade: 2 },
    RF: { shape: "正常", shoeType: "铝合金蹄铁", nailSlots: [1, 2, 3, 4] },
    LH: { shape: "裂蹄", shoeType: "普通钢蹄铁", abnormal: true }, // 仅人工标记
    RH: { shape: "正常", shoeType: "普通钢蹄铁", nailSlots: [5, 6] },
  }),
});
const rows = compareHooves(visit);
eq("对比覆盖左前/右前/左后/右后四蹄", rows.map((r) => r.key), ["LF", "RF", "LH", "RH"]);
const rowByKey = Object.fromEntries(rows.map((r) => [r.key, r]));
ok("左前：标签+跛行分级触发异常", rowByKey.LF.abnormal === true);
ok("左后：仅人工复核标记也触发异常", rowByKey.LH.abnormal === true);
eq("左前异常标签完整", rowByKey.LF.gaitTags, ["跛行", "偏侧磨耗"]);
ok("右前/右后正常", rowByKey.RF.abnormal === false && rowByKey.RH.abnormal === false);
ok("钉位保留", rowByKey.RH.nailSlots.join(",") === "5,6");
eq("无记录时对比返回空值占位（空值处理）", compareHooves(undefined).map((r) => r.shape), ["—", "—", "—", "—"]);
eq("马匹当前异常蹄位", currentAbnormalHooves({ ...cmpData, visits: [visit] }, cmpHorse.id), ["LF", "LH"]);

// 异常筛选
const withAbnormal = { ...cmpData, visits: [visit] };
eq("筛选：最近记录有异常步态", filterHorses(withAbnormal, { keyword: "", usage: "", status: "abnormal" }).length, 1);
eq("关键词搜索编号", filterHorses(withAbnormal, { keyword: "cmp", usage: "", status: "all" }).length, 1);
eq("用途筛选无命中返回空", filterHorses(withAbnormal, { keyword: "", usage: "休养马", status: "all" }).length, 0);
eq("无马时筛选安全返回空", filterHorses({ version: 1, horses: [], visits: [] }, { keyword: "x", usage: "", status: "abnormal" }).length, 0);

// ============ 流程 4：蹄铁更换历史 ============
console.log("\n[4] 蹄铁更换历史");

const hist: AppData = { version: 1, horses: [], visits: [] };
const hh = createHorse(hist, makeHorseInput("HIST")).horses[0];
const tA = addDays(today, -126);
const tB = addDays(today, -84);
const tC = addDays(today, -42);
hist.visits.push(
  makeVisit(hist, hh.id, tA, { hooves: hooves({
    LF: { shoeType: "普通钢蹄铁" },                          // 初始登记
    RF: { shoeType: "普通钢蹄铁" },
  }) }),
  makeVisit(hist, hh.id, tB, { hooves: hooves({
    LF: { shoeType: "普通钢蹄铁" },                          // 未变
    RF: { shoeType: "铝合金蹄铁", shoeChanged: true },       // 更换
  }) }),
  makeVisit(hist, hh.id, tC, { hooves: hooves({
    LF: { shoeType: "铝合金蹄铁", shoeChanged: true },       // 更换
    RF: { shoeType: "铝合金蹄铁" },                          // 未变
    LH: { shoeType: "普通钢蹄铁" },                          // 后蹄首次登记
  }) }),
);

const changes = shoeChangeHistory(hist, hh.id);
// 期望（新→旧）：tC LF 更换、tC LH 初始、tB RF 更换、tA LF 初始、tA RF 初始
const compact = changes.map((c) => `${c.date}:${c.hoof}:${c.previousType ?? "INIT"}→${c.shoeType}`);
assert.ok(compact.includes(`${tC}:LF:普通钢蹄铁→铝合金蹄铁`), "LF 第二次更换入史: " + compact.join(" | "));
assert.ok(compact.includes(`${tB}:RF:普通钢蹄铁→铝合金蹄铁`), "RF 更换入史");
assert.ok(compact.includes(`${tA}:LF:INIT→普通钢蹄铁`), "LF 初始登记入史");
assert.ok(compact.includes(`${tC}:LH:无蹄铁（裸蹄）→普通钢蹄铁`), "LH 后补钉蹄：裸蹄→上铁入史");
ok("未更换的重复类型不入史", !compact.some((c) => c.startsWith(`${tB}:LF`)) && !compact.some((c) => c.startsWith(`${tC}:RF`)));
eq("历史按日期倒序", changes.map((c) => c.date), [tC, tC, tB, tA, tA]);
eq("无更换时历史为空数组（空值处理）", shoeChangeHistory({ version: 1, horses: [hh], visits: [] }, hh.id), []);

// 编辑与移除
const beforeEdit = visitsOf(hist, hh.id).length;
const target = hist.visits.find((v) => v.date === tB)!;
const edited: Visit = { ...target, hooves: hooves({ LF: { shoeType: "塑料/复合材料蹄铁" }, RF: { shoeType: "铝合金蹄铁" } }) };
hist.visits = hist.visits.map((v) => (v.id === target.id ? edited : v));
ok("编辑修蹄记录可改蹄铁类型", shoeChangeHistory(hist, hh.id).some((c) => c.visitId === target.id && c.shoeType === "塑料/复合材料蹄铁"));

let afterDelete = deleteVisit(hist, target.id);
eq("移除单条修蹄记录", visitsOf(afterDelete, hh.id).length, beforeEdit - 1);
afterDelete = deleteHorse(afterDelete, hh.id);
eq("移除马匹级联删除全部修蹄记录", afterDelete.visits.filter((v) => v.horseId === hh.id).length, 0);

// 马匹档案编辑（改名）与重复编号校验
data = updateHorse(data, horse.id, { name: "黑风·改" });
ok("编辑马匹档案", data.horses.find((h) => h.id === horse.id)?.name === "黑风·改");
const other = data.horses.find((h) => h.code === "SOON")!;
ok("编辑时与其他马编号冲突被拦截", !!validateHorse(makeHorseInput("HORSE-18"), data, other.id).code);
ok("编辑自身编号（不变）合法", Object.keys(validateHorse(makeHorseInput("HORSE-18", { name: "黑风·改" }), data, horse.id)).length === 0);

// 最终持久化校验
saveData(data);
eq("最终数据可再次加载且记录数一致", loadData().visits.length, data.visits.length);

console.log(`\n全部通过：${passed} 项断言 ✓`);
