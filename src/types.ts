// 数据模型：马匹档案 + 多次修蹄记录（每次记录包含左前/右前/左后/右后四蹄）

export type HoofKey = "LF" | "RF" | "LH" | "RH";

export const HOOF_KEYS: HoofKey[] = ["LF", "RF", "LH", "RH"];

export const HOOF_LABEL: Record<HoofKey, string> = {
  LF: "左前蹄",
  RF: "右前蹄",
  LH: "左后蹄",
  RH: "右后蹄",
};

export const HOOF_SHORT: Record<HoofKey, string> = {
  LF: "左前",
  RF: "右前",
  LH: "左后",
  RH: "右后",
};

export type HorseUsage = "运动马" | "教学马" | "休养马" | "繁育马";
export const HORSE_USAGES: HorseUsage[] = ["运动马", "教学马", "休养马", "繁育马"];

/** 蹄形评估选项（可选 + 自由备注，允许留空） */
export const HOOF_SHAPES = [
  "正常",
  "扁平蹄",
  "高蹄（起系蹄）",
  "裂蹄",
  "崩蹄（碎蹄）",
  "变形蹄",
  "外扩蹄",
  "内收蹄",
] as const;
export type HoofShape = (typeof HOOF_SHAPES)[number];

/** 蹄铁类型选项 */
export const SHOE_TYPES = [
  "无蹄铁（裸蹄）",
  "普通钢蹄铁",
  "铝合金蹄铁",
  "加护蹄垫",
  "塑料/复合材料蹄铁",
  "矫正蹄铁",
  "冰地蹄铁",
  "其他",
] as const;
export type ShoeType = (typeof SHOE_TYPES)[number];

/** 常见异常步态标签，可多选，可在备注补充 */
export const GAIT_TAGS = [
  "跛行",
  "点步",
  "步幅不均",
  "外向步（外八字）",
  "内向步（内八字）",
  "拖蹄/蹄尖拖地",
  "偏侧磨耗",
  "背腰紧张",
  "需复核",
] as const;

/** 蹄铁钉位（钉孔编号，常规 1–8） */
export const NAIL_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export interface Photo {
  id: string;
  name: string;
  /** 压缩后的 JPEG data URL */
  dataUrl: string;
  note?: string;
  createdAt: string;
}

export interface HoofRecord {
  /** 蹄形评估 */
  shape: string;
  shapeNote?: string;
  /** 异常步态标签 */
  gaitTags: string[];
  /** 跛行分级 0–5（AAEP），0 表示无；允许为空 */
  lamenessGrade: number | null;
  gaitNote?: string;
  /** 人工确认的异常步态标记（表单会随异常标签自动勾选，可覆盖） */
  abnormal: boolean;
  /** 蹄铁类型 */
  shoeType: string;
  /** 本次是否更换蹄铁 */
  shoeChanged: boolean;
  /** 钉位编号 */
  nailSlots: number[];
  nailNote?: string;
  photos: Photo[];
  note?: string;
}

export interface Visit {
  id: string;
  horseId: string;
  /** 修蹄日期 YYYY-MM-DD */
  date: string;
  /** 下次复查日期 YYYY-MM-DD（可空） */
  nextDate?: string;
  /** 操作蹄铁师 */
  farrier?: string;
  overallNote?: string;
  hooves: Record<HoofKey, HoofRecord>;
  createdAt: string;
  updatedAt: string;
}

export interface Horse {
  id: string;
  /** 马匹编号，唯一 */
  code: string;
  name: string;
  breed?: string;
  /** 年龄，可空 */
  age: number | null;
  usage: HorseUsage | "";
  color?: string;
  owner?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppData {
  version: 1;
  horses: Horse[];
  visits: Visit[];
}
