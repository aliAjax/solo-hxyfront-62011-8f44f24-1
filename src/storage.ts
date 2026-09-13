import type { AppData, HoofKey, HoofRecord, Horse, Visit } from "./types";
import { HOOF_KEYS } from "./types";

const STORAGE_KEY = "farrier-records-v1";

export function emptyHoof(): HoofRecord {
  return {
    shape: "",
    shapeNote: "",
    gaitTags: [],
    lamenessGrade: null,
    gaitNote: "",
    abnormal: false,
    shoeType: "",
    shoeChanged: false,
    nailSlots: [],
    nailNote: "",
    photos: [],
    note: "",
  };
}

export function emptyData(): AppData {
  return { version: 1, horses: [], visits: [] };
}

/** 清洗可能损坏/被手改过的旧数据，保证页面永远拿到结构合法的数据 */
export function sanitizeHoof(input: unknown): HoofRecord {
  const base = emptyHoof();
  if (!input || typeof input !== "object") return base;
  const o = input as Record<string, unknown>;
  return {
    shape: typeof o.shape === "string" ? o.shape : "",
    shapeNote: typeof o.shapeNote === "string" ? o.shapeNote : "",
    gaitTags: Array.isArray(o.gaitTags) ? o.gaitTags.filter((t): t is string => typeof t === "string") : [],
    lamenessGrade:
      typeof o.lamenessGrade === "number" && Number.isFinite(o.lamenessGrade) ? o.lamenessGrade : null,
    gaitNote: typeof o.gaitNote === "string" ? o.gaitNote : "",
    abnormal: Boolean(o.abnormal),
    shoeType: typeof o.shoeType === "string" ? o.shoeType : "",
    shoeChanged: Boolean(o.shoeChanged),
    nailSlots: Array.isArray(o.nailSlots)
      ? o.nailSlots.filter((n): n is number => typeof n === "number" && Number.isInteger(n))
      : [],
    nailNote: typeof o.nailNote === "string" ? o.nailNote : "",
    photos: Array.isArray(o.photos)
      ? o.photos
          .filter((p) => p && typeof p === "object")
          .map((p) => {
            const x = p as Record<string, unknown>;
            return {
              id: typeof x.id === "string" ? x.id : "",
              name: typeof x.name === "string" ? x.name : "照片",
              dataUrl: typeof x.dataUrl === "string" ? x.dataUrl : "",
              note: typeof x.note === "string" ? x.note : "",
              createdAt: typeof x.createdAt === "string" ? x.createdAt : "",
            };
          })
          .filter((p) => p.dataUrl)
      : [],
    note: typeof o.note === "string" ? o.note : "",
  };
}

function sanitizeVisit(input: unknown): Visit | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.horseId !== "string" || typeof o.date !== "string") {
    return null;
  }
  const rawHooves = (o.hooves ?? {}) as Record<string, unknown>;
  const hooves = {} as Record<HoofKey, HoofRecord>;
  for (const key of HOOF_KEYS) {
    hooves[key] = sanitizeHoof(rawHooves[key]);
  }
  return {
    id: o.id,
    horseId: o.horseId,
    date: o.date,
    nextDate: typeof o.nextDate === "string" ? o.nextDate : undefined,
    farrier: typeof o.farrier === "string" ? o.farrier : "",
    overallNote: typeof o.overallNote === "string" ? o.overallNote : "",
    hooves,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

function sanitizeHorse(input: unknown): Horse | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.code !== "string") return null;
  return {
    id: o.id,
    code: o.code,
    name: typeof o.name === "string" ? o.name : "",
    breed: typeof o.breed === "string" ? o.breed : "",
    age: typeof o.age === "number" && Number.isFinite(o.age) ? o.age : null,
    usage: (typeof o.usage === "string" ? o.usage : "") as Horse["usage"],
    color: typeof o.color === "string" ? o.color : "",
    owner: typeof o.owner === "string" ? o.owner : "",
    note: typeof o.note === "string" ? o.note : "",
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

export function sanitizeData(input: unknown): AppData {
  const fallback = emptyData();
  if (!input || typeof input !== "object") return fallback;
  const o = input as Record<string, unknown>;
  const horses = Array.isArray(o.horses)
    ? (o.horses.map(sanitizeHorse).filter(Boolean) as Horse[])
    : [];
  const horseIds = new Set(horses.map((h) => h.id));
  const visits = Array.isArray(o.visits)
    ? (o.visits.map(sanitizeVisit).filter(Boolean) as Visit[]).filter((v) => horseIds.has(v.horseId))
    : [];
  return { version: 1, horses, visits };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    return sanitizeData(JSON.parse(raw));
  } catch (err) {
    console.error("读取本地档案失败，已使用空档案：", err);
    return emptyData();
  }
}

export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    // 照片过大时可能超出 localStorage 配额
    console.error("保存失败（可能存储空间不足）：", err);
    alert("保存失败：本地存储空间可能已满，请删除部分旧照片后重试。");
    return false;
  }
}
