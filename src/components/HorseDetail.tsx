import { useMemo, useState } from "react";
import type { AppData, Horse, HoofKey, Visit } from "../types";
import { HOOF_KEYS, HOOF_LABEL, HOOF_SHORT } from "../types";
import {
  diffDays,
  latestVisit,
  shoeChangeHistory,
  todayStr,
  visitAbnormalHooves,
  visitsOf,
} from "../domain";
import { store } from "../store";
import { Badge, ConfirmButton, EmptyState } from "./ui";
import { HorseForm } from "./HorseForm";
import { VisitForm } from "./VisitForm";

type Tab = "timeline" | "compare" | "shoes";

function reviewBadge(nextDate?: string) {
  if (!nextDate) return <Badge tone="muted">未安排复查</Badge>;
  const d = diffDays(todayStr(), nextDate);
  if (d < 0) return <Badge tone="danger">已逾期 {-d} 天（{nextDate}）</Badge>;
  if (d === 0) return <Badge tone="warn">今天复查（{nextDate}）</Badge>;
  if (d <= 7) return <Badge tone="warn">{d} 天后复查（{nextDate}）</Badge>;
  return <Badge tone="info">{d} 天后复查（{nextDate}）</Badge>;
}

function changedCount(v: Visit) {
  return HOOF_KEYS.filter((k) => v.hooves[k].shoeChanged).length;
}

function photoCount(v: Visit) {
  return HOOF_KEYS.reduce((sum, k) => sum + v.hooves[k].photos.length, 0);
}

function VisitCard({
  visit,
  onEdit,
  onDelete,
}: {
  visit: Visit;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const abnormal = visitAbnormalHooves(visit);
  const changes = changedCount(visit);
  return (
    <article className="card visit-card">
      <header className="visit-head" onClick={() => setOpen((o) => !o)}>
        <div>
          <strong>修蹄日期 {visit.date}</strong>
          {visit.farrier && <span className="visit-farrier">蹄铁师：{visit.farrier}</span>}
        </div>
        <div className="visit-badges">
          {abnormal.length > 0 && <Badge tone="danger">⚠ 异常：{abnormal.map((k) => HOOF_SHORT[k]).join("、")}</Badge>}
          {changes > 0 && <Badge tone="warn">更换蹄铁 ×{changes}</Badge>}
          {photoCount(visit) > 0 && <Badge tone="info">照片 ×{photoCount(visit)}</Badge>}
          {reviewBadge(visit.nextDate)}
          <button
            type="button"
            className="icon-btn"
            aria-label={open ? "收起" : "展开"}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            {open ? "▲" : "▼"}
          </button>
        </div>
      </header>

      {open && (
        <div className="visit-body">
          <div className="visit-hooves">
            {HOOF_KEYS.map((k) => {
              const h = visit.hooves[k];
              const bad = abnormal.includes(k);
              return (
                <div key={k} className={`mini-hoof ${bad ? "mini-hoof-bad" : ""}`}>
                  <h5>
                    {HOOF_LABEL[k]} {bad && <span className="badge badge-danger">异常</span>}
                  </h5>
                  <p>蹄形：{h.shape || "—"}{h.shapeNote ? `（${h.shapeNote}）` : ""}</p>
                  <p>
                    蹄铁：{h.shoeType || "—"}
                    {h.shoeChanged && <span className="text-warn"> · 本次更换</span>}
                  </p>
                  <p>钉位：{h.nailSlots.length ? h.nailSlots.join("、") + " 号孔" : "—"}</p>
                  {h.gaitTags.length > 0 && <p className="text-danger">步态：{h.gaitTags.join("、")}</p>}
                  {(h.lamenessGrade ?? null) !== null && <p>跛行分级：{h.lamenessGrade} 级</p>}
                  {(h.gaitNote || h.nailNote || h.note) && (
                    <p className="visit-notes">{[h.gaitNote, h.nailNote, h.note].filter(Boolean).join("；")}</p>
                  )}
                  {h.photos.length > 0 && (
                    <div className="thumbs">
                      {h.photos.map((p) => (
                        <a key={p.id} href={p.dataUrl} target="_blank" rel="noreferrer" title={p.note || p.name}>
                          <img src={p.dataUrl} alt={p.name} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {visit.overallNote && <p className="visit-overall">整体备注：{visit.overallNote}</p>}
          <div className="card-actions">
            <button type="button" className="small-btn" onClick={onEdit}>
              编辑本次记录
            </button>
            <ConfirmButton onConfirm={onDelete} title="删除本次修蹄记录">
              删除本次记录
            </ConfirmButton>
          </div>
        </div>
      )}
    </article>
  );
}

function CompareTab({ data, horse }: { data: AppData; horse: Horse }) {
  const visits = visitsOf(data, horse.id); // 新→旧
  const [aId, setAId] = useState(visits[0]?.id ?? "");
  const [bId, setBId] = useState(visits[1]?.id ?? "");
  const a = visits.find((v) => v.id === aId);
  const b = visits.find((v) => v.id === bId);

  if (visits.length === 0) {
    return <EmptyState icon="🔍" title="还没有修蹄记录" hint="新增第一次修蹄记录后，即可在此对比左右前后四蹄。" />;
  }

  const cell = (va: Visit | undefined, vb: Visit | undefined, key: HoofKey, field: "shape" | "shoeType") => {
    const x = va ? va.hooves[key][field] : "";
    const y = vb ? vb.hooves[key][field] : "";
    const changed = Boolean(vb) && x !== y;
    return (
      <span className={changed ? "cell-changed" : ""}>
        {x || "—"}
        {changed && <em className="cell-arrow"> （上次：{y || "—"}）</em>}
      </span>
    );
  };

  return (
    <div>
      <div className="compare-selects">
        <label className="field">
          <span className="field-label">对比记录</span>
          <select value={aId} onChange={(e) => setAId(e.target.value)}>
            {visits.map((v) => (
              <option key={v.id} value={v.id}>
                {v.date} 修蹄
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">参照记录（可留空）</span>
          <select value={bId} onChange={(e) => setBId(e.target.value)}>
            <option value="">不参照</option>
            {visits.map((v) => (
              <option key={v.id} value={v.id}>
                {v.date} 修蹄
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>蹄位</th>
              <th>蹄形评估</th>
              <th>蹄铁类型</th>
              <th>本次更换</th>
              <th>钉位</th>
              <th>异常步态</th>
              <th>照片</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {HOOF_KEYS.map((key) => {
              const h = a!.hooves[key];
              const bad = h.abnormal || h.gaitTags.length > 0 || (h.lamenessGrade ?? 0) > 0;
              return (
                <tr key={key} className={bad ? "row-bad" : ""}>
                  <th>{HOOF_LABEL[key]}</th>
                  <td>{cell(a, b, key, "shape")}</td>
                  <td>{cell(a, b, key, "shoeType")}</td>
                  <td>{h.shoeChanged ? <Badge tone="warn">是</Badge> : "否"}</td>
                  <td>{h.nailSlots.length ? h.nailSlots.join("、") : "—"}</td>
                  <td>
                    {bad ? (
                      <div className="gait-cell">
                        <Badge tone="danger">⚠ 异常</Badge>
                        {h.gaitTags.length > 0 && <span>{h.gaitTags.join("、")}</span>}
                        {(h.lamenessGrade ?? null) !== null && <span>跛行 {h.lamenessGrade} 级</span>}
                      </div>
                    ) : (
                      <span className="text-ok">正常</span>
                    )}
                  </td>
                  <td>
                    {h.photos.length > 0 ? (
                      <div className="thumbs thumbs-sm">
                        {h.photos.map((p) => (
                          <a key={p.id} href={p.dataUrl} target="_blank" rel="noreferrer" title={p.note || p.name}>
                            <img src={p.dataUrl} alt={p.name} />
                          </a>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="note-cell">{[h.shapeNote, h.gaitNote, h.nailNote, h.note].filter(Boolean).join("；") || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {a!.overallNote && <p className="visit-overall">整体备注：{a!.overallNote}</p>}
    </div>
  );
}

function ShoesTab({ data, horse }: { data: AppData; horse: Horse }) {
  const history = useMemo(() => shoeChangeHistory(data, horse.id), [data, horse.id]);
  if (history.length === 0) {
    return (
      <EmptyState
        icon="🐎"
        title="暂无蹄铁更换记录"
        hint="在修蹄记录里勾选“本次更换蹄铁”，或填写与上次不同的蹄铁类型后，会自动归档到这里。"
      />
    );
  }
  return (
    <ol className="shoe-history">
      {history.map((e, i) => (
        <li key={`${e.visitId}-${e.hoof}-${i}`} className="shoe-entry">
          <span className="shoe-date">{e.date}</span>
          <Badge tone="info">{e.hoofLabel}</Badge>
          <span className="shoe-change">
            {e.previousType === null ? (
              <>初次登记：<strong>{e.shoeType}</strong></>
            ) : (
              <>
                {e.previousType} <span className="text-warn">→</span> <strong>{e.shoeType}</strong>
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function HorseDetail({
  data,
  horseId,
  onBack,
}: {
  data: AppData;
  horseId: string;
  onBack: () => void;
}) {
  const horse = data.horses.find((h) => h.id === horseId);
  const [tab, setTab] = useState<Tab>("timeline");
  const [editingHorse, setEditingHorse] = useState(false);
  const [addingVisit, setAddingVisit] = useState(false);
  const [editingVisit, setEditingVisit] = useState<Visit | undefined>(undefined);

  if (!horse) {
    return (
      <div>
        <EmptyState icon="🚧" title="马匹档案不存在或已被移除" action={<button className="primary" onClick={onBack}>返回列表</button>} />
      </div>
    );
  }

  const visits = visitsOf(data, horse.id);
  const latest = latestVisit(data, horse.id);
  const abnormalNow = latest ? visitAbnormalHooves(latest) : [];

  return (
    <div>
      <button type="button" className="back-btn" onClick={onBack}>
        ← 返回马匹列表
      </button>

      <header className="detail-head card">
        <div>
          <h2>
            {horse.code} {horse.name && <span className="horse-name">{horse.name}</span>}
          </h2>
          <p className="horse-meta">
            {[horse.usage, horse.breed, horse.age !== null ? `${horse.age} 岁` : "", horse.color, horse.owner ? `负责人：${horse.owner}` : ""]
              .filter(Boolean)
              .join(" · ") || "暂无基础信息"}
          </p>
          {horse.note && <p className="horse-note">📋 {horse.note}</p>}
        </div>
        <div className="detail-side">
          <div className="detail-stat">
            <span>修蹄次数</span>
            <strong>{visits.length}</strong>
          </div>
          <div className="detail-stat">
            <span>复查状态</span>
            {reviewBadge(latest?.nextDate)}
          </div>
          <div className="detail-stat">
            <span>步态状态</span>
            {abnormalNow.length > 0 ? (
              <Badge tone="danger">异常：{abnormalNow.map((k) => HOOF_SHORT[k]).join("、")}</Badge>
            ) : visits.length > 0 ? (
              <Badge tone="ok">最近正常</Badge>
            ) : (
              <Badge tone="muted">无记录</Badge>
            )}
          </div>
          <div className="detail-actions">
            <button type="button" className="small-btn" onClick={() => setEditingHorse(true)}>
              编辑档案
            </button>
            <button type="button" className="primary" onClick={() => setAddingVisit(true)}>
              ＋ 新增修蹄记录
            </button>
            <ConfirmButton
              onConfirm={() => {
                store.removeHorse(horse.id);
                onBack();
              }}
              title="移除该马匹档案及其全部修蹄记录"
            >
              移除档案
            </ConfirmButton>
          </div>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === "timeline" ? "tab-on" : ""} onClick={() => setTab("timeline")}>
          修蹄时间线（{visits.length}）
        </button>
        <button className={tab === "compare" ? "tab-on" : ""} onClick={() => setTab("compare")}>
          四蹄对比
        </button>
        <button className={tab === "shoes" ? "tab-on" : ""} onClick={() => setTab("shoes")}>
          蹄铁更换历史
        </button>
      </nav>

      {tab === "timeline" &&
        (visits.length === 0 ? (
          <EmptyState
            icon="📝"
            title="还没有修蹄记录"
            hint="为这匹马新增第一次修蹄记录，蹄形评估、钉位、照片都可以逐蹄填写。"
            action={
              <button className="primary" onClick={() => setAddingVisit(true)}>
                ＋ 新增修蹄记录
              </button>
            }
          />
        ) : (
          <div className="visit-list">
            {visits.map((v) => (
              <VisitCard
                key={v.id}
                visit={v}
                onEdit={() => setEditingVisit(v)}
                onDelete={() => store.removeVisit(v.id)}
              />
            ))}
          </div>
        ))}

      {tab === "compare" && <CompareTab data={data} horse={horse} />}
      {tab === "shoes" && <ShoesTab data={data} horse={horse} />}

      {editingHorse && <HorseForm data={data} horse={horse} onClose={() => setEditingHorse(false)} />}
      {addingVisit && (
        <VisitForm horse={horse} latest={latest} onClose={() => setAddingVisit(false)} />
      )}
      {editingVisit && (
        <VisitForm
          horse={horse}
          visit={editingVisit}
          latest={latest && latest.id !== editingVisit.id ? latest : visits.find((v) => v.id !== editingVisit.id)}
          onClose={() => setEditingVisit(undefined)}
        />
      )}
    </div>
  );
}
