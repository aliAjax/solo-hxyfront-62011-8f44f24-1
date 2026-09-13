import { getReminders } from "../domain";
import type { AppData } from "../types";
import { Badge, EmptyState } from "./ui";
import type { ReminderStatus } from "../domain";

const STATUS_LABEL: Record<ReminderStatus, { tone: "danger" | "warn" | "info"; text: string }> = {
  overdue: { tone: "danger", text: "已逾期" },
  today: { tone: "warn", text: "今天到期" },
  soon: { tone: "warn", text: "7 天内" },
  scheduled: { tone: "info", text: "已安排" },
};

export function Reminders({
  data,
  onOpen,
}: {
  data: AppData;
  onOpen: (horseId: string) => void;
}) {
  const reminders = getReminders(data, 7);
  const urgent = reminders.filter((r) => r.status !== "scheduled");

  if (reminders.length === 0) {
    return (
      <EmptyState
        icon="📅"
        title="暂无复查安排"
        hint="在修蹄记录里填写“下次复查日期”后，这里会自动按到期时间排序提醒。"
      />
    );
  }

  return (
    <div>
      <p className="reminder-summary">
        共 {reminders.length} 匹马已安排复查，其中 <strong className="text-danger">{urgent.length}</strong> 匹已到期或 7 天内到期。
      </p>
      <div className="table-wrap card">
        <table className="horse-table">
          <thead>
            <tr>
              <th>状态</th>
              <th>马匹</th>
              <th>复查日期</th>
              <th>剩余</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reminders.map((r) => {
              const meta = STATUS_LABEL[r.status];
              return (
                <tr
                  key={r.horseId}
                  className={`horse-row ${r.status === "overdue" ? "row-urgent" : ""}`}
                  onClick={() => onOpen(r.horseId)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onOpen(r.horseId)}
                >
                  <td>
                    <Badge tone={meta.tone}>
                      {meta.text}
                    </Badge>
                  </td>
                  <td>
                    <strong>{r.code}</strong>
                    {r.name && <span className="row-sub"> {r.name}</span>}
                  </td>
                  <td>{r.nextDate}</td>
                  <td>
                    {r.daysLeft < 0 ? (
                      <span className="text-danger">已超 {-r.daysLeft} 天</span>
                    ) : r.daysLeft === 0 ? (
                      <span className="text-warn">今天</span>
                    ) : (
                      <span className={r.daysLeft <= 7 ? "text-warn" : ""}>{r.daysLeft} 天</span>
                    )}
                  </td>
                  <td className="link-cell">查看档案 →</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
