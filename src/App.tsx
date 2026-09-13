import { useMemo, useState } from "react";
import "./styles.css";
import { useStore } from "./store";
import { getReminders } from "./domain";
import { HorseList } from "./components/HorseList";
import { Reminders } from "./components/Reminders";
import { HorseDetail } from "./components/HorseDetail";
import { HorseForm } from "./components/HorseForm";

type View = "list" | "reminders";

export default function App() {
  const data = useStore();
  const [view, setView] = useState<View>("list");
  const [openHorseId, setOpenHorseId] = useState<string | null>(null);
  const [showHorseForm, setShowHorseForm] = useState(false);

  const urgentCount = useMemo(
    () => getReminders(data, 7).filter((r) => r.status === "overdue" || r.status === "today" || r.status === "soon").length,
    [data],
  );

  const openHorse = (id: string) => setOpenHorseId(id);

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🐎</span>
          <div>
            <h1>马术俱乐部 · 修蹄档案</h1>
            <p>蹄铁师专用：马匹档案 / 四蹄评估 / 复查提醒 / 蹄铁更换历史（数据保存在本机浏览器）</p>
          </div>
        </div>
        <div className="top-actions">
          <button className="primary" onClick={() => setShowHorseForm(true)}>
            ＋ 新建马匹档案
          </button>
        </div>
      </header>

      {openHorseId ? (
        <HorseDetail data={data} horseId={openHorseId} onBack={() => setOpenHorseId(null)} />
      ) : (
        <>
          <nav className="main-tabs">
            <button className={view === "list" ? "tab-on" : ""} onClick={() => setView("list")}>
              马匹列表（{data.horses.length}）
            </button>
            <button className={view === "reminders" ? "tab-on" : ""} onClick={() => setView("reminders")}>
              复查提醒{urgentCount > 0 ? `（${urgentCount} 待处理）` : "（0）"}
            </button>
          </nav>

          {view === "list" && (
            <HorseList data={data} onOpen={openHorse} onNew={() => setShowHorseForm(true)} />
          )}
          {view === "reminders" && <Reminders data={data} onOpen={openHorse} />}
        </>
      )}

      {showHorseForm && <HorseForm data={data} onClose={() => setShowHorseForm(false)} />}

      <footer className="footer">
        共 {data.horses.length} 匹马 · {data.visits.length} 条修蹄记录 · 数据通过 localStorage 本地持久化
        {" · "}
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            if (confirm("确定导出全部档案为 JSON 文件？")) {
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `修蹄档案备份_${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }
          }}
        >
          导出备份
        </button>
      </footer>
    </main>
  );
}
