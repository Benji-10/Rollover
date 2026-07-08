import { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* ---------- date/time helpers ---------- */
const pad = (n) => String(n).padStart(2, "0");
const toHM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const toAmPm = (m) => {
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return mm === 0 ? `${h} ${ap}` : `${h}:${pad(mm)} ${ap}`;
};
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const startOfWeek = (d) => addDays(d, -d.getDay()); /* Sunday start, like Apple default */
const sameDay = (a, b) => dateKey(a) === dateKey(b);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const COLORS = {
  blue:   { bg: "#e8f1fe", border: "#0a84ff", text: "#0a5dc2" },
  red:    { bg: "#fdeaea", border: "#ff453a", text: "#c0332b" },
  orange: { bg: "#fef1e2", border: "#ff9f0a", text: "#b06400" },
  green:  { bg: "#e7f6ec", border: "#30d158", text: "#1b7d3a" },
  purple: { bg: "#f2ecfd", border: "#bf5af2", text: "#7d3ab3" },
  gray:   { bg: "#f0f0f2", border: "#8e8e93", text: "#5a5a5f" },
};
const TASK_COLOR = { bg: "#eef4ff", border: "#5b8def", text: "#3c66c4" };

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ---------- auto-scheduler ----------
   Places every unfinished task into the earliest free slot after "now",
   inside working hours / working days, around fixed events and already-
   placed tasks. Re-runs on every change and every minute, so a task you
   didn't check off simply flows to the next open slot. */
function scheduleTasks(tasks, events, settings, now) {
  const HORIZON = 28;
  const gran = 15;
  const snapUp = (m) => Math.ceil(m / gran) * gran;

  const busyByDay = {};
  for (const ev of events) {
    (busyByDay[ev.date] ||= []).push([ev.start, ev.end]);
  }

  const pending = tasks
    .filter((t) => !t.done)
    .sort((a, b) => {
      const da = a.deadline || "9999-12-31";
      const db = b.deadline || "9999-12-31";
      if (da !== db) return da < db ? -1 : 1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.createdAt - b.createdAt;
    });

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const placed = {};

  for (const t of pending) {
    let done = false;
    for (let i = 0; i < HORIZON && !done; i++) {
      const day = addDays(now, i);
      if (!settings.days.includes(day.getDay())) continue;
      const key = dateKey(day);
      let winStart = settings.workStart;
      const winEnd = settings.workEnd;
      if (i === 0) winStart = Math.max(winStart, snapUp(nowMin));
      if (winStart >= winEnd) continue;

      const busy = (busyByDay[key] || []).slice().sort((a, b) => a[0] - b[0]);
      let cursor = winStart;
      for (const [s, e] of busy) {
        const gapEnd = Math.min(s, winEnd);
        if (gapEnd - cursor >= t.duration) break;
        cursor = snapUp(Math.max(cursor, e));
        if (cursor >= winEnd) break;
      }
      if (cursor < winEnd && winEnd - cursor >= t.duration) {
        const slot = { date: key, start: cursor, end: cursor + t.duration };
        placed[t.id] = slot;
        (busyByDay[key] ||= []).push([slot.start, slot.end]);
        done = true;
      }
    }
  }
  return placed;
}

/* ---------- storage ---------- */
const STORE_KEY = "planner-data-v1";

const DEFAULTS = {
  tasks: [],
  events: [],
  settings: { workStart: 9 * 60, workEnd: 18 * 60, days: [1, 2, 3, 4, 5] },
};

/* ---------- small UI atoms ---------- */
function TimeSelect({ value, onChange, from = 0, to = 24 * 60, step = 15 }) {
  const opts = [];
  for (let m = from; m <= to; m += step) opts.push(m);
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="border rounded-md px-2 py-1 text-sm bg-white"
      style={{ borderColor: "#d9d9de" }}
    >
      {opts.map((m) => (
        <option key={m} value={m}>{toAmPm(m)}</option>
      ))}
    </select>
  );
}

function Check({ checked, onToggle, color = "#5b8def" }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="flex-shrink-0 rounded-full flex items-center justify-center transition-all"
      style={{
        width: 18, height: 18,
        border: `1.5px solid ${checked ? color : "#b8b8bf"}`,
        background: checked ? color : "transparent",
      }}
      aria-label={checked ? "Mark incomplete" : "Mark complete"}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M2 5.2 L4.2 7.4 L8 2.8" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

/* ---------- modal shell ---------- */
function Modal({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.25)" }} onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "inherit" }}
      >
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h3 className="font-semibold text-base" style={{ color: "#1c1c1e" }}>{title}</h3>
          <button onClick={onClose} className="text-sm" style={{ color: "#8e8e93" }}>✕</button>
        </div>
        <div className="px-5 pb-4">{children}</div>
        {footer && <div className="px-5 pb-4 flex gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- event editor ---------- */
function EventModal({ draft, onSave, onDelete, onClose }) {
  const [title, setTitle] = useState(draft.title || "");
  const [date, setDate] = useState(draft.date);
  const [start, setStart] = useState(draft.start);
  const [end, setEnd] = useState(draft.end);
  const [color, setColor] = useState(draft.color || "blue");
  const isNew = !draft.id;

  return (
    <Modal
      title={isNew ? "New Event" : "Edit Event"}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            <button onClick={() => onDelete(draft.id)} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ color: "#ff3b30" }}>
              Delete
            </button>
          )}
          <button
            onClick={() => {
              if (!title.trim()) return;
              onSave({ ...draft, id: draft.id || uid(), title: title.trim(), date, start, end: Math.max(end, start + 15), color });
            }}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: "#0a84ff" }}
          >
            {isNew ? "Add" : "Save"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: "#f2f2f7", border: "1px solid transparent", outline: "none" }}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs w-12" style={{ color: "#8e8e93" }}>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded-md px-2 py-1 text-sm" style={{ borderColor: "#d9d9de" }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs w-12" style={{ color: "#8e8e93" }}>Starts</span>
          <TimeSelect value={start} onChange={(v) => { setStart(v); if (end <= v) setEnd(v + 60); }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs w-12" style={{ color: "#8e8e93" }}>Ends</span>
          <TimeSelect value={end} onChange={setEnd} from={start + 15} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs w-12" style={{ color: "#8e8e93" }}>Color</span>
          <div className="flex gap-2">
            {Object.keys(COLORS).map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="rounded-full"
                style={{
                  width: 20, height: 20, background: COLORS[c].border,
                  outline: color === c ? `2px solid ${COLORS[c].border}` : "none",
                  outlineOffset: 2,
                }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- settings ---------- */
function SettingsModal({ settings, onSave, onClose }) {
  const [s, setS] = useState(settings);
  const toggleDay = (d) =>
    setS((p) => ({ ...p, days: p.days.includes(d) ? p.days.filter((x) => x !== d) : [...p.days, d].sort() }));
  return (
    <Modal
      title="Scheduling Hours"
      onClose={onClose}
      footer={
        <button onClick={() => onSave(s)} className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ background: "#0a84ff" }}>
          Save
        </button>
      }
    >
      <p className="text-xs mb-3" style={{ color: "#8e8e93" }}>
        Tasks are only auto-scheduled inside these hours. Everything outside is downtime — nothing gets placed there.
      </p>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs w-14" style={{ color: "#8e8e93" }}>From</span>
        <TimeSelect value={s.workStart} onChange={(v) => setS((p) => ({ ...p, workStart: v }))} />
        <span className="text-xs w-8 text-center" style={{ color: "#8e8e93" }}>to</span>
        <TimeSelect value={s.workEnd} onChange={(v) => setS((p) => ({ ...p, workEnd: v }))} from={s.workStart + 60} />
      </div>
      <div className="flex items-center gap-1.5 mt-3">
        {DOW.map((d, i) => (
          <button
            key={d}
            onClick={() => toggleDay(i)}
            className="rounded-full text-xs font-medium px-2 py-1.5"
            style={{
              background: s.days.includes(i) ? "#0a84ff" : "#f2f2f7",
              color: s.days.includes(i) ? "white" : "#8e8e93",
              minWidth: 38,
            }}
          >
            {d}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ---------- main app ---------- */
export default function Planner() {
  const [loaded, setLoaded] = useState(false);
  const [tasks, setTasks] = useState(DEFAULTS.tasks);
  const [events, setEvents] = useState(DEFAULTS.events);
  const [settings, setSettings] = useState(DEFAULTS.settings);
  const [now, setNow] = useState(new Date());
  const [view, setView] = useState("week");
  const [anchor, setAnchor] = useState(new Date());
  const [eventDraft, setEventDraft] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", duration: 60, deadline: "", priority: 2 });
  const [saveState, setSaveState] = useState("idle");
  const scrollRef = useRef(null);
  const saveTimer = useRef(null);

  /* clock tick — drives overdue-task reflow */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  /* load from localStorage */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setTasks(d.tasks || []);
        setEvents(d.events || []);
        setSettings({ ...DEFAULTS.settings, ...(d.settings || {}) });
      }
    } catch {
      /* first run or corrupted data — start fresh */
    }
    setLoaded(true);
  }, []);

  /* save (debounced) */
  useEffect(() => {
    if (!loaded) return;
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ tasks, events, settings }));
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      } catch {
        setSaveState("error");
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [tasks, events, settings, loaded]);

  /* scroll week view to work start on mount */
  useEffect(() => {
    if (scrollRef.current && (view === "week" || view === "day")) {
      scrollRef.current.scrollTop = Math.max(0, (settings.workStart / 60) * 48 - 60);
    }
  }, [view, loaded]); // eslint-disable-line

  const schedule = useMemo(() => scheduleTasks(tasks, events, settings, now), [tasks, events, settings, now]);

  const toggleTask = (id) =>
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done, completedAt: !t.done ? Date.now() : null } : t)));
  const deleteTask = (id) => setTasks((ts) => ts.filter((t) => t.id !== id));
  const addTask = () => {
    if (!newTask.title.trim()) return;
    setTasks((ts) => [
      ...ts,
      { id: uid(), title: newTask.title.trim(), duration: newTask.duration, deadline: newTask.deadline || null, priority: newTask.priority, done: false, createdAt: Date.now() },
    ]);
    setNewTask((p) => ({ ...p, title: "", deadline: "" }));
  };

  const saveEvent = (ev) => {
    setEvents((es) => {
      const i = es.findIndex((x) => x.id === ev.id);
      if (i === -1) return [...es, ev];
      const c = es.slice();
      c[i] = ev;
      return c;
    });
    setEventDraft(null);
  };
  const deleteEvent = (id) => {
    setEvents((es) => es.filter((e) => e.id !== id));
    setEventDraft(null);
  };

  /* items to render on the calendar for a given day key */
  const itemsForDay = useCallback(
    (key) => {
      const evs = events.filter((e) => e.date === key).map((e) => ({ ...e, kind: "event" }));
      const tks = tasks
        .filter((t) => !t.done && schedule[t.id]?.date === key)
        .map((t) => ({ ...t, kind: "task", start: schedule[t.id].start, end: schedule[t.id].end }));
      return [...evs, ...tks].sort((a, b) => a.start - b.start);
    },
    [events, tasks, schedule]
  );

  /* navigation */
  const shift = (dir) => {
    if (view === "month") {
      const d = new Date(anchor);
      d.setMonth(d.getMonth() + dir);
      setAnchor(d);
    } else setAnchor(addDays(anchor, dir * (view === "week" ? 7 : 1)));
  };

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const HOUR_H = 48;

  /* ---------- time-grid block ---------- */
  const Block = ({ item }) => {
    const isTask = item.kind === "task";
    const c = isTask ? TASK_COLOR : COLORS[item.color] || COLORS.blue;
    const overdue = isTask && item.deadline && schedule[item.id]?.date > item.deadline;
    return (
      <div
        onClick={() => !isTask && setEventDraft(item)}
        className="absolute left-0.5 right-1 rounded-md px-1.5 py-0.5 overflow-hidden cursor-pointer"
        style={{
          top: (item.start / 60) * HOUR_H,
          height: Math.max(((item.end - item.start) / 60) * HOUR_H - 2, 18),
          background: c.bg,
          borderLeft: `3px solid ${overdue ? "#ff453a" : c.border}`,
          borderStyle: isTask ? "none none none dashed" : "none none none solid",
          borderLeftStyle: isTask ? "dashed" : "solid",
          borderLeftWidth: 3,
          borderLeftColor: overdue ? "#ff453a" : c.border,
          zIndex: 2,
        }}
        title={isTask ? `Auto-scheduled task (${item.duration} min)` : item.title}
      >
        <div className="flex items-start gap-1">
          {isTask && <div className="mt-0.5"><Check checked={false} onToggle={() => toggleTask(item.id)} color={c.border} /></div>}
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate" style={{ color: c.text }}>{item.title}</div>
            {item.end - item.start >= 40 && (
              <div className="text-[10px] truncate" style={{ color: c.text, opacity: 0.75 }}>
                {toAmPm(item.start)} – {toAmPm(item.end)}{overdue ? " · past deadline" : ""}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ---------- week / day grid ---------- */
  const TimeGrid = ({ days }) => (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex border-b" style={{ borderColor: "#e5e5ea" }}>
        <div style={{ width: 52 }} />
        {days.map((d) => {
          const isToday = sameDay(d, now);
          const off = !settings.days.includes(d.getDay());
          return (
            <div key={dateKey(d)} className="flex-1 text-center py-1.5">
              <div className="text-[10px] uppercase tracking-wide" style={{ color: off ? "#c7c7cc" : "#8e8e93" }}>{DOW[d.getDay()]}</div>
              <div
                className="text-sm font-semibold inline-flex items-center justify-center rounded-full"
                style={{
                  width: 26, height: 26,
                  background: isToday ? "#ff3b30" : "transparent",
                  color: isToday ? "white" : off ? "#c7c7cc" : "#1c1c1e",
                }}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        <div className="flex relative" style={{ height: 24 * HOUR_H }}>
          <div style={{ width: 52 }} className="relative flex-shrink-0">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <div key={h} className="absolute right-1.5 text-[10px]" style={{ top: h * HOUR_H - 6, color: "#8e8e93" }}>
                {toAmPm(h * 60)}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const key = dateKey(d);
            const off = !settings.days.includes(d.getDay());
            return (
              <div key={key} className="flex-1 relative border-l" style={{ borderColor: "#ececf0" }}>
                {/* hour lines */}
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="absolute left-0 right-0 border-t" style={{ top: h * HOUR_H, borderColor: "#ececf0" }} />
                ))}
                {/* downtime shading */}
                {!off && (
                  <>
                    <div className="absolute left-0 right-0" style={{ top: 0, height: (settings.workStart / 60) * HOUR_H, background: "#f7f7f9" }} />
                    <div className="absolute left-0 right-0" style={{ top: (settings.workEnd / 60) * HOUR_H, bottom: 0, background: "#f7f7f9" }} />
                  </>
                )}
                {off && <div className="absolute inset-0" style={{ background: "#f7f7f9" }} />}
                {/* click to create event */}
                <div
                  className="absolute inset-0"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top + (scrollRef.current ? 0 : 0);
                    const m = Math.floor(((y / HOUR_H) * 60) / 30) * 30;
                    setEventDraft({ date: key, start: m, end: Math.min(m + 60, 24 * 60), color: "blue" });
                  }}
                />
                {itemsForDay(key).map((it) => <Block key={it.kind + it.id} item={it} />)}
                {/* now line */}
                {sameDay(d, now) && (
                  <div className="absolute left-0 right-0 flex items-center" style={{ top: (nowMin / 60) * HOUR_H, zIndex: 3 }}>
                    <div className="rounded-full" style={{ width: 7, height: 7, background: "#ff3b30", marginLeft: -3 }} />
                    <div className="flex-1" style={{ height: 1.5, background: "#ff3b30" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  /* ---------- month grid ---------- */
  const MonthGrid = () => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="grid grid-cols-7 border-b" style={{ borderColor: "#e5e5ea" }}>
          {DOW.map((d) => (
            <div key={d} className="text-center text-[10px] uppercase tracking-wide py-1" style={{ color: "#8e8e93" }}>{d}</div>
          ))}
        </div>
        <div className="flex-1 grid grid-cols-7 overflow-y-auto" style={{ gridAutoRows: "minmax(84px, 1fr)" }}>
          {cells.map((d) => {
            const key = dateKey(d);
            const inMonth = d.getMonth() === anchor.getMonth();
            const isToday = sameDay(d, now);
            const items = itemsForDay(key);
            return (
              <div
                key={key}
                className="border-b border-l p-1 cursor-pointer overflow-hidden"
                style={{ borderColor: "#ececf0", background: inMonth ? "white" : "#fafafa" }}
                onClick={() => { setAnchor(d); setView("day"); }}
              >
                <div
                  className="text-xs font-medium inline-flex items-center justify-center rounded-full mb-0.5"
                  style={{
                    width: 20, height: 20,
                    background: isToday ? "#ff3b30" : "transparent",
                    color: isToday ? "white" : inMonth ? "#1c1c1e" : "#c7c7cc",
                  }}
                >
                  {d.getDate()}
                </div>
                {items.slice(0, 3).map((it) => {
                  const c = it.kind === "task" ? TASK_COLOR : COLORS[it.color] || COLORS.blue;
                  return (
                    <div key={it.kind + it.id} className="truncate rounded px-1 mb-0.5 text-[10px] font-medium" style={{ background: c.bg, color: c.text }}>
                      {it.kind === "task" ? "◌ " : ""}{it.title}
                    </div>
                  );
                })}
                {items.length > 3 && <div className="text-[10px]" style={{ color: "#8e8e93" }}>+{items.length - 3} more</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ---------- header title ---------- */
  const title = view === "month"
    ? `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
    : view === "day"
      ? `${MONTHS[anchor.getMonth()]} ${anchor.getDate()}, ${anchor.getFullYear()}`
      : (() => {
          const ws = startOfWeek(anchor);
          const we = addDays(ws, 6);
          return ws.getMonth() === we.getMonth()
            ? `${MONTHS[ws.getMonth()]} ${ws.getFullYear()}`
            : `${MONTHS[ws.getMonth()].slice(0, 3)} – ${MONTHS[we.getMonth()].slice(0, 3)} ${we.getFullYear()}`;
        })();

  const pendingTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  if (!loaded) {
    return (
      <div className="h-screen flex items-center justify-center text-sm" style={{ color: "#8e8e93", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        Loading your planner…
      </div>
    );
  }

  return (
    <div className="h-screen flex" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#f2f2f7" }}>
      {/* ---------- sidebar: checklist ---------- */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r bg-white" style={{ borderColor: "#e5e5ea" }}>
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h2 className="font-bold text-lg" style={{ color: "#1c1c1e" }}>Tasks</h2>
          <span className="text-[10px]" style={{ color: saveState === "error" ? "#ff3b30" : "#c7c7cc" }}>
            {saveState === "saving" ? "saving…" : saveState === "saved" ? "saved" : saveState === "error" ? "save failed" : ""}
          </span>
        </div>

        {/* add task */}
        <div className="px-4 pb-3">
          <input
            value={newTask.title}
            onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="New task…"
            className="w-full rounded-lg px-3 py-2 text-sm mb-2"
            style={{ background: "#f2f2f7", border: "1px solid transparent", outline: "none" }}
          />
          <div className="flex gap-1.5 items-center">
            <select
              value={newTask.duration}
              onChange={(e) => setNewTask((p) => ({ ...p, duration: Number(e.target.value) }))}
              className="border rounded-md px-1.5 py-1 text-xs bg-white flex-1"
              style={{ borderColor: "#d9d9de" }}
            >
              {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => (
                <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? "s" : ""}`}</option>
              ))}
            </select>
            <select
              value={newTask.priority}
              onChange={(e) => setNewTask((p) => ({ ...p, priority: Number(e.target.value) }))}
              className="border rounded-md px-1.5 py-1 text-xs bg-white"
              style={{ borderColor: "#d9d9de" }}
            >
              <option value={1}>High</option>
              <option value={2}>Med</option>
              <option value={3}>Low</option>
            </select>
            <input
              type="date"
              value={newTask.deadline}
              onChange={(e) => setNewTask((p) => ({ ...p, deadline: e.target.value }))}
              className="border rounded-md px-1 py-1 text-xs bg-white"
              style={{ borderColor: "#d9d9de", width: 108 }}
              title="Deadline (optional)"
            />
            <button onClick={addTask} className="rounded-lg text-white font-bold text-sm px-2.5 py-1" style={{ background: "#0a84ff" }}>+</button>
          </div>
        </div>

        {/* pending list */}
        <div className="flex-1 overflow-y-auto px-2">
          {pendingTasks.length === 0 && (
            <p className="text-xs text-center mt-6 px-4" style={{ color: "#8e8e93" }}>
              No tasks yet. Add one above and it lands in your next free slot automatically.
            </p>
          )}
          {pendingTasks.map((t) => {
            const slot = schedule[t.id];
            const overdue = slot && t.deadline && slot.date > t.deadline;
            return (
              <div key={t.id} className="group flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-gray-50">
                <div className="mt-0.5"><Check checked={false} onToggle={() => toggleTask(t.id)} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "#1c1c1e" }}>{t.title}</div>
                  <div className="text-[11px]" style={{ color: overdue ? "#ff3b30" : "#8e8e93" }}>
                    {slot
                      ? `${sameDay(parseKey(slot.date), now) ? "Today" : `${DOW[parseKey(slot.date).getDay()]} ${parseKey(slot.date).getDate()}`} · ${toAmPm(slot.start)}`
                      : "No free slot found"}
                    {" · "}{t.duration < 60 ? `${t.duration}m` : `${t.duration / 60}h`}
                    {t.priority === 1 ? " · !" : ""}
                    {overdue ? " · past deadline" : ""}
                  </div>
                </div>
                <button onClick={() => deleteTask(t.id)} className="opacity-0 group-hover:opacity-100 text-xs px-1" style={{ color: "#c7c7cc" }} aria-label="Delete task">✕</button>
              </div>
            );
          })}

          {doneTasks.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-wide px-2 mt-3 mb-1" style={{ color: "#8e8e93" }}>Completed</div>
              {doneTasks.slice(0, 15).map((t) => (
                <div key={t.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                  <Check checked onToggle={() => toggleTask(t.id)} color="#30d158" />
                  <div className="flex-1 text-sm truncate line-through" style={{ color: "#b8b8bf" }}>{t.title}</div>
                  <button onClick={() => deleteTask(t.id)} className="opacity-0 group-hover:opacity-100 text-xs px-1" style={{ color: "#c7c7cc" }} aria-label="Delete task">✕</button>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t" style={{ borderColor: "#e5e5ea" }}>
          <button onClick={() => setShowSettings(true)} className="text-xs font-medium" style={{ color: "#0a84ff" }}>
            ⚙ Scheduling hours: {toAmPm(settings.workStart)} – {toAmPm(settings.workEnd)}
          </button>
        </div>
      </div>

      {/* ---------- calendar ---------- */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: "#e5e5ea" }}>
          <h1 className="font-bold text-lg mr-2" style={{ color: "#1c1c1e" }}>{title}</h1>
          <div className="flex rounded-lg overflow-hidden text-xs font-medium" style={{ background: "#f2f2f7" }}>
            {["day", "week", "month"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-3 py-1.5 capitalize"
                style={{ background: view === v ? "white" : "transparent", color: view === v ? "#1c1c1e" : "#8e8e93", boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.08)" : "none", borderRadius: 7, margin: 2 }}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button onClick={() => shift(-1)} className="px-2 py-1 text-sm rounded-md" style={{ color: "#0a84ff" }} aria-label="Previous">‹</button>
          <button onClick={() => setAnchor(new Date())} className="px-2.5 py-1 text-xs font-medium rounded-md" style={{ color: "#0a84ff" }}>Today</button>
          <button onClick={() => shift(1)} className="px-2 py-1 text-sm rounded-md" style={{ color: "#0a84ff" }} aria-label="Next">›</button>
          <button
            onClick={() => setEventDraft({ date: dateKey(anchor), start: Math.min(Math.ceil(nowMin / 30) * 30, 23 * 60), end: Math.min(Math.ceil(nowMin / 30) * 30 + 60, 24 * 60), color: "blue" })}
            className="ml-1 rounded-lg text-white font-semibold text-xs px-3 py-1.5"
            style={{ background: "#0a84ff" }}
          >
            + Event
          </button>
        </div>

        {view === "month" && <MonthGrid />}
        {view === "week" && <TimeGrid days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))} />}
        {view === "day" && <TimeGrid days={[anchor]} />}

        <div className="px-4 py-1.5 border-t flex items-center gap-4 text-[11px]" style={{ borderColor: "#e5e5ea", color: "#8e8e93" }}>
          <span className="flex items-center gap-1"><span className="inline-block rounded-sm" style={{ width: 10, height: 10, background: COLORS.blue.bg, borderLeft: `3px solid ${COLORS.blue.border}` }} /> Fixed event</span>
          <span className="flex items-center gap-1"><span className="inline-block rounded-sm" style={{ width: 10, height: 10, background: TASK_COLOR.bg, borderLeft: `3px dashed ${TASK_COLOR.border}` }} /> Auto-scheduled task (moves itself until you check it off)</span>
          <span className="flex items-center gap-1"><span className="inline-block" style={{ width: 10, height: 10, background: "#f7f7f9", border: "1px solid #ececf0" }} /> Downtime — never scheduled</span>
        </div>
      </div>

      {eventDraft && <EventModal draft={eventDraft} onSave={saveEvent} onDelete={deleteEvent} onClose={() => setEventDraft(null)} />}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(s) => { setSettings(s); setShowSettings(false); }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
