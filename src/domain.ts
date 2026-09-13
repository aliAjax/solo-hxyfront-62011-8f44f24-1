import type { AppData, HoofKey, Horse, Visit } from "./types";
import { HOOF_KEYS, HOOF_LABEL } from "./types";
import { emptyHoof, sanitizeData } from "./storage";

// ---------- 基础工具 ----------

export function uid(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/** 本地时区安全的 YYYY-MM-DD（toISOString 在 UTC 会差一天） */
export function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return toDateInput(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toDateInput(dt);
}

/** 两个日期相差的天数（b - a，按本地日历） */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = new Date(ay, am - 1, ad).getTime();
  const db = new Date(by, bm - 1, bd).getTime();
  return Math.round((db - da) / 86_400_000);
}

// ---------- 校验 ----------

export interface HorseInput {
  code: string;
  name: string;
  breed?: string;
  age: number | null;
  usage: Horse["usage"];
  color?: string;
  owner?: string;
  note?: string;
}

export type FieldErrors = Record<string, string>;

export function validateHorse(input: HorseInput, data: AppData, exceptId?: string): FieldErrors {
  const errors: FieldErrors = {};
  const code = input.code.trim();
  if (!code) errors.code = "请填写马匹编号";
  else if (data.horses.some((h) => h.code === code && h.id !== exceptId)) {
    errors.code = "该编号已存在，请更换";
  }
  if (input.age !== null && (input.age < 0 || input.age > 60)) {
    errors.age = "年龄应在 0–60 之间";
  }
  return errors;
}

export function validateVisit(visit: Pick<Visit, "date" | "nextDate">): FieldErrors {
  const errors: FieldErrors = {};
  if (!visit.date) errors.date = "请选择修蹄日期";
  if (visit.nextDate && visit.date && visit.nextDate < visit.date) {
    errors.nextDate = "复查日期不能早于修蹄日期";
  }
  return errors;
}

// ---------- 马匹 / 修蹄记录 CRUD ----------

export function createHorse(data: AppData, input: HorseInput): AppData {
  const now = new Date().toISOString();
  const horse: Horse = {
    id: uid("h"),
    code: input.code.trim(),
    name: input.name.trim(),
    breed: input.breed?.trim() || "",
    age: input.age,
    usage: input.usage,
    color: input.color?.trim() || "",
    owner: input.owner?.trim() || "",
    note: input.note?.trim() || "",
    createdAt: now,
    updatedAt: now,
  };
  return { ...data, horses: [...data.horses, horse] };
}

export function updateHorse(data: AppData, id: string, patch: Partial<HorseInput>): AppData {
  return {
    ...data,
    horses: data.horses.map((h) =>
      h.id === id
        ? {
            ...h,
            ...("code" in patch ? { code: (patch.code ?? "").trim() } : {}),
            ...("name" in patch ? { name: (patch.name ?? "").trim() } : {}),
            ...("breed" in patch ? { breed: patch.breed?.trim() || "" } : {}),
            ...("age" in patch ? { age: patch.age ?? null } : {}),
            ...("usage" in patch ? { usage: patch.usage ?? "" } : {}),
            ...("color" in patch ? { color: patch.color?.trim() || "" } : {}),
            ...("owner" in patch ? { owner: patch.owner?.trim() || "" } : {}),
            ...("note" in patch ? { note: patch.note?.trim() || "" } : {}),
            updatedAt: new Date().toISOString(),
          }
        : h,
    ),
  };
}

/** 移除马匹会级联删除其全部修蹄记录 */
export function deleteHorse(data: AppData, id: string): AppData {
  return {
    ...data,
    horses: data.horses.filter((h) => h.id !== id),
    visits: data.visits.filter((v) => v.horseId !== id),
  };
}

export function visitsOf(data: AppData, horseId: string): Visit[] {
  return data.visits
    .filter((v) => v.horseId === horseId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt.localeCompare(a.createdAt)));
}

export function latestVisit(data: AppData, horseId: string): Visit | undefined {
  return visitsOf(data, horseId)[0];
}

export function createVisit(data: AppData, visit: Visit): AppData {
  return { ...data, visits: [...data.visits, visit] };
}

export function updateVisit(data: AppData, visit: Visit): AppData {
  return {
    ...data,
    visits: data.visits.map((v) =>
      v.id === visit.id ? { ...visit, updatedAt: new Date().toISOString() } : v,
    ),
  };
}

export function deleteVisit(data: AppData, visitId: string): AppData {
  return { ...data, visits: data.visits.filter((v) => v.id !== visitId) };
}

// ---------- 异常步态 ----------

export function hoofIsAbnormal(visit: Visit, key: HoofKey): boolean {
  const h = visit.hooves[key];
  return h.abnormal || h.gaitTags.length > 0 || (h.lamenessGrade ?? 0) > 0;
}

export function visitAbnormalHooves(visit: Visit): HoofKey[] {
  return HOOF_KEYS.filter((k) => hoofIsAbnormal(visit, k));
}

/** 马匹最近一次记录里仍带异常标记的蹄位 */
export function currentAbnormalHooves(data: AppData, horseId: string): HoofKey[] {
  const latest = latestVisit(data, horseId);
  return latest ? visitAbnormalHooves(latest) : [];
}

// ---------- 复查提醒 ----------

export type ReminderStatus = "overdue" | "today" | "soon" | "scheduled";

export interface Reminder {
  horseId: string;
  code: string;
  name: string;
  visitId: string;
  nextDate: string;
  daysLeft: number;
  status: ReminderStatus;
}

/** 每匹马只提醒“最近一次记录”里的下次复查日期；默认 7 天内算临近 */
export function getReminders(data: AppData, withinDays = 7): Reminder[] {
  const today = todayStr();
  const reminders: Reminder[] = [];
  for (const horse of data.horses) {
    const visit = latestVisit(data, horse.id);
    if (!visit?.nextDate) continue;
    const daysLeft = diffDays(today, visit.nextDate);
    let status: ReminderStatus;
    if (daysLeft < 0) status = "overdue";
    else if (daysLeft === 0) status = "today";
    else if (daysLeft <= withinDays) status = "soon";
    else status = "scheduled";
    reminders.push({
      horseId: horse.id,
      code: horse.code,
      name: horse.name,
      visitId: visit.id,
      nextDate: visit.nextDate,
      daysLeft,
      status,
    });
  }
  const rank: Record<ReminderStatus, number> = { overdue: 0, today: 1, soon: 2, scheduled: 3 };
  return reminders.sort((a, b) =>
    a.status !== b.status ? rank[a.status] - rank[b.status] : a.nextDate.localeCompare(b.nextDate),
  );
}

// ---------- 四蹄对比 --------=

export interface HoofComparisonRow {
  key: HoofKey;
  label: string;
  shape: string;
  shoeType: string;
  shoeChanged: boolean;
  nailSlots: number[];
  abnormal: boolean;
  gaitTags: string[];
  lamenessGrade: number | null;
  note: string;
}

export function compareHooves(visit: Visit | undefined): HoofComparisonRow[] {
  return HOOF_KEYS.map((key) => {
    const h = visit ? visit.hooves[key] : emptyHoof();
    return {
      key,
      label: HOOF_LABEL[key],
      shape: h.shape || "—",
      shoeType: h.shoeType || "—",
      shoeChanged: h.shoeChanged,
      nailSlots: h.nailSlots,
      abnormal: visit ? hoofIsAbnormal(visit, key) : false,
      gaitTags: h.gaitTags,
      lamenessGrade: h.lamenessGrade,
      note: h.note || h.shapeNote || h.gaitNote || "",
    };
  });
}

// ---------- 蹄铁更换历史 ----------

export interface ShoeChangeEntry {
  visitId: string;
  date: string;
  hoof: HoofKey;
  hoofLabel: string;
  shoeType: string;
  previousType: string | null;
}

/** 逐蹄按时间正序，取出本次蹄铁类型与上次不同（或勾选更换）的条目 */
export function shoeChangeHistory(data: AppData, horseId: string): ShoeChangeEntry[] {
  const chronological = [...visitsOf(data, horseId)].reverse();
  const entries: ShoeChangeEntry[] = [];
  for (const key of HOOF_KEYS) {
    let previous: string | null = null;
    for (const visit of chronological) {
      const h = visit.hooves[key];
      const raw = h.shoeType;
      const current = raw || "无蹄铁（裸蹄）";
      const isFirst = previous === null;
      const changed = h.shoeChanged || (!isFirst && previous !== current);
      // 首次记录只要登记了蹄铁类型，就作为初始条目；裸蹄且未勾更换则忽略
      if (changed || (isFirst && raw)) {
        entries.push({
          visitId: visit.id,
          date: visit.date,
          hoof: key,
          hoofLabel: HOOF_LABEL[key],
          shoeType: current,
          previousType: isFirst ? null : previous,
        });
      }
      previous = current;
    }
  }
  return entries.sort((a, b) =>
    a.date !== b.date ? b.date.localeCompare(a.date) : HOOF_KEYS.indexOf(a.hoof) - HOOF_KEYS.indexOf(b.hoof),
  );
}

// ---------- 筛选 ----------

export interface HorseFilter {
  keyword: string;
  usage: string;
  /** abnormal | due-soon | overdue | all */
  status: string;
}

export function filterHorses(data: AppData, filter: HorseFilter): Horse[] {
  const today = todayStr();
  const kw = filter.keyword.trim().toLowerCase();
  return data.horses
    .filter((h) => {
      if (filter.usage && h.usage !== filter.usage) return false;
      if (kw) {
        const haystack = `${h.code} ${h.name} ${h.breed ?? ""} ${h.owner ?? ""} ${h.note ?? ""}`.toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      if (filter.status !== "all" && filter.status) {
        const latest = latestVisit(data, h.id);
        if (filter.status === "abnormal" && currentAbnormalHooves(data, h.id).length === 0) return false;
        if (filter.status.startsWith("due")) {
          if (!latest?.nextDate) return false;
          const days = diffDays(today, latest.nextDate);
          if (filter.status === "overdue" && days >= 0) return false;
          if (filter.status === "due-soon" && !(days >= 0 && days <= 7)) return false;
        }
      }
      return true;
    })
    .sort((a, b) => a.code.localeCompare(b.code, "zh-Hans-CN"));
}

/** 供流程测试：在无 localStorage 的 Node 环境里解析数据 */
export function parseForTest(raw: string): AppData {
  return sanitizeData(JSON.parse(raw));
}
