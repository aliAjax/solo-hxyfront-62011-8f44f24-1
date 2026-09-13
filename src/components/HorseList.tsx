import { useMemo, useState } from "react";
import type { AppData } from "../types";
import { HORSE_USAGES } from "../types";
import {
  currentAbnormalHooves,
  diffDays,
  filterHorses,
  latestVisit,
  todayStr,
} from "../domain";
import { HOOF_SHORT } from "../types";
import { Badge, EmptyState } from "./ui";

function reviewCell(nextDate?: string) {
  if (!nextDate) return <Badge tone="muted">未安排</Badge>;
  const d = diffDays(todayStr(), nextDate);
  if (d < 0) return <Badge tone="danger">逾期 {-d} 天 · {nextDate}</Badge>;
  if (d === 0) return <Badge tone="warn">今天 · {nextDate}</Badge>;
  if (d <= 7) return <Badge tone="warn">{d} 天后 · {nextDate}</Badge>;
  return <Badge tone="info">{d} 天后 · {nextDate}</Badge>;
}

export function HorseList({
  data,
  onOpen,
  onNew,
}: {
  data: AppData;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [usage, setUsage] = useState("all");
  const [status, setStatus] = useState("all");

  const horses = useMemo(
    () => filterHorses(data, { keyword, usage: usage === "all" ? "" : usage, status }),
    [data, keyword, usage, status],
  );

  const resetFilters = () => {
    setKeyword("");
    setUsage("all");
    setStatus("all");
  };

  return (
    <div>
      <div className="filter-bar card">
        <input
          className="search"
          placeholder="搜索编号 / 马名 / 品种 / 负责人…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <select value={usage} onChange={(e) => setUsage(e.target.value)}>
          <option value="all">全部用途</option>
          {HORSE_USAGES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">全部状态</option>
          <option value="overdue">复查已逾期</option>
          <option value="due-soon">7 天内待复查</option>
          <option value="abnormal">最近记录有异常步态</option>
        </select>
        {(keyword || usage !== "all" || status !== "all") && (
          <button type="button" className="small-btn" onClick={resetFilters}>
            清除筛选
          </button>
        )}
        <span className="filter-count">共 {horses.length} 匹</span>
      </div>

      {data.horses.length === 0 ? (
        <EmptyState
          icon="🐴"
          title="档案还是空的"
          hint="先建立第一匹马的档案，之后就可以连续登记每次修蹄并保留历史。"
          action={
            <button className="primary" onClick={onNew}>
              ＋ 新建马匹档案
            </button>
          }
        />
      ) : horses.length === 0 ? (
        <EmptyState
          icon="🔎"
          title="没有符合筛选条件的马匹"
          hint="换个关键词或清除筛选再试试。"
          action={
            <button className="small-btn" onClick={resetFilters}>
              清除筛选
            </button>
          }
        />
      ) : (
        <div className="table-wrap card">
          <table className="horse-table">
            <thead>
              <tr>
                <th>编号 / 马名</th>
                <th>用途</th>
                <th>最近修蹄</th>
                <th>下次复查</th>
                <th>步态状态</th>
                <th>累计记录</th>
              </tr>
            </thead>
            <tbody>
              {horses.map((h) => {
                const latest = latestVisit(data, h.id);
                const bad = currentAbnormalHooves(data, h.id);
                const count = data.visits.filter((v) => v.horseId === h.id).length;
                return (
                  <tr key={h.id} className="horse-row" onClick={() => onOpen(h.id)} tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && onOpen(h.id)}>
                    <td>
                      <strong>{h.code}</strong>
                      {h.name && <span className="row-sub"> {h.name}</span>}
                      {(h.breed || h.age !== null) && (
                        <span className="row-sub"> · {[h.breed, h.age !== null ? `${h.age}岁` : ""].filter(Boolean).join(" ")}</span>
                      )}
                    </td>
                    <td>{h.usage || <span className="text-muted">—</span>}</td>
                    <td>{latest ? latest.date : <span className="text-muted">无记录</span>}</td>
                    <td>{reviewCell(latest?.nextDate)}</td>
                    <td>
                      {bad.length > 0 ? (
                        <Badge tone="danger">⚠ {bad.map((k) => HOOF_SHORT[k]).join("、")}</Badge>
                      ) : latest ? (
                        <Badge tone="ok">正常</Badge>
                      ) : (
                        <Badge tone="muted">—</Badge>
                      )}
                    </td>
                    <td>{count} 次</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
