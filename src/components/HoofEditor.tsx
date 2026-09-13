import { useRef, useState } from "react";
import type { HoofKey, HoofRecord } from "../types";
import { GAIT_TAGS, HOOF_LABEL, HOOF_SHAPES, NAIL_SLOTS, SHOE_TYPES } from "../types";
import { fileToPhoto } from "../image";
import type { Photo } from "../types";

function toggleIn<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function HoofEditor({
  hoofKey,
  value,
  onChange,
}: {
  hoofKey: HoofKey;
  value: HoofRecord;
  onChange: (next: HoofRecord) => void;
}) {
  const patch = (p: Partial<HoofRecord>) => onChange({ ...value, ...p });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const abnormal = value.abnormal || value.gaitTags.length > 0 || (value.lamenessGrade ?? 0) > 0;

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const photos: Photo[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        photos.push(await fileToPhoto(file));
      }
      patch({ photos: [...value.photos, ...photos] });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section className={`hoof-card ${abnormal ? "hoof-abnormal" : ""}`}>
      <header className="hoof-head">
        <h4>{HOOF_LABEL[hoofKey]}</h4>
        {abnormal && <span className="badge badge-danger">⚠ 异常步态</span>}
      </header>

      <div className="hoof-grid">
        <label className="field">
          <span className="field-label">蹄形评估</span>
          <select value={value.shape} onChange={(e) => patch({ shape: e.target.value })}>
            <option value="">未评估（留空）</option>
            {HOOF_SHAPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">蹄铁类型</span>
          <select value={value.shoeType} onChange={(e) => patch({ shoeType: e.target.value })}>
            <option value="">未设置（留空）</option>
            {SHOE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span className="field-label">蹄形备注</span>
        <input
          value={value.shapeNote ?? ""}
          placeholder="角度、长度、裂线等（可留空）"
          onChange={(e) => patch({ shapeNote: e.target.value })}
        />
      </label>

      <fieldset className="tag-field">
        <legend>异常步态标记（可多选，留空即正常）</legend>
        <div className="tag-list">
          {GAIT_TAGS.map((tag) => (
            <button
              type="button"
              key={tag}
              className={`tag ${value.gaitTags.includes(tag) ? "tag-on tag-danger" : ""}`}
              onClick={() => patch({ gaitTags: toggleIn(value.gaitTags, tag) })}
            >
              {tag}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="hoof-grid">
        <label className="field">
          <span className="field-label">跛行分级（0–5，留空未查）</span>
          <select
            value={value.lamenessGrade ?? ""}
            onChange={(e) => patch({ lamenessGrade: e.target.value === "" ? null : Number(e.target.value) })}
          >
            <option value="">未查</option>
            {[0, 1, 2, 3, 4, 5].map((g) => (
              <option key={g} value={g}>
                {g} 级
              </option>
            ))}
          </select>
        </label>
        <label className="field checkbox-field">
          <span className="field-label">人工复核标记</span>
          <span className="switch-row">
            <input
              type="checkbox"
              checked={value.abnormal}
              onChange={(e) => patch({ abnormal: e.target.checked })}
            />
            <span>即使无标签也强制标记为异常</span>
          </span>
        </label>
      </div>
      <label className="field">
        <span className="field-label">步态观察备注</span>
        <input value={value.gaitNote ?? ""} placeholder="可留空" onChange={(e) => patch({ gaitNote: e.target.value })} />
      </label>

      <div className="hoof-grid">
        <label className="field checkbox-field">
          <span className="field-label">本次更换蹄铁</span>
          <span className="switch-row">
            <input
              type="checkbox"
              checked={value.shoeChanged}
              onChange={(e) => patch({ shoeChanged: e.target.checked })}
            />
            <span>{value.shoeChanged ? "已更换 / 新钉" : "沿用原蹄铁"}</span>
          </span>
        </label>
      </div>

      <fieldset className="tag-field">
        <legend>钉位（钉孔编号，可多选）</legend>
        <div className="tag-list">
          {NAIL_SLOTS.map((n) => (
            <button
              type="button"
              key={n}
              className={`tag tag-nail ${value.nailSlots.includes(n) ? "tag-on" : ""}`}
              onClick={() => patch({ nailSlots: toggleIn(value.nailSlots, n) })}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span className="field-label">钉位备注</span>
        <input value={value.nailNote ?? ""} placeholder="缺钉、补钉位置等（可留空）" onChange={(e) => patch({ nailNote: e.target.value })} />
      </label>

      <div className="photo-block">
        <div className="photo-head">
          <span className="field-label">照片与备注（{value.photos.length}）</span>
          <button type="button" className="small-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "压缩中…" : "＋ 添加照片"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>
        {value.photos.length === 0 ? (
          <p className="hint">暂无照片，留空即可。</p>
        ) : (
          <ul className="photo-list">
            {value.photos.map((p) => (
              <li key={p.id} className="photo-item">
                <img src={p.dataUrl} alt={p.name} />
                <div className="photo-meta">
                  <span title={p.name}>{p.name}</span>
                  <input
                    placeholder="照片备注"
                    value={p.note ?? ""}
                    onChange={(e) =>
                      patch({
                        photos: value.photos.map((x) => (x.id === p.id ? { ...x, note: e.target.value } : x)),
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="删除照片"
                  onClick={() => patch({ photos: value.photos.filter((x) => x.id !== p.id) })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="field">
        <span className="field-label">本蹄综合备注</span>
        <textarea rows={2} value={value.note ?? ""} placeholder="可留空" onChange={(e) => patch({ note: e.target.value })} />
      </label>
    </section>
  );
}
