import { useRef, useState } from "react";
import type { HoofKey, HoofRecord, Horse, Visit } from "../types";
import { HOOF_KEYS } from "../types";
import { emptyHoof } from "../storage";
import type { FieldErrors } from "../domain";
import { addDays, todayStr, uid, validateVisit } from "../domain";
import { store } from "../store";
import { Field, Modal, SubmitButton } from "./ui";
import { HoofEditor } from "./HoofEditor";

function blankHooves(): Record<HoofKey, HoofRecord> {
  return { LF: emptyHoof(), RF: emptyHoof(), LH: emptyHoof(), RH: emptyHoof() };
}

export function VisitForm({
  horse,
  visit,
  latest,
  onClose,
}: {
  horse: Horse;
  visit?: Visit;
  /** 新建时用于“沿用上次”草稿 */
  latest?: Visit;
  onClose: () => void;
}) {
  const [date, setDate] = useState(visit?.date ?? todayStr());
  const [nextDate, setNextDate] = useState(visit?.nextDate ?? addDays(todayStr(), 42));
  const [farrier, setFarrier] = useState(visit?.farrier ?? "");
  const [overallNote, setOverallNote] = useState(visit?.overallNote ?? "");
  const [hooves, setHooves] = useState<Record<HoofKey, HoofRecord>>(
    visit ? structuredClone(visit.hooves) : blankHooves(),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  // 同步锁：状态更新是异步的，真正的双击/回车连点需要 ref 立即拦截
  const submittingRef = useRef(false);

  const setHoof = (key: HoofKey, next: HoofRecord) =>
    setHooves((h) => ({ ...h, [key]: next }));

  const copyLatest = () => {
    if (!latest) return;
    // 沿用评估与蹄铁信息，但清掉“本次更换”勾选，照片由蹄铁师重新拍
    const draft = structuredClone(latest.hooves);
    for (const key of HOOF_KEYS) {
      draft[key].shoeChanged = false;
      draft[key].photos = [];
    }
    setHooves(draft);
    if (!visit) {
      setFarrier(latest.farrier ?? "");
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || submittingRef.current) return; // 防止重复提交：双击/回车连点只产生一条记录
    const errs = validateVisit({ date, nextDate });
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setTimeout(() => {
      const now = new Date().toISOString();
      if (visit) {
        store.editVisit({
          ...visit,
          date,
          nextDate: nextDate || undefined,
          farrier: farrier.trim(),
          overallNote: overallNote.trim(),
          hooves,
          updatedAt: now,
        });
      } else {
        store.addVisit({
          id: uid("v"),
          horseId: horse.id,
          date,
          nextDate: nextDate || undefined,
          farrier: farrier.trim(),
          overallNote: overallNote.trim(),
          hooves,
          createdAt: now,
          updatedAt: now,
        });
      }
      onClose();
    }, 120);
  };

  return (
    <Modal wide title={`${horse.code} ${horse.name ? "· " + horse.name : ""} · ${visit ? "编辑修蹄记录" : "新增修蹄记录"}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="修蹄日期" required error={errors.date}>
            <input type="date" value={date} onChange={(e) => {
              setDate(e.target.value);
              setErrors((x) => ({ ...x, date: "" }));
            }} />
          </Field>
          <Field label="下次复查日期" error={errors.nextDate} hint="留空表示暂不安排复查">
            <input type="date" value={nextDate} onChange={(e) => {
              setNextDate(e.target.value);
              setErrors((x) => ({ ...x, nextDate: "" }));
            }} />
          </Field>
          <Field label="蹄铁师">
            <input value={farrier} placeholder="操作蹄铁师姓名（可留空）" onChange={(e) => setFarrier(e.target.value)} />
          </Field>
          <div className="field">
            <span className="field-label">快捷操作</span>
            <button
              type="button"
              className="small-btn"
              onClick={copyLatest}
              disabled={!latest}
              title={latest ? "把上次记录的蹄形/蹄铁/钉位复制为草稿" : "还没有历史记录"}
            >
              沿用上次评估为草稿
            </button>
          </div>
        </div>

        <div className="hoof-grid-2">
          {HOOF_KEYS.map((key) => (
            <HoofEditor key={key} hoofKey={key} value={hooves[key]} onChange={(v) => setHoof(key, v)} />
          ))}
        </div>

        <Field label="本次整体备注">
          <textarea
            rows={2}
            value={overallNote}
            placeholder="四蹄总体情况、教练/兽医沟通事项（可留空）"
            onChange={(e) => setOverallNote(e.target.value)}
          />
        </Field>

        <div className="form-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <SubmitButton busy={busy}>{visit ? "保存修改" : "提交修蹄记录"}</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
