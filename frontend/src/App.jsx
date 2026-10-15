import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCircle2, Clock3, Command,
  Focus, LayoutGrid, ListTodo, Menu, Plus, RotateCcw, Sparkles,
  Trash2, X
} from "lucide-react";
import "./App.css";
import { api } from "./lib/api";
import { formatDateTime } from "./lib/taskAdapter";

const navItems = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "tasks", label: "My tasks", icon: ListTodo },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "rescue", label: "Deadline rescue", icon: RotateCcw },
  { id: "alexa", label: "Alexa+ simulator", icon: Sparkles },
];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function Intro({ onEnter }) {
  const [awake, setAwake] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAwake(true), 120);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className={`intro ${awake ? "intro-awake" : ""}`}>
      <div className="intro-photo" />
      <div className="intro-shade" />

      <div className="intro-top">
        <span className="intro-wordmark">deadline<span>.</span></span>
        <span className="intro-edition">A LITTLE MORE ROOM TO BREATHE</span>
      </div>

      <section className="intro-main">
        <div className="intro-copy">
          <p className="eyebrow intro-reveal intro-reveal-1">
            <span className="eyebrow-line" />
            WHEN LIFE GETS AHEAD OF YOU
          </p>

          <h1 className="intro-reveal intro-reveal-2">
            When plans change,<br />
            find your <em>rhythm.</em>
          </h1>

          <p className="intro-description intro-reveal intro-reveal-3">
            A calmer way to reclaim your time, reset your priorities,
            and find the next right thing.
          </p>

          <button className="intro-button intro-reveal intro-reveal-4" onClick={onEnter}>
            Enter Deadline Rescue <ArrowUpRight size={17} />
          </button>

          <p className="intro-note intro-reveal intro-reveal-5">
            Less overwhelm. More intention.
          </p>
        </div>
      </section>

      <footer className="intro-footer">
        <span>MAKE SPACE FOR WHAT MATTERS</span>
        <span>YOUR DAY, REIMAGINED <ArrowRight size={13} /></span>
      </footer>
    </main>
  );
}

function Sidebar({ page, setPage, onClose }) {
  return (
    <aside className="sidebar">
      <div className="side-brand">
        <span className="brand-symbol">d.</span>
        <span>deadline<span className="brand-period">.</span><small>YOUR PERSONAL RESET</small></span>
        <button className="mobile-close" onClick={onClose} aria-label="Close menu"><X size={19} /></button>
      </div>

      <p className="side-label">WORKSPACE</p>
      <nav className="side-nav">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`nav-item ${page === id ? "selected" : ""}`} onClick={() => { setPage(id); onClose(); }}>
            <Icon size={17} strokeWidth={1.7} />
            <span>{label}</span>
            {id === "rescue" && <span className="nav-spark"><Sparkles size={13} /></span>}
          </button>
        ))}
      </nav>

      <div className="side-bottom">
        <div className="side-quote">
          <span className="quote-mark">“</span>
          <p>You don't have to do it all. You just have to choose what matters next.</p>
          <span className="quote-caption">A GENTLER WAY FORWARD</span>
        </div>
        <div className="profile">
          <div className="profile-avatar">D</div>
          <div><strong>Your workspace</strong><small>Personal edition</small></div>
          <span className="profile-dot" />
        </div>
      </div>
    </aside>
  );
}

function Header({ page, onMenu, onAdd }) {
  const titles = {
    overview: ["Your overview", "A fresh look at what matters today."],
    tasks: ["My tasks", "One thing at a time. You've got this."],
    schedule: ["Your schedule", "Make room for the important things."],
    rescue: ["Let's reset", "Plans changed. You still have options."],
    alexa: ["Alexa+ simulator", "A real MCP client, running in your browser."],
  };
  return (
    <header className="app-header">
      <button className="mobile-menu" onClick={onMenu} aria-label="Open menu"><Menu size={21} /></button>
      <div className="header-title"><h2>{titles[page][0]}</h2><p>{titles[page][1]}</p></div>
      <button className="header-add" onClick={onAdd}><Plus size={17} /> <span>New task</span></button>
    </header>
  );
}

function TaskRow({ task, onToggle, onDelete }) {
  return (
    <article className={`task-row ${task.done ? "task-done" : ""}`}>
      <button className={`task-check ${task.done ? "checked" : ""}`} onClick={() => onToggle(task.id)} aria-label={task.done ? "Mark incomplete" : "Mark complete"}>
        {task.done && <Check size={14} />}
      </button>
      <div className="task-main">
        <strong>{task.title}</strong>
        <span>{task.project} <i /> {task.minutes} min</span>
      </div>
      <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
      <div className="task-date"><CalendarDays size={13} /> {task.date.slice(5).replace("-", "/")}</div>
      <button className="task-delete" onClick={() => onDelete(task.id)} aria-label="Delete task"><Trash2 size={15} /></button>
    </article>
  );
}

function AddTaskModal({ onClose, onAdd }) {
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("Personal");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("16:00");
  const [minutes, setMinutes] = useState("45");
  const [priority, setPriority] = useState("Medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      await onAdd({ title: title.trim(), project, date, time, minutes: Math.max(5, Number(minutes) || 45), priority, done: false });
      onClose();
    } catch (requestError) {
      setError(requestError.message || "We couldn't save that task. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="task-modal" onSubmit={submit}>
        <div className="modal-head"><div><span className="eyebrow">MAKE A LITTLE SPACE</span><h2>A new task.</h2></div><button type="button" className="modal-close" onClick={onClose}><X size={19} /></button></div>
        <label>What needs doing?<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give your task a name…" required /></label>
        <div className="form-grid">
          <label>Project<select value={project} onChange={(e) => setProject(e.target.value)}><option>Personal</option><option>College</option><option>Academics</option><option>Deadline Rescue</option><option>Work</option></select></label>
          <label>Priority<select value={priority} onChange={(e) => setPriority(e.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label>
          <label>Due date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          <label>Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
          <label className="full-field">Estimated time (minutes)<input type="number" min="5" step="5" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button-quiet" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="button-dark" disabled={saving}><Plus size={16} /> {saving ? "Saving…" : "Add task"}</button></div>
      </form>
    </div>
  );
}

function Overview({ tasks, setPage, onAdd, onToggle, onDelete }) {
  const open = tasks.filter(t => !t.done);
  const completed = tasks.filter(t => t.done);
  const totalMinutes = open.reduce((sum, t) => sum + Number(t.minutes), 0);
  const nextTasks = [...open]
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
    .slice(0, 4);
  const completion = tasks.length
    ? Math.round(completed.length / tasks.length * 100)
    : 0;

  const formattedTime = totalMinutes >= 60
    ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60 ? `${totalMinutes % 60}m` : ""}`
    : `${totalMinutes}m`;

  return (
    <div className="editorial-overview">
      <section className="welcome-panel editorial-welcome">
        <div className="welcome-copy">
          <span className="eyebrow">
            <span className="eyebrow-line" /> A FRESH PERSPECTIVE
          </span>
          <h1>There's still time<br />to make it <em>count.</em></h1>
          <p>You don't need a perfect plan. Just a good next step.</p>
          <button className="editorial-link" onClick={() => setPage("rescue")}>
            Find my next move <ArrowRight size={16} />
          </button>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="sun-disc" />
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-leaf leaf-one" />
          <div className="art-leaf leaf-two" />
          <div className="art-leaf leaf-three" />
          <span className="art-note">ONE THING<br />AT A TIME</span>
        </div>
      </section>

      <section className="editorial-metrics" aria-label="Your progress">
        <div className="metric">
          <span className="eyebrow">IN PROGRESS</span>
          <strong>{String(open.length).padStart(2, "0")}</strong>
          <small>Things to move forward</small>
        </div>
        <div className="metric">
          <span className="eyebrow">TIME TO PLAN FOR</span>
          <strong>{formattedTime}</strong>
          <small>Across your open tasks</small>
        </div>
        <div className="metric metric-completion">
          <span className="eyebrow">ALREADY DONE</span>
          <strong>{completion}<span className="stat-percent">%</span></strong>
          <div className="editorial-progress" aria-label={`${completion}% completed`}>
            <span style={{ width: `${completion}%` }} />
          </div>
        </div>
      </section>

      <section className="editorial-work">
        <div className="editorial-task-column">
          <div className="editorial-section-heading">
            <div>
              <span className="eyebrow">THE IMPORTANT THINGS</span>
              <h2>On your plate<span>.</span></h2>
            </div>
            <button className="editorial-link subtle-link" onClick={() => setPage("tasks")}>
              All tasks <ArrowUpRight size={15} />
            </button>
          </div>

          {nextTasks.length ? (
            <div className="task-list editorial-task-list">
              {nextTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  onDelete={onDelete}
                />
              ))}
            </div>
          ) : (
            <EmptyState text="A little breathing room. Add a task when you're ready." />
          )}

          <button className="editorial-add" onClick={onAdd}>
            <Plus size={16} /> Add something to your list
          </button>
        </div>

        <aside className="editorial-reset">
          <span className="eyebrow">WHEN PLANS CHANGE</span>
          <div className="editorial-reset-art" aria-hidden="true">
            <div className="editorial-reset-orbit">
              <RotateCcw size={27} strokeWidth={1.2} />
            </div>
            <span>✳</span>
          </div>
          <h2>Begin again,<br /><em>gently.</em></h2>
          <p>Let's make sense of the time you have and decide what matters most.</p>
          <button className="editorial-link" onClick={() => setPage("rescue")}>
            Reset my plan <ArrowRight size={15} />
          </button>
        </aside>
      </section>
    </div>
  );
}

function TasksPage({ tasks, onToggle, onDelete, onAdd }) {
  const [filter, setFilter] = useState("all");
  const filtered = tasks.filter(t => filter === "all" || (filter === "open" ? !t.done : t.done));
  return <section className="page-card">
    <div className="page-intro"><span className="eyebrow">YOUR OWN PACE</span><h1>Small steps add <em>up.</em></h1><p>Keep the list honest. Every completed task is progress.</p></div>
    <div className="filter-row">{[["all", "Everything"], ["open", "In progress"], ["done", "Completed"]].map(([id, label]) => <button key={id} className={`filter-chip ${filter === id ? "active" : ""}`} onClick={() => setFilter(id)}>{label}<span>{id === "all" ? tasks.length : id === "open" ? tasks.filter(t => !t.done).length : tasks.filter(t => t.done).length}</span></button>)}</div>
    {filtered.length ? <div className="task-list large-list">{filtered.map(t => <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} />)}</div> : <EmptyState text="Nothing here just yet. That's okay." />}
    <button className="button-dark add-page-button" onClick={onAdd}><Plus size={16} /> Add a task</button>
  </section>;
}

function SchedulePage({ tasks }) {
  const [available, setAvailable] = useState("240");
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const taskSignature = tasks.map((task) => `${task.id}:${task.done}:${task.minutes}:${task.deadline}`).join("|");

  const loadPlan = useCallback(async () => {
    const minutes = Math.max(0, Number(available) || 0);
    setLoading(true);
    setError("");
    try {
      setPlan(await api.getSchedule(minutes));
    } catch (requestError) {
      setError(requestError.message || "We couldn't build your schedule.");
    } finally {
      setLoading(false);
    }
  }, [available]);

  useEffect(() => { loadPlan(); }, [loadPlan, taskSignature]);

  const schedule = plan?.schedule || [];
  const unscheduled = plan?.unscheduled || [];

  return <section className="page-card">
    <div className="page-intro"><span className="eyebrow">A LITTLE STRUCTURE</span><h1>Make room for <em>life.</em></h1><p>A live, deadline-aware plan built from your saved tasks.</p></div>
    <div className="planner-controls">
      <label>Focused time available<input type="number" min="0" step="15" value={available} onChange={(event) => setAvailable(event.target.value)} /><span>minutes</span></label>
      <button className="button-dark" onClick={loadPlan} disabled={loading}>{loading ? "Planning…" : "Refresh plan"} <ArrowRight size={15} /></button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loading && !error && schedule.length === 0 && unscheduled.length === 0 && <EmptyState text="Your schedule is open. Add a task to begin." />}
    {schedule.length > 0 && <div className="schedule-list">{schedule.map((item) => <div className="schedule-day" key={`${item.task_id}-${item.start}`}><div className="schedule-date"><span>FOCUS</span><strong>{item.duration_minutes}</strong><small>MIN</small></div><div className="schedule-items"><div className="schedule-item"><span className="schedule-time">{new Date(item.start).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}</span><span className="schedule-dot" /><div><strong>{item.title}</strong><small>{formatDateTime(item.start)} — {formatDateTime(item.end)}</small></div><span className={`priority priority-${item.priority.toLowerCase()}`}>{item.priority}</span></div></div></div>)}</div>}
    {unscheduled.length > 0 && <div className="deferred-block"><span className="eyebrow">SAVE FOR LATER</span><h3>{unscheduled.length} task{unscheduled.length === 1 ? "" : "s"} need another window.</h3>{unscheduled.map((item) => <p key={item.task.id}><strong>{item.task.title}</strong> — {item.reason}</p>)}</div>}
    {plan && <p className="plan-summary"><Clock3 size={15} /> {plan.scheduled_minutes} of {plan.available_minutes} minutes planned · {plan.remaining_minutes} minutes still open</p>}
  </section>;
}

function RescuePage({ setPage }) {
  const [available, setAvailable] = useState("120");
  const [disruption, setDisruption] = useState("0");
  const [recovery, setRecovery] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadHistory = useCallback(async () => {
    try { setHistory(await api.getRecoveryHistory()); } catch { setHistory([]); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function buildRecovery() {
    setLoading(true);
    setError("");
    try {
      const result = await api.recover(Math.max(0, Number(available) || 0), Math.max(0, Number(disruption) || 0));
      setRecovery(result);
      await loadHistory();
    } catch (requestError) {
      setError(requestError.message || "We couldn't rebuild your plan.");
    } finally {
      setLoading(false);
    }
  }

  const schedule = recovery?.schedule?.schedule || [];
  const deferred = recovery?.schedule?.unscheduled || [];
  const risks = recovery?.deadline_risks || [];

  return <section className="page-card rescue-page">
    <div className="page-intro"><span className="eyebrow"><Sparkles size={13} /> YOUR RESET MOMENT</span><h1>Let's find your <em>next move.</em></h1><p>When the plan falls apart, start with what you actually have.</p></div>
    <div className="rescue-layout">
      <div className="rescue-form">
        <span className="eyebrow">01 — YOUR REALITY</span>
        <h3>Let's start with today.</h3>
        <label>How much focused time did you have?<div className="time-input"><Clock3 size={17} /><input type="number" min="0" step="15" value={available} onChange={e => setAvailable(e.target.value)} /><span>minutes</span></div></label>
        <label>How much time did the disruption take?<div className="time-input"><RotateCcw size={17} /><input type="number" min="0" step="5" value={disruption} onChange={e => setDisruption(e.target.value)} /><span>minutes</span></div></label>
        <p className="form-hint"><Focus size={15} /> Your saved tasks are replanned by deadline, priority, and the time left after the interruption.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button-dark generate-button" onClick={buildRecovery} disabled={loading}><Sparkles size={16} /> {loading ? "Rebuilding…" : "Build my recovery plan"} <ArrowRight size={16} /></button>
        {history.length > 0 && <p className="history-note">Last reset: {history[0].disruption_minutes} minutes lost · {history[0].scheduled_count} task{history[0].scheduled_count === 1 ? "" : "s"} replanned</p>}
      </div>
      <div className="rescue-preview">
        <div className="preview-top"><span className="eyebrow">02 — YOUR RESET PLAN</span><span className="preview-stamp">A FRESH START</span></div>
        {!recovery ? <div className="preview-empty"><div className="preview-sun">✳</div><h3>Progress, not perfection.</h3><p>Your plan will appear here. We'll make the most of the time you have.</p><span>YOU'RE ALLOWED TO BEGIN AGAIN</span></div> : <>
          <h3 className="plan-heading">{schedule.length ? "Here's a place to start." : "Let's make this smaller."}</h3>
          <p className="plan-description">{recovery.available_minutes_after_disruption} minutes remain after the interruption. This plan is saved so future sessions can retain the recovery context.</p>
          <div className="plan-items">{schedule.map((item, index) => <div className="plan-item" key={`${item.task_id}-${item.start}`}><span className="plan-number">0{index + 1}</span><div><strong>{item.title}</strong><small>{item.duration_minutes} minutes · {item.priority} priority</small></div><CheckCircle2 size={17} /></div>)}</div>
          {!schedule.length && <p className="no-fit">No task fits this time window. Try adding time or choosing one small task to start.</p>}
          {deferred.length > 0 && <div className="recovery-deferred">
            <span className="eyebrow">A GENTLER NEXT STEP</span>
            <h4>{deferred.length} task{deferred.length === 1 ? "" : "s"} to revisit</h4>
            {deferred.map((item) => {
              const minutesNeeded = Number(item.task?.estimated_minutes) || 0;
              const reason = item.reason || "This task could not be scheduled.";
              const shortfall = minutesNeeded - (Number(recovery.available_minutes_after_disruption) || 0);
              const needsMoreTime = reason.toLowerCase().includes("insufficient available time");
              return <div className="recovery-deferred-item" key={item.task.id}>
                <strong>{item.task.title}</strong>
                <p>{reason}</p>
                {needsMoreTime && minutesNeeded > 0 && <>
                  <small>Estimated focus time: {minutesNeeded} minutes.</small>
                  {schedule.length === 0 && shortfall > 0 && <small>You are {shortfall} minutes short of fitting this task into the available window.</small>}
                </>}
              </div>;
            })}
            <p className="recovery-kindness">You don't have to do everything at once. Choose a longer window or come back to this task later.</p>
          </div>}
          {risks.length > 0 && <div className="risk-note"><strong>{risks.length} deadline risk{risks.length === 1 ? "" : "s"}</strong>{risks.slice(0, 2).map((risk) => <span key={risk.task_id}>{risk.title}: {risk.reason}</span>)}</div>}
          <div className="plan-footer"><span><Clock3 size={15} /> {recovery.schedule.scheduled_minutes} of {recovery.available_minutes_after_disruption} minutes planned</span><button className="text-link" onClick={() => setPage("tasks")}>Review tasks <ArrowUpRight size={14} /></button></div>
        </>}
      </div>
    </div>
  </section>;
}

function AlexaSimulatorPage() {
  const [connection, setConnection] = useState(null);
  const [activity, setActivity] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setLoading(true);
    setError("");
    try {
      const session = await api.initializeMcp();
      setConnection(session);
      setActivity([
        "initialize → MCP 2025-11-25",
        "notifications/initialized → accepted",
        `tools/list → ${session.tools.length} callable tools`,
      ]);
      return session;
    } catch (requestError) {
      setError(requestError.message || "The MCP server could not be reached.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function callTool(name, arguments_, label) {
    setLoading(true);
    setError("");
    try {
      const session = connection || await connect();
      if (!session) return;
      const response = await api.callMcpTool(name, arguments_);
      setResult(response.structuredContent || {});
      setActivity((previous) => [...previous.slice(-4), `tools/call → ${label}`]);
    } catch (requestError) {
      setError(requestError.message || "That MCP tool call failed.");
    } finally {
      setLoading(false);
    }
  }

  return <section className="page-card alexa-page">
    <div className="page-intro"><span className="eyebrow"><Sparkles size={13} /> ALEXA+ TRACK DEMO</span><h1>A calmer plan, <em>on call.</em></h1><p>This browser page is a transparent, local simulation client. It performs the real MCP handshake and tool calls against Deadline Rescue.</p></div>
    <div className="mcp-status"><div><span className="eyebrow">CONNECTION</span><h3>{connection ? "MCP server connected" : "Ready to connect"}</h3><p>{connection ? `${connection.server.serverInfo.name} · ${connection.server.protocolVersion} · ${connection.tools.length} tools available` : "Connect to inspect the server’s live tool catalog."}</p></div><button className="button-dark" onClick={connect} disabled={loading}>{loading ? "Connecting…" : connection ? "Reconnect" : "Connect simulator"} <ArrowRight size={15} /></button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="simulator-grid">
      <div className="simulator-actions"><span className="eyebrow">TRY A REAL TOOL CALL</span><h3>What would you like to recover?</h3><button onClick={() => callTool("get_deadline_risks", {}, "check deadline risks")} disabled={loading}>What needs attention? <ArrowRight size={15} /></button><button onClick={() => callTool("build_focus_plan", { available_minutes: 120 }, "build a 120-minute focus plan")} disabled={loading}>Plan my next 2 hours <ArrowRight size={15} /></button><button onClick={() => callTool("recover_from_disruption", { available_minutes: 180, disruption_minutes: 45 }, "recover from a 45-minute disruption")} disabled={loading}>I lost 45 minutes <ArrowRight size={15} /></button><button onClick={() => callTool("get_recovery_history", { limit: 3 }, "read saved recovery context")} disabled={loading}>What changed earlier? <ArrowRight size={15} /></button></div>
      <div className="simulator-result"><div className="preview-top"><span className="eyebrow">LIVE PROTOCOL RESULT</span><span className="preview-stamp">MCP</span></div>{result ? <pre>{JSON.stringify(result, null, 2)}</pre> : <div className="preview-empty"><div className="preview-sun">✳</div><h3>Ready when you are.</h3><p>Connect, then call a tool. The response below is returned by the persistent planning server.</p><span>NO ALEXA+ DEVICE REQUIRED</span></div>}</div>
    </div>
    {activity.length > 0 && <div className="protocol-log"><span className="eyebrow">PROTOCOL TRACE</span>{activity.map((entry, index) => <p key={`${entry}-${index}`}>{String(index + 1).padStart(2, "0")} <i /> {entry}</p>)}</div>}
    <p className="simulator-disclosure">This is not connected to a consumer Alexa+ device or Amazon’s gated preview tools. It is a self-hosted MCP server and a web-based simulator, which is an allowed Alexa+ hackathon path.</p>
  </section>;
}

function EmptyState({ text }) {
  return <div className="empty-state"><div className="empty-icon"><ListTodo size={22} /></div><p>{text}</p></div>;
}

export default function App() {
  const [entered, setEntered] = useState(false);
  const [page, setPage] = useState("overview");
  const [tasks, setTasks] = useState([]);
  const [modal, setModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dataError, setDataError] = useState("");

  const refreshTasks = useCallback(async () => {
    try {
      setDataError("");
      setTasks(await api.listTasks());
    } catch (requestError) {
      setDataError(requestError.message || "Deadline Rescue could not load your saved tasks.");
    }
  }, []);

  useEffect(() => { refreshTasks(); }, [refreshTasks]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { setModal(false); setMenuOpen(false); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setModal(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function addTask(task) {
    const created = await api.createTask(task);
    setTasks(old => [...old, created].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)));
  }
  async function toggleTask(id) {
    const current = tasks.find((task) => task.id === id);
    if (!current) return;
    try {
      const updated = await api.updateTask(id, { completed: !current.done });
      setTasks(old => old.map(t => t.id === id ? updated : t));
    } catch (requestError) {
      setDataError(requestError.message || "We couldn't update that task.");
    }
  }
  async function deleteTask(id) {
    try {
      await api.deleteTask(id);
      setTasks(old => old.filter(t => t.id !== id));
    } catch (requestError) {
      setDataError(requestError.message || "We couldn't delete that task.");
    }
  }

  if (!entered) return <Intro onEnter={() => setEntered(true)} />;

  return (
    <div className="app-shell">
      {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
      <div className={menuOpen ? "sidebar-wrap menu-open" : "sidebar-wrap"}><Sidebar page={page} setPage={setPage} onClose={() => setMenuOpen(false)} /></div>
      <main className="main-panel">
        <Header page={page} onMenu={() => setMenuOpen(true)} onAdd={() => setModal(true)} />
        <div className="page-content" key={page}>
          {dataError && <p className="app-error" role="alert">{dataError} <button onClick={refreshTasks}>Try again</button></p>}
          {page === "overview" && <Overview tasks={tasks} setPage={setPage} onAdd={() => setModal(true)} onToggle={toggleTask} onDelete={deleteTask} />}
          {page === "tasks" && <TasksPage tasks={tasks} onToggle={toggleTask} onDelete={deleteTask} onAdd={() => setModal(true)} />}
          {page === "schedule" && <SchedulePage tasks={tasks} />}
          {page === "rescue" && <RescuePage setPage={setPage} />}
          {page === "alexa" && <AlexaSimulatorPage />}
          <footer className="app-footer"><span>DEADLINE RESCUE <i /> MADE FOR REAL LIFE</span><span><Command size={12} /> + K TO ADD A TASK</span></footer>
        </div>
      </main>
      {modal && <AddTaskModal onClose={() => setModal(false)} onAdd={addTask} />}
    </div>
  );
}
