import { useRef, useState } from "react";
import type { Horse, HorseUsage } from "../types";
import { HORSE_USAGES } from "../types";
import type { FieldErrors, HorseInput } from "../domain";
import { validateHorse } from "../domain";
import type { AppData } from "../types";
import { store } from "../store";
import { Field, Modal, SubmitButton } from "./ui";

const EMPTY: HorseInput = {
  code: "",
  name: "",
  breed: "",
  age: null,
  usage: "运动马",
  color: "",
  owner: "",
  note: "",
};

export function HorseForm({
  data,
  horse,
  onClose,
}: {
  data: AppData;
  horse?: Horse;
  onClose: () => void;
}) {
  const [form, setForm] = useState<HorseInput>(
    horse
      ? {
          code: horse.code,
          name: horse.name,
          breed: horse.breed ?? "",
          age: horse.age,
          usage: horse.usage,
          color: horse.color ?? "",
          owner: horse.owner ?? "",
          note: horse.note ?? "",
        }
      : EMPTY,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  // 同步锁：真正的双击事件在同一批次触发，state 来不及更新，必须用 ref 拦截
  const submittingRef = useRef(false);

  const set = <K extends keyof HorseInput>(key: K, value: HorseInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || submittingRef.current) return; // 防止重复提交
    const errs = validateHorse(form, data, horse?.id);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    // 让“保存中…”有机会渲染，同时模拟落盘耗时，避免快速双击产生两条
    setTimeout(() => {
      if (horse) store.editHorse(horse.id, form);
      else store.addHorse(form);
      onClose();
    }, 120);
  };

  return (
    <Modal title={horse ? `编辑马匹档案 · ${horse.code}` : "新建马匹档案"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="马匹编号" required error={errors.code}>
            <input
              value={form.code}
              placeholder="如 HORSE-18"
              onChange={(e) => set("code", e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="马名">
            <input value={form.name} placeholder="可留空" onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="品种">
            <input value={form.breed} placeholder="如 温血马" onChange={(e) => set("breed", e.target.value)} />
          </Field>
          <Field label="年龄（岁）" error={errors.age}>
            <input
              type="number"
              min={0}
              max={60}
              value={form.age ?? ""}
              placeholder="可留空"
              onChange={(e) => set("age", e.target.value === "" ? null : Number(e.target.value))}
            />
          </Field>
          <Field label="用途分类">
            <select value={form.usage} onChange={(e) => set("usage", e.target.value as HorseUsage)}>
              <option value="">未分类</option>
              {HORSE_USAGES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          <Field label="毛色">
            <input value={form.color} placeholder="如 骝色" onChange={(e) => set("color", e.target.value)} />
          </Field>
          <Field label="马主 / 负责人">
            <input value={form.owner} placeholder="可留空" onChange={(e) => set("owner", e.target.value)} />
          </Field>
        </div>
        <Field label="档案备注">
          <textarea
            rows={2}
            value={form.note}
            placeholder="既往病史、性格、注意事项等（可留空）"
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
        <div className="form-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <SubmitButton busy={busy}>{horse ? "保存修改" : "建立档案"}</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
