import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, ArrowUpRight, Bell, Bot, Brain, CalendarDays, ChartColumn, Check, CheckCircle2,
  Clock3, Command, EllipsisVertical, Flag, Folder, History, House, LifeBuoy, ListTodo, Menu, Mic,
  Moon, Pause, Play, Plus, RotateCcw, Search, Send, Settings, Sparkle, Sparkles, SquarePen,
  StickyNote, Sun, Target, Trash2, TrendingUp, TriangleAlert, Volume2, VolumeX, X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";
import "./assistant.css";
import { api, apiBaseUrl } from "./lib/api";
import { apiTaskToView, formatDateTime } from "./lib/taskAdapter";

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

// There is no profile endpoint in the backend, so the person shown in the
// greeting and sidebar lives here. Edit these two values to change it.
const PROFILE = { name: "Manoj", role: "Student · CSE" };

const CHAT_KEY = "edith-chat-history-v1";
const MINUTES_KEY = "edith-available-minutes";
const SCENE_KEY = "edith-scene";
const LEGACY_GREETING =
  "Hey, I’m EDITH. What would you like to get done? I can help plan your time, organize tasks, check deadlines, and save notes you ask me to remember.";

const NAV = [
  { id: "overview", label: "Overview", icon: House },
  { id: "tasks", label: "My Tasks", icon: ListTodo },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "focus", label: "Focus Mode", icon: Target },
  { id: "rescue", label: "Deadline Rescue", icon: LifeBuoy },
  { id: "projects", label: "Projects", icon: Folder },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "analytics", label: "Analytics", icon: ChartColumn },
  { id: "studio", label: "EDITH Studio", icon: Sparkles },
];

const PAGE_TITLES = {
  tasks: ["My Tasks", "One thing at a time. You've got this."],
  schedule: ["Schedule", "Make room for the important things."],
  focus: ["Focus Mode", "One task, one timer, no noise."],
  rescue: ["Deadline Rescue", "When the plan falls apart, start with what you actually have."],
  projects: ["Projects", "Every task, grouped by where it belongs."],
  notes: ["Notes", "Things EDITH remembers for you."],
  analytics: ["Analytics", "What your saved tasks say about your week."],
  studio: ["EDITH Studio", "Conversation, memory and the Alexa+ simulator."],
};

const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;

const QUOTES = [
  "A focused hour today saves a stressful tomorrow.",
  "One honest hour beats three anxious ones.",
  "Start with the task you keep avoiding.",
  "Progress is quieter than panic, and it lasts longer.",
];

const PRIORITY_RANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => localDate(new Date());
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `m-${Date.now()}-${Math.random().toString(16).slice(2)}`);

const dueMs = (task) => {
  const value = new Date(task.deadline).getTime();
  return Number.isNaN(value) ? Infinity : value;
};
const byDeadline = (a, b) => {
  const x = dueMs(a);
  const y = dueMs(b);
  return x === y ? 0 : x < y ? -1 : 1;
};

const startOfDay = (ms) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const calendarDaysBetween = (fromMs, toMs) => Math.round((startOfDay(toMs) - startOfDay(fromMs)) / DAY);

function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 180) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatClock(ms) {
  return new Date(ms).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
}

function formatTimer(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

function relativeDay(ms, nowMs) {
  const diff = calendarDaysBetween(nowMs, ms);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return new Date(ms).toLocaleDateString("en", { weekday: "long" });
  return new Date(ms).toLocaleDateString("en", { month: "short", day: "numeric" });
}

function dueLabel(task, nowMs) {
  const ms = dueMs(task);
  if (!Number.isFinite(ms)) return "No date";
  return `${relativeDay(ms, nowMs)}, ${formatClock(ms)}`;
}

function countdown(task, nowMs) {
  const ms = dueMs(task);
  if (!Number.isFinite(ms)) return { label: "No date", tone: "calm" };
  const diff = ms - nowMs;
  if (diff < 0) {
    const late = -diff;
    if (late < HOUR) return { label: `${Math.max(1, Math.round(late / MINUTE))} min late`, tone: "late" };
    if (late < DAY) return { label: `${Math.round(late / HOUR)} hr late`, tone: "late" };
    const days = Math.round(late / DAY);
    return { label: `${days} ${days === 1 ? "day" : "days"} late`, tone: "late" };
  }
  if (diff < HOUR) return { label: `${Math.max(1, Math.ceil(diff / MINUTE))} min`, tone: "soon" };
  if (diff < DAY) return { label: `${Math.floor(diff / HOUR)} hr`, tone: "soon" };
  const days = Math.max(1, calendarDaysBetween(nowMs, ms));
  return { label: `${days} ${days === 1 ? "day" : "days"}`, tone: days <= 2 ? "soon" : days <= 5 ? "warm" : "calm" };
}

function greetingFor(nowMs) {
  const hour = new Date(nowMs).getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function defaultSession(task) {
  if (!task) return 45;
  return clamp(Math.round(Number(task.minutes) / 5) * 5 || 45, 5, 90);
}

function pickFocusTask(openTasks, plan, preferredId) {
  if (preferredId != null) {
    const preferred = openTasks.find((task) => task.id === preferredId);
    if (preferred) return preferred;
  }
  const first = plan?.schedule?.[0];
  if (first) {
    const scheduled = openTasks.find((task) => task.id === first.task_id);
    if (scheduled) return scheduled;
  }
  return openTasks[0] ?? null;
}

function friendlyError(error, fallback = "Something went wrong. Please try again.") {
  if (error instanceof TypeError) {
    return `EDITH can't reach the Deadline Rescue backend. Check that it is running at ${apiBaseUrl}.`;
  }
  return error?.message || fallback;
}

function weekDays(offsetWeeks, nowMs) {
  const now = new Date(nowMs);
  const sinceMonday = (now.getDay() + 6) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday + offsetWeeks * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return {
      date: localDate(day),
      label: day.toLocaleDateString("en", { weekday: "short" }),
      long: day.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" }),
      isToday: localDate(day) === localDate(now),
      planned: 0,
      done: 0,
    };
  });
}

// Work is grouped by the day it is due: the backend does not store when a
// task was completed, so "completed" means due that day and marked complete.
function weeklyData(tasks, offsetWeeks, nowMs) {
  const days = weekDays(offsetWeeks, nowMs);
  const index = new Map(days.map((day) => [day.date, day]));
  tasks.forEach((task) => {
    const day = index.get(task.date);
    if (!day) return;
    const minutes = Number(task.minutes) || 0;
    day.planned += minutes;
    if (task.done) day.done += minutes;
  });
  return days;
}

function buildTimeline(schedule, nowMs) {
  const rows = [];
  schedule.forEach((item, index) => {
    const start = new Date(item.start).getTime();
    const end = new Date(item.end).getTime();
    if (index > 0) {
      const previousEnd = new Date(schedule[index - 1].end).getTime();
      const gap = Math.round((start - previousEnd) / MINUTE);
      if (gap >= 5) rows.push({ kind: "break", key: `break-${index}`, start: previousEnd, end: start, minutes: gap, past: nowMs >= start });
    }
    rows.push({ kind: "task", key: `${item.task_id}-${item.start}`, item, start, end, past: nowMs >= end, current: nowMs >= start && nowMs < end });
  });
  return rows;
}

/* ------------------------------------------------------------------ */
/* Small hooks                                                        */
/* ------------------------------------------------------------------ */

function useNow(interval = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function useDismiss(ref, open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, onClose]);
}

function useRemote(fetcher, refreshKey, enabled = true) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const sequence = useRef(0);
  const run = useCallback(async () => {
    const id = ++sequence.current;
    setState((previous) => ({ ...previous, loading: true, error: "" }));
    try {
      const data = await fetcher();
      if (id === sequence.current) setState({ data, loading: false, error: "" });
    } catch (error) {
      if (id === sequence.current) setState((previous) => ({ ...previous, loading: false, error: friendlyError(error) }));
    }
  }, [fetcher]);
  useEffect(() => {
    if (!enabled) return undefined;
    run();
    return () => { sequence.current += 1; };
  }, [run, refreshKey, enabled]);
  return { ...state, reload: run };
}

/* ------------------------------------------------------------------ */
/* Focus timer (kept at the top of the tree so it survives navigation) */
/* ------------------------------------------------------------------ */

const FocusContext = createContext(null);
const useFocus = () => useContext(FocusContext);

function FocusProvider({ children }) {
  const [minutes, setMinutes] = useState(45);
  const [status, setStatus] = useState("idle");
  const [remaining, setRemaining] = useState(45 * 60);
  const [taskId, setTaskId] = useState(null);
  const [sessionTaskId, setSessionTaskId] = useState(null);
  const endAt = useRef(0);
  const leftMs = useRef(45 * 60 * 1000);
  const baseTitle = useRef(typeof document !== "undefined" ? document.title : "");

  useEffect(() => {
    if (status !== "running") return undefined;
    const tick = () => {
      const left = endAt.current - Date.now();
      if (left <= 0) {
        leftMs.current = 0;
        setRemaining(0);
        setStatus("done");
        return;
      }
      leftMs.current = left;
      setRemaining(Math.ceil(left / 1000));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    document.title = status === "running" || status === "paused" ? `${formatTimer(remaining)} · EDITH` : baseTitle.current;
  }, [status, remaining]);
  useEffect(() => () => { document.title = baseTitle.current; }, []);

  const setDuration = useCallback((value) => {
    if (status === "running" || status === "paused") return;
    const next = clamp(Math.round(Number(value) || 0), 1, 240);
    setMinutes(next);
    leftMs.current = next * MINUTE;
    setRemaining(next * 60);
    setStatus("idle");
  }, [status]);

  const start = useCallback((forTaskId) => {
    if (status === "running") return;
    if (status === "paused") {
      endAt.current = Date.now() + leftMs.current;
      setStatus("running");
      return;
    }
    leftMs.current = minutes * MINUTE;
    endAt.current = Date.now() + leftMs.current;
    setRemaining(minutes * 60);
    setSessionTaskId(forTaskId ?? null);
    setStatus("running");
  }, [status, minutes]);

  const pause = useCallback(() => {
    if (status !== "running") return;
    leftMs.current = Math.max(0, endAt.current - Date.now());
    setRemaining(Math.ceil(leftMs.current / 1000));
    setStatus("paused");
  }, [status]);

  const reset = useCallback(() => {
    leftMs.current = minutes * MINUTE;
    setRemaining(minutes * 60);
    setSessionTaskId(null);
    setStatus("idle");
  }, [minutes]);

  const value = useMemo(
    () => ({ minutes, status, remaining, total: minutes * 60, taskId, setTaskId, sessionTaskId, start, pause, resume: start, reset, setDuration }),
    [minutes, status, remaining, taskId, sessionTaskId, start, pause, reset, setDuration],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

/* ------------------------------------------------------------------ */
/* EDITH chat (shared by the assistant rail and EDITH Studio)          */
/* ------------------------------------------------------------------ */

function loadMessages() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_KEY) || "null");
    if (Array.isArray(saved)) {
      return saved.filter((message, index) => !(index === 0 && message?.role === "assistant" && message.text === LEGACY_GREETING));
    }
  } catch {
    /* ignore unreadable history */
  }
  return [];
}

function useEdithChat({ refreshTasks }) {
  const [messages, setMessages] = useState(loadMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastFailed, setLastFailed] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [revision, setRevision] = useState(0);
  const recognitionRef = useRef(null);
  const busyRef = useRef(false);
  const voiceRef = useRef(false);
  const sendRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-200))); } catch { /* storage full or blocked */ }
  }, [messages]);

  useEffect(() => { voiceRef.current = voiceEnabled; }, [voiceEnabled]);

  useEffect(() => () => {
    recognitionRef.current?.abort?.();
    window.speechSynthesis?.cancel();
  }, []);

  const add = useCallback((message) => {
    setMessages((old) => [...old, { id: uid(), ts: Date.now(), ...message }]);
  }, []);

  const speak = useCallback((text) => {
    if (!voiceRef.current || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1.06;
    utterance.pitch = 1;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const american = voices.filter((voice) => voice.lang === "en-US");
    utterance.voice =
      american.find((voice) => /samantha|ava|allison|jenny|aria|google us english/i.test(voice.name)) ||
      american[0] ||
      voices.find((voice) => voice.lang.startsWith("en-US")) ||
      null;
    window.speechSynthesis.speak(utterance);
  }, []);

  const sendMessage = useCallback(async (text) => {
    const message = String(text ?? "").trim();
    if (!message || busyRef.current) return;
    busyRef.current = true;
    add({ role: "user", text: message });
    setInput("");
    setBusy(true);
    setError("");
    setLastFailed("");
    try {
      const response = await api.assistantChat(message);
      const reply = String(response.reply ?? "");
      add({
        role: "assistant",
        text: reply,
        data: response.tasks || response.plan || response.risks || response.memory,
        task: response.task,
      });
      speak(reply);
      refreshTasks();
      setRevision((value) => value + 1);
    } catch (requestError) {
      setError(friendlyError(requestError, "The assistant action failed."));
      setLastFailed(message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [add, refreshTasks, speak]);

  useEffect(() => { sendRef.current = sendMessage; }, [sendMessage]);

  // Adds an exchange that was answered from data already on screen, not by the backend.
  const addLocal = useCallback((userText, replyText, data) => {
    add({ role: "user", text: userText });
    add({ role: "assistant", text: replyText, data });
  }, [add]);

  const retry = useCallback(() => {
    if (!lastFailed) return;
    setMessages((old) => {
      const copy = [...old];
      for (let i = copy.length - 1; i >= 0; i -= 1) {
        if (copy[i].role === "user" && copy[i].text === lastFailed) { copy.splice(i, 1); break; }
      }
      return copy;
    });
    sendRef.current?.(lastFailed);
  }, [lastFailed]);

  const clear = useCallback(() => {
    setMessages([]);
    setError("");
    setLastFailed("");
    try { localStorage.removeItem(CHAT_KEY); } catch { /* ignore */ }
  }, []);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((value) => !value);
    window.speechSynthesis?.cancel();
  }, []);

  const toggleListening = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stopListening?.();
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Voice input is unavailable in this browser. Try Chrome.");
      return;
    }
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    let transcript = "";
    let stoppedByUser = false;
    recognition.onstart = () => {
      setListening(true);
      setError("");
      setInput("");
    };
    recognition.onresult = (event) => {
      let finalPart = "";
      let interimPart = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const words = result[0].transcript.trim();
        if (result.isFinal && words) finalPart += (finalPart ? " " : "") + words;
        else if (words) interimPart += (interimPart ? " " : "") + words;
      }
      if (finalPart) transcript = `${transcript} ${finalPart}`.trim();
      setInput([transcript, interimPart].filter(Boolean).join(" ").slice(0, 2000));
    };
    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Microphone issue: ${event.error}. Check microphone permission.`);
      }
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      if (stoppedByUser) {
        if (transcript.trim()) sendRef.current?.(transcript.trim());
        else setError("I did not catch any speech. Tap the microphone and try again.");
      }
    };
    recognition.stopListening = () => {
      stoppedByUser = true;
      recognition.stop();
    };
    try {
      recognition.start();
    } catch {
      setListening(false);
      setError("Microphone could not start. Try again.");
    }
  }, [listening]);

  return {
    messages, input, setInput, busy, error, listening, voiceEnabled, revision,
    sendMessage, addLocal, retry, clear, toggleVoice, toggleListening, canRetry: Boolean(lastFailed),
  };
}

/* ------------------------------------------------------------------ */
/* Cinematic startup                                                   */
/* ------------------------------------------------------------------ */

function CinematicIntro({ onComplete }) {
  const [leaving, setLeaving] = useState(false);
  const hasCompleted = useRef(false);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const complete = useCallback(() => {
    if (hasCompleted.current) return;
    hasCompleted.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (reducedMotion) {
      const timer = window.setTimeout(complete, 0);
      return () => window.clearTimeout(timer);
    }
    const departureTimer = window.setTimeout(() => setLeaving(true), 3600);
    const completionTimer = window.setTimeout(complete, 4300);
    return () => {
      window.clearTimeout(departureTimer);
      window.clearTimeout(completionTimer);
    };
  }, [complete, reducedMotion]);

  const skip = () => {
    setLeaving(true);
    window.setTimeout(complete, 180);
  };

  return (
    <main className={`cinematic-intro ${leaving ? "cinematic-intro-leaving" : ""}`}>
      <video
        className="cinematic-video"
        src="/sea-storm.mp4"
        poster="/edith-dashboard-background.png"
        autoPlay
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      <div className="cinematic-scrim" />
      <div className="cinematic-grain" aria-hidden="true" />

      <section className="cinematic-copy" aria-label="EDITH startup">
        <p className="cinematic-kicker">Deadline Rescue</p>
        <h1 className="cinematic-title">EDITH</h1>
        <p className="cinematic-subtitle">Your next clear step is waiting.</p>
      </section>

      <div className="cinematic-bottom">


      </div>
      <span className="cinematic-progress" aria-hidden="true" />
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                        */
/* ------------------------------------------------------------------ */

function Scene() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene-photo" />
      <div className="scene-glow" />
      <div className="scene-vignette" />
    </div>
  );
}

function Ridgeline() {
  return (
    <svg className="ridge" viewBox="0 0 220 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ridge-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34413f" />
          <stop offset="0.5" stopColor="#7d6446" />
          <stop offset="1" stopColor="#d99a55" />
        </linearGradient>
      </defs>
      <rect width="220" height="260" fill="url(#ridge-sky)" />
      <circle cx="158" cy="118" r="26" fill="#f3c98a" opacity="0.35" />
      <path d="M0 150 L30 118 L56 140 L92 92 L122 130 L152 104 L186 134 L220 110 V260 H0Z" fill="#56503f" opacity="0.75" />
      <path d="M0 186 L40 150 L72 174 L112 138 L152 172 L192 148 L220 166 V260 H0Z" fill="#33402f" />
      <path d="M0 226 L52 196 L96 216 L142 188 L186 210 L220 198 V260 H0Z" fill="#18221a" />
    </svg>
  );
}

function EmptyState({ text, icon: Icon = ListTodo, children }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={20} /></div>
      <p>{text}</p>
      {children}
    </div>
  );
}

function InlineError({ message, onRetry }) {
  return (
    <p className="inline-error" role="alert">
      <TriangleAlert size={15} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
    </p>
  );
}

function Skeleton({ lines = 3 }) {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => <span className="skeleton" key={index} style={{ width: `${92 - index * 14}%` }} />)}
    </div>
  );
}

function Panel({ title, action, className = "", children, ...rest }) {
  return (
    <section className={`panel glass ${className}`} {...rest}>
      {(title || action) && (
        <header className="panel-head">
          {title && <h2 className="panel-title">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                            */
/* ------------------------------------------------------------------ */

function Sidebar({ page, onNavigate, onClose, inert, open, chat, onReplayIntro }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  useDismiss(settingsRef, settingsOpen, closeSettings);

  return (
    <aside className={`sidebar glass ${open ? "sidebar-open" : ""}`} id="sidebar" aria-label="Sidebar" inert={inert}>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true"><Sparkle size={22} strokeWidth={1.6} /></span>
        <div className="brand-text">
          <strong>EDITH</strong>
          <small>Deadline Rescue</small>
        </div>
        <button type="button" className="icon-button sidebar-close" onClick={onClose} aria-label="Close menu"><X size={18} /></button>
      </div>

      <nav className="side-nav" aria-label="Primary">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`nav-item ${page === id ? "selected" : ""}`}
            aria-current={page === id ? "page" : undefined}
            onClick={() => onNavigate(id)}
            title={label}
          >
            <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <figure className="sidebar-card">
        <Ridgeline />
        <figcaption>Discipline<br />today,<br />freedom<br />tomorrow.</figcaption>
      </figure>

      <div className="profile" ref={settingsRef}>
        <span className="profile-avatar" aria-hidden="true">{PROFILE.name.charAt(0)}</span>
        <div className="profile-text">
          <strong>{PROFILE.name}</strong>
          <small>{PROFILE.role}</small>
        </div>
        <button
          type="button"
          className="icon-button profile-settings"
          aria-label="Settings"
          aria-expanded={settingsOpen}
          aria-haspopup="menu"
          onClick={() => setSettingsOpen((value) => !value)}
        >
          <Settings size={18} />
        </button>
        {settingsOpen && (
          <div className="menu menu-up" role="menu" aria-label="Settings">
            <button type="button" role="menuitemcheckbox" aria-checked={chat.voiceEnabled} onClick={chat.toggleVoice}>
              {chat.voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              Spoken replies: {chat.voiceEnabled ? "on" : "off"}
            </button>
            <button type="button" role="menuitem" onClick={() => { chat.clear(); setSettingsOpen(false); }}>
              <Trash2 size={16} /> Clear chat history
            </button>
            <button type="button" role="menuitem" onClick={() => { setSettingsOpen(false); onReplayIntro(); }}>
              <RotateCcw size={16} /> Replay welcome screen
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Top bar and command bar                                            */
/* ------------------------------------------------------------------ */

function TopBar({ now, risks, risksLoading, scene, onScene, onMenu, onOpenRail, showMenu, showRailButton, railOpen }) {
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);
  const closeBell = useCallback(() => setBellOpen(false), []);
  useDismiss(bellRef, bellOpen, closeBell);

  const date = new Date(now).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const time = new Date(now).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const count = risks?.length ?? 0;

  return (
    <header className="topbar">
      {showMenu && (
        <button type="button" className="icon-button topbar-menu" onClick={onMenu} aria-label="Open menu" aria-controls="sidebar">
          <Menu size={20} />
        </button>
      )}
      <div className="clock">
        <span className="clock-date">{date}</span>
        <span className="clock-time">{time}</span>
      </div>
      <div className="topbar-actions">
        <button
          type="button"
          className="icon-button"
          onClick={onScene}
          aria-pressed={scene === "night"}
          aria-label={scene === "night" ? "Switch to dusk lighting" : "Switch to night lighting"}
          title={scene === "night" ? "Dusk lighting" : "Night lighting"}
        >
          {scene === "night" ? <Moon size={19} /> : <Sun size={19} />}
        </button>
        <div className="bell-wrap" ref={bellRef}>
          <button
            type="button"
            className="icon-button"
            aria-label={count ? `${count} deadline ${count === 1 ? "risk" : "risks"}` : "No deadline risks"}
            aria-expanded={bellOpen}
            aria-haspopup="dialog"
            onClick={() => setBellOpen((value) => !value)}
          >
            <Bell size={19} />
            {count > 0 && <span className="bell-dot" aria-hidden="true" />}
          </button>
          {bellOpen && (
            <div className="menu menu-down notice" role="dialog" aria-label="Deadline risks">
              <strong>Needs attention</strong>
              {risksLoading && <p>Checking your deadlines…</p>}
              {!risksLoading && count === 0 && <p>No deadline risks right now.</p>}
              {risks?.slice(0, 5).map((risk) => (
                <p key={risk.task_id ?? risk.title}><b>{risk.title}</b><span>{risk.reason}</span></p>
              ))}
            </div>
          )}
        </div>
        <span className="avatar" aria-hidden="true">{PROFILE.name.charAt(0)}</span>
        {showRailButton && (
          <button
            type="button"
            className="edith-toggle"
            onClick={onOpenRail}
            aria-expanded={railOpen}
            aria-controls="edith-rail"
          >
            <Sparkle size={16} aria-hidden="true" /> EDITH
          </button>
        )}
      </div>
    </header>
  );
}

function CommandBar({ onAsk, onNewTask, inputRef }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="command glass"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const text = value.trim();
        if (!text) return;
        onAsk(text);
        setValue("");
      }}
    >
      <Search size={18} aria-hidden="true" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={"Ask EDITH anything… “plan 2 hours”, “what should I work on?”, “check deadline risks”"}
        aria-label="Ask EDITH"
        maxLength={2000}
      />
      <kbd aria-hidden="true"><Command size={11} /> K</kbd>
      <button type="button" className="command-new" onClick={onNewTask}>
        <Plus size={16} aria-hidden="true" /> <span>New task</span>
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Chat UI                                                            */
/* ------------------------------------------------------------------ */

const SUGGESTIONS = [
  { id: "plan", label: "Plan my day for 3 hours", icon: Clock3, kind: "send" },
  { id: "now", label: "What should I work on now?", icon: Target, kind: "send" },
  { id: "deadlines", label: "Show my upcoming deadlines", icon: CalendarDays, kind: "local" },
  { id: "add", label: "Add a task for tomorrow", icon: SquarePen, kind: "prefill" },
];

function dayLabel(ts, nowMs) {
  const diff = calendarDaysBetween(ts, nowMs);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(ts).toLocaleDateString("en", { day: "numeric", month: "short" });
}

function toViewTask(item) {
  return "estimated_minutes" in item ? apiTaskToView(item) : item;
}

function ChatData({ data, now }) {
  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    if (data.every((item) => item && typeof item === "object" && "reason" in item)) {
      return (
        <ul className="chat-data">
          {data.slice(0, 6).map((risk, index) => (
            <li key={risk.task_id ?? index}><strong>{risk.title}</strong><span>{risk.reason}</span></li>
          ))}
        </ul>
      );
    }
    if (data.every((item) => item && typeof item === "object" && "title" in item)) {
      return (
        <ul className="chat-data">
          {data.slice(0, 8).map((raw, index) => {
            const task = toViewTask(raw);
            return (
              <li key={task.id ?? index}>
                <strong>{task.title}</strong>
                <span>{task.done ? "Completed" : dueLabel(task, now)}{Number.isFinite(task.minutes) ? ` · ${formatMinutes(task.minutes)}` : ""}</span>
              </li>
            );
          })}
        </ul>
      );
    }
  }
  if (data && typeof data === "object" && Array.isArray(data.schedule)) {
    return (
      <div className="chat-data">
        <ul>
          {data.schedule.slice(0, 8).map((item, index) => (
            <li key={`${item.task_id ?? index}-${item.start}`}>
              <strong>{item.title || item.task?.title || "Task"}</strong>
              <span>{formatClock(new Date(item.start).getTime())} – {formatClock(new Date(item.end).getTime())} · {formatMinutes(item.duration_minutes)}</span>
            </li>
          ))}
        </ul>
        {Number.isFinite(data.scheduled_minutes) && Number.isFinite(data.available_minutes) && (
          <small>{data.scheduled_minutes} of {data.available_minutes} minutes planned</small>
        )}
      </div>
    );
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const entries = Object.entries(data).filter(([, value]) => value !== null && value !== undefined && typeof value !== "object");
    if (entries.length) {
      return (
        <ul className="chat-data">
          {entries.map(([key, value]) => <li key={key}><strong>{key.replaceAll("_", " ")}</strong><span>{String(value)}</span></li>)}
        </ul>
      );
    }
  }
  return (
    <details className="chat-details">
      <summary>View details</summary>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}

function TaskAddedCard({ task, now, onView }) {
  const view = apiTaskToView(task);
  return (
    <div className="added-card">
      <ListTodo size={18} aria-hidden="true" />
      <div>
        <strong>{view.title}</strong>
        <span>{dueLabel(view, now)} · {formatMinutes(view.minutes)}</span>
      </div>
      <button type="button" onClick={onView}>View task</button>
    </div>
  );
}

function ChatMessage({ message, now, onViewTask }) {
  const isUser = message.role === "user";
  return (
    <article className={`msg ${isUser ? "msg-user" : "msg-bot"}`}>
      <span className="sr-only">{isUser ? "You said" : "EDITH said"}</span>
      <p>
        {message.task && <CheckCircle2 className="msg-check" size={17} aria-label="Task saved" />}
        {isUser ? message.text : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.text ?? ""}
          </ReactMarkdown>
        )}
      </p>
      {message.task && <TaskAddedCard task={message.task} now={now} onView={onViewTask} />}
      {message.data !== undefined && message.data !== null && <ChatData data={message.data} now={now} />}
    </article>
  );
}

function ChatThread({ chat, onViewTask }) {
  const now = useNow(60000);
  const labels = chat.messages.map((message) => (message.ts ? dayLabel(message.ts, now) : null));
  return (
    <div className="thread" aria-live="polite" aria-relevant="additions">
      {chat.messages.map((message, index) => {
        const label = labels[index];
        const earlier = labels.slice(0, index).reverse().find(Boolean) ?? null;
        return (
          <div className="thread-item" key={message.id ?? index}>
            {label && label !== earlier && <div className="day-divider"><span>{label}</span></div>}
            <ChatMessage message={message} now={now} onViewTask={onViewTask} />
          </div>
        );
      })}
      {chat.busy && (
        <div className="msg msg-bot typing" role="status" aria-label="EDITH is working on it">
          <span /><span /><span />
        </div>
      )}
      {chat.error && <InlineError message={chat.error} onRetry={chat.canRetry ? chat.retry : undefined} />}
    </div>
  );
}

function ChatComposer({ chat, textareaRef }) {
  const fallback = useRef(null);
  const ref = textareaRef ?? fallback;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [chat.input, ref]);

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        chat.sendMessage(chat.input);
      }}
    >
      <label className="sr-only" htmlFor={`composer-${textareaRef ? "rail" : "studio"}`}>Message EDITH</label>
      <textarea
        id={`composer-${textareaRef ? "rail" : "studio"}`}
        ref={ref}
        rows={1}
        value={chat.input}
        maxLength={2000}
        placeholder="Ask EDITH anything…"
        onChange={(event) => chat.setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            chat.sendMessage(chat.input);
          }
        }}
      />
      <div className="composer-bar">
        <button
          type="button"
          className={`icon-button ${chat.listening ? "is-live" : ""}`}
          onClick={chat.toggleListening}
          disabled={chat.busy}
          aria-pressed={chat.listening}
          aria-label={chat.listening ? "Stop microphone and send" : "Speak to EDITH"}
          title={chat.listening ? "Stop and send" : "Speak to EDITH"}
        >
          <Mic size={18} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={chat.toggleVoice}
          aria-pressed={chat.voiceEnabled}
          aria-label={chat.voiceEnabled ? "Mute spoken replies" : "Speak replies aloud"}
          title={chat.voiceEnabled ? "Mute replies" : "Speak replies"}
        >
          {chat.voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        {chat.listening && <span className="composer-live" role="status">Listening…</span>}
        <button type="submit" className="send" disabled={chat.busy || !chat.input.trim()} aria-label="Send message">
          <Send size={17} />
        </button>
      </div>
    </form>
  );
}

function EdithRail({ chat, online, isDrawer, open, onClose, composerRef, onSuggest, onViewTask }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const scrollRef = useRef(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismiss(menuRef, menuOpen, closeMenu);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [chat.messages.length, chat.busy, chat.error]);

  return (
    <aside
      className={`rail ${isDrawer ? "rail-drawer" : ""} ${open ? "rail-open" : ""}`}
      id="edith-rail"
      aria-label="EDITH assistant"
      inert={isDrawer && !open}
    >
      <div className="rail-card glass">
        <header className="rail-head">
          <span className="rail-avatar" aria-hidden="true"><Sparkle size={20} strokeWidth={1.7} /></span>
          <div className="rail-id">
            <strong>EDITH <Sparkles size={14} aria-hidden="true" /></strong>
            <small>Your AI Productivity Agent</small>
            <span className={`status ${online ? "status-on" : "status-off"}`} role="status">
              <i aria-hidden="true" /> {online ? "Online" : "Backend offline"}
            </span>
          </div>
          <div className="rail-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="icon-button"
              aria-label="Assistant options"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((value) => !value)}
            >
              <EllipsisVertical size={19} />
            </button>
            {menuOpen && (
              <div className="menu menu-down" role="menu" aria-label="Assistant options">
                <button type="button" role="menuitemcheckbox" aria-checked={chat.voiceEnabled} onClick={chat.toggleVoice}>
                  {chat.voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  Spoken replies: {chat.voiceEnabled ? "on" : "off"}
                </button>
                <button type="button" role="menuitem" onClick={() => { chat.clear(); setMenuOpen(false); }}>
                  <Trash2 size={16} /> Clear conversation
                </button>
              </div>
            )}
          </div>
          {isDrawer && (
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close assistant"><X size={19} /></button>
          )}
        </header>

        <div className="rail-scroll" ref={scrollRef}>
          <section className="greeting-card">
            <strong>Hey {PROFILE.name}! <span aria-hidden="true">👋</span></strong>
            <p>I'm EDITH. I can help you plan your tasks, check deadlines, break work into focus sessions, or just answer any questions.</p>
          </section>

          <div className="suggestions" role="group" aria-label="Suggested commands">
            {SUGGESTIONS.map(({ id, label, icon: Icon, kind }) => (
              <button type="button" key={id} className="suggestion" disabled={chat.busy && kind === "send"} onClick={() => onSuggest(id, kind, label)}>
                <Icon size={17} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>

          <ChatThread chat={chat} onViewTask={onViewTask} />
        </div>

        <ChatComposer chat={chat} textareaRef={composerRef} />
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Add task modal                                                     */
/* ------------------------------------------------------------------ */

function AddTaskModal({ onClose, onAdd, projects }) {
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("Personal");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("16:00");
  const [minutes, setMinutes] = useState("45");
  const [priority, setPriority] = useState("Medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      await onAdd({ title: title.trim(), project, date, time, minutes: Math.max(5, Number(minutes) || 45), priority, done: false });
      onClose();
    } catch (requestError) {
      setError(friendlyError(requestError, "We couldn't save that task. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-task-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="task-modal glass" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <p className="modal-kicker">Make a little space</p>
            <h2 id="new-task-title">A new task.</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <label>What needs doing?
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Give your task a name…" required maxLength={200} />
        </label>
        <div className="form-grid">
          <label>Project
            <select value={project} onChange={(event) => setProject(event.target.value)}>
              {projects.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label>Priority
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option>Low</option><option>Medium</option><option>High</option><option>Urgent</option>
            </select>
          </label>
          <label>Due date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
          <label>Time<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
          <label className="full-field">Estimated time (minutes)
            <input type="number" min="5" step="5" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
          </label>
        </div>
        {error && <InlineError message={error} />}
        <div className="modal-actions">
          <button type="button" className="button-quiet" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="button-primary" disabled={saving}><Plus size={16} /> {saving ? "Saving…" : "Add task"}</button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Focus ring + controls                                              */
/* ------------------------------------------------------------------ */

const RING_LABELS = { idle: "Focus session", running: "Focusing", paused: "Paused", done: "Session complete" };

function FocusRing({ taskId, size = "md" }) {
  const focus = useFocus();
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const fraction = focus.total ? focus.remaining / focus.total : 1;
  const running = focus.status === "running";
  const disabled = focus.status === "idle" && taskId == null;
  const gradientId = `ring-grad-${size}`;
  const actionLabel = running ? "Pause focus session" : focus.status === "paused" ? "Resume focus session" : "Start focus session";

  return (
    <div className={`ring ring-${size} ring-${focus.status}`}>
      <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#bdf0c6" />
            <stop offset="0.55" stopColor="#f3e3b8" />
            <stop offset="1" stopColor="#e7b76e" />
          </linearGradient>
        </defs>
        <circle className="ring-track" cx="100" cy="100" r={radius} />
        <circle
          className="ring-arc"
          cx="100"
          cy="100"
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="ring-core">
        <span className="ring-time" role="timer" aria-label="Time remaining">{formatTimer(focus.remaining)}</span>
        <span className="ring-label">{RING_LABELS[focus.status]}</span>
        <button
          type="button"
          className="ring-play"
          onClick={() => (running ? focus.pause() : focus.start(taskId))}
          disabled={disabled}
          aria-label={actionLabel}
        >
          {running ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </button>
      </div>
      <span className="sr-only" role="status">{focus.status === "done" ? "Focus session complete" : ""}</span>
    </div>
  );
}

function FocusControls({ task, onToggleTask, onPlan }) {
  const focus = useFocus();
  const running = focus.status === "running";
  const paused = focus.status === "paused";
  const done = focus.status === "done";
  const label = running ? "Pause" : paused ? "Resume" : done ? "Start another" : "Start focus";
  const Icon = running ? Pause : Play;

  return (
    <div className="focus-actions">
      <button
        type="button"
        className="button-primary"
        onClick={() => (running ? focus.pause() : focus.start(task?.id))}
        disabled={!task && focus.status === "idle"}
      >
        <Icon size={18} fill="currentColor" aria-hidden="true" /> {label}
      </button>
      {focus.status !== "idle" && (
        <button type="button" className="button-outline" onClick={focus.reset}>
          <RotateCcw size={16} aria-hidden="true" /> Reset
        </button>
      )}
      {done && task && !task.done && (
        <button type="button" className="button-outline" onClick={() => onToggleTask(task.id)}>
          <Check size={16} aria-hidden="true" /> Mark task complete
        </button>
      )}
      {onPlan && focus.status === "idle" && (
        <button type="button" className="button-outline" onClick={onPlan}>
          <Sparkles size={16} aria-hidden="true" /> Plan with EDITH
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard cards                                                    */
/* ------------------------------------------------------------------ */

function KpiRow({ tasks, openTasks, plan, risks, now, loading }) {
  const completed = tasks.filter((task) => task.done).length;
  const next = openTasks[0];
  const nextCountdown = next ? countdown(next, now) : null;
  const scheduled = plan.data?.scheduled_minutes;
  const available = plan.data?.available_minutes;
  const percent = Number.isFinite(scheduled) && available > 0 ? clamp(Math.round((scheduled / available) * 100), 0, 100) : 0;
  const attention = risks.data?.length;

  return (
    <section className="kpi-row" aria-label="Summary">
      <article className="kpi glass kpi-mint">
        <span className="kpi-icon" aria-hidden="true"><ListTodo size={22} strokeWidth={1.6} /></span>
        <div className="kpi-body">
          <p className="kpi-value">{loading ? "—" : tasks.length}</p>
          <p className="kpi-label">Total tasks</p>
          <p className="kpi-note tone-calm">{loading ? "Loading…" : `${completed} completed`}</p>
        </div>
      </article>

      <article className="kpi glass kpi-coral">
        <span className="kpi-icon" aria-hidden="true"><TriangleAlert size={22} strokeWidth={1.6} /></span>
        <div className="kpi-body">
          <p className="kpi-value">{risks.data ? attention : "—"}</p>
          <p className="kpi-label">Need attention</p>
          <p className={`kpi-note ${risks.error ? "tone-warm" : attention ? "tone-soon" : "tone-calm"}`}>
            {risks.error ? "Couldn't check" : !risks.data ? "Checking…" : attention ? "Deadlines at risk" : "All clear"}
          </p>
        </div>
      </article>

      <article className="kpi glass kpi-sun">
        <span className="kpi-icon" aria-hidden="true"><Clock3 size={22} strokeWidth={1.6} /></span>
        <div className="kpi-body">
          <p className="kpi-value">
            {plan.data ? scheduled : "—"}<span className="kpi-of"> / {plan.data ? available : "—"}</span>
          </p>
          <p className="kpi-label">Minutes planned</p>
          <div className="kpi-meter">
            <div className="meter" role="meter" aria-label="Minutes planned" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <span style={{ width: `${percent}%` }} />
            </div>
            <span className="kpi-percent">{percent}%</span>
          </div>
        </div>
      </article>

      <article className="kpi glass kpi-mint">
        <span className="kpi-icon" aria-hidden="true"><CalendarDays size={22} strokeWidth={1.6} /></span>
        <div className="kpi-body">
          <p className="kpi-value">{loading ? "—" : next ? nextCountdown.label : "None"}</p>
          <p className="kpi-label">Next deadline</p>
          <p className={`kpi-note kpi-clip ${next ? `tone-${nextCountdown.tone}` : "tone-calm"}`} title={next?.title}>
            {loading ? "Loading…" : next ? next.title : "No open tasks"}
          </p>
        </div>
      </article>
    </section>
  );
}

function FocusCard({ task, now, loading, onToggleTask, onPlan, onAddTask, onOpenFocus }) {
  const quote = QUOTES[(Number(task?.id) || 0) % QUOTES.length];
  return (
    <Panel
      title="Current focus"
      className="focus-card"
      action={<button type="button" className="panel-link" onClick={onOpenFocus}>Focus Mode <ArrowRight size={15} aria-hidden="true" /></button>}
    >
      {loading ? (
        <Skeleton lines={4} />
      ) : !task ? (
        <EmptyState text="Nothing in focus. Add a task and EDITH will line it up." icon={Target}>
          <button type="button" className="button-primary" onClick={onAddTask}><Plus size={16} /> Add a task</button>
        </EmptyState>
      ) : (
        <div className="focus-body">
          <div className="focus-copy">
            <h3 className="focus-title">{task.title}</h3>
            <ul className="focus-meta">
              <li><CalendarDays size={16} aria-hidden="true" /> {dueLabel(task, now)}</li>
              <li><Clock3 size={16} aria-hidden="true" /> {formatMinutes(task.minutes)}</li>
              <li><Flag size={16} aria-hidden="true" /> {task.priority}</li>
            </ul>
            <p className="focus-quote">“{quote}”</p>
            <FocusControls task={task} onToggleTask={onToggleTask} onPlan={onPlan} />
          </div>
          <div className="focus-visual">
            <FocusRing taskId={task.id} size="md" />
            <p className="focus-script" aria-hidden="true">Small steps compound into big results.</p>
          </div>
        </div>
      )}
    </Panel>
  );
}

function DeadlinesCard({ openTasks, now, loading, onViewAll, onComplete }) {
  const list = openTasks.slice(0, 5);
  return (
    <Panel
      title="Upcoming deadlines"
      className="deadlines-card"
      action={<button type="button" className="panel-link" onClick={onViewAll}>View all <ArrowRight size={15} aria-hidden="true" /></button>}
    >
      {loading ? (
        <Skeleton lines={4} />
      ) : list.length === 0 ? (
        <EmptyState text="No open deadlines. Enjoy the space." icon={CalendarDays} />
      ) : (
        <ol className="deadline-list">
          {list.map((task) => {
            const when = countdown(task, now);
            const ms = dueMs(task);
            return (
              <li className="deadline" key={task.id}>
                <div className="deadline-date" aria-hidden="true">
                  <span>{Number.isFinite(ms) ? new Date(ms).toLocaleDateString("en", { month: "short" }) : "—"}</span>
                  <strong>{Number.isFinite(ms) ? new Date(ms).getDate() : "–"}</strong>
                </div>
                <button type="button" className={`deadline-check tone-${when.tone}`} onClick={() => onComplete(task.id)} aria-label={`Mark ${task.title} complete`}>
                  <Check size={14} aria-hidden="true" />
                </button>
                <div className="deadline-main">
                  <strong title={task.title}>{task.title}</strong>
                  <span>{formatMinutes(task.minutes)} · {task.priority}</span>
                </div>
                <span className={`badge tone-${when.tone}`}>{when.label}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

const BUDGETS = [60, 120, 180, 240, 360, 480];

function PlanCard({ plan, now, available, onAvailable, onViewFull }) {
  const rows = useMemo(() => buildTimeline(plan.data?.schedule ?? [], now), [plan.data, now]);
  const activeIndex = rows.findIndex((row) => row.kind === "task" && !row.past);
  const visible = rows.slice(0, 5);
  const options = BUDGETS.includes(available) ? BUDGETS : [...BUDGETS, available].sort((a, b) => a - b);
  const waiting = plan.data?.unscheduled?.length ?? 0;

  return (
    <Panel
      title="Today's plan"
      className="plan-card"
      action={<button type="button" className="panel-link" onClick={onViewFull}>View full plan <ArrowRight size={15} aria-hidden="true" /></button>}
    >
      {plan.loading && !plan.data ? (
        <Skeleton lines={4} />
      ) : plan.error ? (
        <InlineError message={plan.error} onRetry={plan.reload} />
      ) : rows.length === 0 ? (
        <EmptyState text="Nothing fits yet. Add a task or give EDITH more time." icon={CalendarDays} />
      ) : (
        <ol className="timeline">
          {visible.map((row, index) =>
            row.kind === "break" ? (
              <li className="timeline-item is-break" key={row.key}>
                <span className="timeline-node" aria-hidden="true" />
                <time className="timeline-time" dateTime={new Date(row.start).toISOString()}>{formatClock(row.start)} – {formatClock(row.end)}</time>
                <span className="timeline-title">Break · {row.minutes} min</span>
              </li>
            ) : (
              <li className={`timeline-item ${row.past ? "is-past" : ""} ${index === activeIndex ? "is-active" : ""}`} key={row.key}>
                <span className="timeline-node" aria-hidden="true" />
                <time className="timeline-time" dateTime={new Date(row.start).toISOString()}>{formatClock(row.start)} – {formatClock(row.end)}</time>
                <span className="timeline-title" title={row.item.title}>{row.item.title}</span>
              </li>
            ),
          )}
        </ol>
      )}
      <footer className="plan-foot">
        <label>
          <span>Time available</span>
          <select className="select-pill" value={available} onChange={(event) => onAvailable(Number(event.target.value))}>
            {options.map((value) => <option key={value} value={value}>{formatMinutes(value)}</option>)}
          </select>
        </label>
        {waiting > 0 && <span className="plan-waiting">{waiting} {waiting === 1 ? "task needs" : "tasks need"} another window</span>}
      </footer>
    </Panel>
  );
}

const WEEK_OPTIONS = [[-1, "Last week"], [0, "This week"], [1, "Next week"]];

function WeeklyCard({ tasks, now }) {
  const [offset, setOffset] = useState(0);
  const days = useMemo(() => weeklyData(tasks, offset, now), [tasks, offset, now]);
  const max = Math.max(0, ...days.map((day) => day.planned));
  const peak = max > 0 ? days.findIndex((day) => day.planned === max) : -1;
  const totalPlanned = days.reduce((sum, day) => sum + day.planned, 0);
  const totalDone = days.reduce((sum, day) => sum + day.done, 0);
  const height = (value) => (value > 0 ? `${Math.max(7, Math.round((value / max) * 100))}%` : "0%");

  return (
    <Panel
      title="Weekly progress"
      className="weekly-card"
      action={
        <select className="select-pill" value={offset} onChange={(event) => setOffset(Number(event.target.value))} aria-label="Choose week">
          {WEEK_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      }
    >
      <div className="chart">
        {max === 0 && <p className="chart-empty">No tasks are due this week.</p>}
        <ul className="bars" aria-hidden="true">
          {days.map((day, index) => (
            <li className={`bar-day ${day.isToday ? "is-today" : ""}`} key={day.date}>
              {index === peak && (
                <span className={`bar-tip ${index >= 5 ? "tip-end" : index <= 1 ? "tip-start" : ""}`}>
                  {formatMinutes(day.planned)}<small>Peak day</small>
                </span>
              )}
              <div className="bar-pair">
                <span className="bar bar-planned" style={{ height: height(day.planned) }} />
                <span className="bar bar-done" style={{ height: height(day.done) }} />
              </div>
              <span className="bar-label">{day.label}</span>
            </li>
          ))}
        </ul>
        <ul className="sr-only">
          {days.map((day) => <li key={day.date}>{day.long}: {formatMinutes(day.planned)} planned, {formatMinutes(day.done)} completed.</li>)}
        </ul>
      </div>
      <footer className="chart-foot">
        <span className="legend-item"><i className="swatch swatch-planned" aria-hidden="true" /> Planned</span>
        <span className="legend-item"><i className="swatch swatch-done" aria-hidden="true" /> Completed</span>
        <small>{formatMinutes(totalDone)} of {formatMinutes(totalPlanned)} · by due date</small>
      </footer>
    </Panel>
  );
}

const PRIORITY_COLORS = [
  { key: "Urgent", color: "var(--sun)" },
  { key: "High", color: "var(--coral)" },
  { key: "Medium", color: "var(--forest-bright)" },
  { key: "Low", color: "var(--mint)" },
];

function BreakdownCard({ tasks }) {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.done).length;
  const counts = { Urgent: 0, High: 0, Medium: 0, Low: 0 };
  tasks.forEach((task) => { if (task.priority in counts) counts[task.priority] += 1; });
  const legend = PRIORITY_COLORS.filter((item) => item.key !== "Urgent" || counts.Urgent > 0);

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const used = legend.filter((item) => counts[item.key] > 0);
  const arcs = used.reduce((list, item) => {
    const length = (counts[item.key] / total) * circumference;
    const gap = used.length > 1 ? 3 : 0;
    const start = list.length ? list[list.length - 1].end : 0;
    list.push({ key: item.key, color: item.color, dash: Math.max(0, length - gap), offset: start, end: start + length });
    return list;
  }, []);

  const share = total ? completed / total : 0;
  const message = total === 0
    ? "Add a task and the breakdown appears here."
    : share === 0 ? "Nothing finished yet. Pick one small task to start."
    : share < 0.5 ? "Good start. Keep the momentum going."
    : share < 1 ? "You're making steady progress. Keep going!"
    : "Everything is done. Nice work.";

  return (
    <Panel title="Task breakdown" className="breakdown-card">
      <div className="breakdown">
        <div className="donut">
          <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <circle className="donut-track" cx="50" cy="50" r={radius} />
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx="50"
                cy="50"
                r={radius}
                className="donut-arc"
                stroke={arc.color}
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={-arc.offset}
                transform="rotate(-90 50 50)"
              />
            ))}
          </svg>
          <div className="donut-core"><strong>{total}</strong><span>{total === 1 ? "Task" : "Tasks"}</span></div>
        </div>
        <ul className="legend">
          {legend.map((item) => (
            <li key={item.key}>
              <i className="swatch" style={{ background: item.color }} aria-hidden="true" />
              <span>{item.key}</span>
              <strong>{counts[item.key]}</strong>
            </li>
          ))}
        </ul>
      </div>
      <p className="breakdown-note"><TrendingUp size={20} aria-hidden="true" /> {message}</p>
    </Panel>
  );
}

function Overview({
  tasks, openTasks, tasksLoading, plan, risks, now, focusTask, available, onAvailable,
  onToggleTask, onNavigate, onPlanWithEdith, onNewTask,
}) {
  return (
    <div className="dash">
      <header className="hero">
        <p className="hero-greeting">{greetingFor(now)}, {PROFILE.name}</p>
        <h1>Turn your plans<br />into <em>progress.</em></h1>
        <p className="hero-sub">EDITH helps you plan, focus and never miss what matters.</p>
        <p className="hero-script" aria-hidden="true">Same you,<br />brighter days</p>
      </header>

      <KpiRow tasks={tasks} openTasks={openTasks} plan={plan} risks={risks} now={now} loading={tasksLoading} />

      <div className="dash-row dash-row-top">
        <FocusCard
          task={focusTask}
          now={now}
          loading={tasksLoading}
          onToggleTask={onToggleTask}
          onPlan={onPlanWithEdith}
          onAddTask={onNewTask}
          onOpenFocus={() => onNavigate("focus")}
        />
        <DeadlinesCard
          openTasks={openTasks}
          now={now}
          loading={tasksLoading}
          onViewAll={() => onNavigate("tasks")}
          onComplete={onToggleTask}
        />
      </div>

      <div className="dash-row dash-row-bottom">
        <PlanCard plan={plan} now={now} available={available} onAvailable={onAvailable} onViewFull={() => onNavigate("schedule")} />
        <WeeklyCard tasks={tasks} now={now} />
        <BreakdownCard tasks={tasks} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pages: tasks, schedule, focus, rescue                              */
/* ------------------------------------------------------------------ */

function PageHeader({ page }) {
  const [title, subtitle] = PAGE_TITLES[page];
  return (
    <header className="page-head">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}

function TaskRow({ task, now, onToggle, onDelete }) {
  const when = countdown(task, now);
  return (
    <article className={`task-row ${task.done ? "task-done" : ""}`}>
      <button
        type="button"
        className={`task-check ${task.done ? "checked" : ""}`}
        onClick={() => onToggle(task.id)}
        aria-label={task.done ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
        aria-pressed={task.done}
      >
        {task.done && <Check size={14} />}
      </button>
      <div className="task-main">
        <strong>{task.title}</strong>
        <span>{task.project} · {formatMinutes(task.minutes)}</span>
      </div>
      <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
      <div className="task-date">
        <span><CalendarDays size={13} aria-hidden="true" /> {dueLabel(task, now)}</span>
        {!task.done && <em className={`tone-${when.tone}`}>{when.label}</em>}
      </div>
      <button
        type="button"
        className="task-delete"
        onClick={() => { if (window.confirm(`Delete “${task.title}”? This can't be undone.`)) onDelete(task.id); }}
        aria-label={`Delete ${task.title}`}
      >
        <Trash2 size={15} />
      </button>
    </article>
  );
}

function TasksPage({ tasks, now, loading, projectFilter, onProjectFilter, onToggle, onDelete, onAdd }) {
  const [filter, setFilter] = useState("all");
  const projects = useMemo(() => [...new Set(tasks.map((task) => task.project))].sort(), [tasks]);
  const scoped = projectFilter ? tasks.filter((task) => task.project === projectFilter) : tasks;
  const counts = { all: scoped.length, open: scoped.filter((task) => !task.done).length, done: scoped.filter((task) => task.done).length };
  const visible = scoped
    .filter((task) => filter === "all" || (filter === "open" ? !task.done : task.done))
    .sort((a, b) => Number(a.done) - Number(b.done) || byDeadline(a, b));

  return (
    <section className="page-card glass">
      <div className="filter-row">
        {[["all", "Everything"], ["open", "In progress"], ["done", "Completed"]].map(([id, label]) => (
          <button key={id} type="button" className={`filter-chip ${filter === id ? "active" : ""}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}<span>{counts[id]}</span>
          </button>
        ))}
        {projects.length > 1 && (
          <label className="filter-select">
            <span className="sr-only">Project</span>
            <select className="select-pill" value={projectFilter} onChange={(event) => onProjectFilter(event.target.value)}>
              <option value="">All projects</option>
              {projects.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
        <button type="button" className="button-primary filter-add" onClick={onAdd}><Plus size={16} /> Add a task</button>
      </div>
      {loading ? <Skeleton lines={4} /> : visible.length ? (
        <div className="task-list">{visible.map((task) => <TaskRow key={task.id} task={task} now={now} onToggle={onToggle} onDelete={onDelete} />)}</div>
      ) : (
        <EmptyState text="Nothing here just yet. That's okay." />
      )}
    </section>
  );
}

function SchedulePage({ tasks }) {
  const [available, setAvailable] = useState("240");
  const minutes = Math.max(0, Number(available) || 0);
  const taskSignature = tasks.map((task) => `${task.id}:${task.done}:${task.minutes}:${task.deadline}`).join("|");
  const fetchPlan = useCallback(() => api.getSchedule(minutes), [minutes]);
  const { data: plan, loading, error, reload: loadPlan } = useRemote(fetchPlan, taskSignature);

  const schedule = plan?.schedule || [];
  const unscheduled = plan?.unscheduled || [];

  return (
    <section className="page-card glass">
      <div className="planner-controls">
        <label>Focused time available
          <input type="number" min="0" step="15" value={available} onChange={(event) => setAvailable(event.target.value)} />
          <span>minutes</span>
        </label>
        <button type="button" className="button-primary" onClick={loadPlan} disabled={loading}>{loading ? "Planning…" : "Refresh plan"} <ArrowRight size={15} /></button>
      </div>
      {error && <InlineError message={error} onRetry={loadPlan} />}
      {!loading && !error && schedule.length === 0 && unscheduled.length === 0 && <EmptyState text="Your schedule is open. Add a task to begin." icon={CalendarDays} />}
      {schedule.length > 0 && (
        <div className="schedule-list">
          {schedule.map((item) => (
            <div className="schedule-day" key={`${item.task_id}-${item.start}`}>
              <div className="schedule-date"><span>Focus</span><strong>{item.duration_minutes}</strong><small>min</small></div>
              <div className="schedule-item">
                <span className="schedule-time">{new Date(item.start).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{formatDateTime(item.start)} — {formatDateTime(item.end)}</small>
                </div>
                <span className={`priority priority-${String(item.priority).toLowerCase()}`}>{item.priority}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {unscheduled.length > 0 && (
        <div className="deferred-block">
          <h2>{unscheduled.length} task{unscheduled.length === 1 ? "" : "s"} need another window.</h2>
          {unscheduled.map((item) => <p key={item.task.id}><strong>{item.task.title}</strong> — {item.reason}</p>)}
        </div>
      )}
      {plan && <p className="plan-summary"><Clock3 size={15} aria-hidden="true" /> {plan.scheduled_minutes} of {plan.available_minutes} minutes planned · {plan.remaining_minutes} minutes still open</p>}
    </section>
  );
}

const PRESETS = [25, 45, 60, 90];

function FocusPage({ openTasks, focusTask, now, onToggleTask, onNewTask }) {
  const focus = useFocus();
  const locked = focus.status === "running" || focus.status === "paused";
  const options = focusTask && !openTasks.some((task) => task.id === focusTask.id) ? [focusTask, ...openTasks] : openTasks;
  const upNext = openTasks.filter((task) => task.id !== focusTask?.id).slice(0, 4);

  const commitMinutes = (event) => {
    const value = Number(event.target.value);
    if (Number.isFinite(value) && value >= 1) focus.setDuration(value);
    else event.target.value = focus.minutes;
  };

  if (!focusTask) {
    return (
      <section className="page-card glass">
        <EmptyState text="No open tasks to focus on. Add one to start a session." icon={Target}>
          <button type="button" className="button-primary" onClick={onNewTask}><Plus size={16} /> Add a task</button>
        </EmptyState>
      </section>
    );
  }

  return (
    <div className="focus-page">
      <section className="focus-stage glass">
        <FocusRing taskId={focusTask.id} size="lg" />
        <div className="focus-setup">
          <label className="field">
            <span>Working on</span>
            <select value={focusTask.id} disabled={locked} onChange={(event) => focus.setTaskId(Number(event.target.value))}>
              {options.map((task) => <option key={task.id} value={task.id}>{task.title} · {formatMinutes(task.minutes)}</option>)}
            </select>
          </label>
          <p className="focus-meta-line">
            <CalendarDays size={15} aria-hidden="true" /> {dueLabel(focusTask, now)} · {focusTask.priority} priority
          </p>
          <div className="field">
            <span id="session-length">Session length</span>
            <div className="chip-row" role="group" aria-labelledby="session-length">
              {PRESETS.map((value) => (
                <button key={value} type="button" className={`filter-chip ${focus.minutes === value ? "active" : ""}`} aria-pressed={focus.minutes === value} disabled={locked} onClick={() => focus.setDuration(value)}>
                  {value} min
                </button>
              ))}
              <label className="minutes-input">
                <span className="sr-only">Custom minutes</span>
                <input
                  key={focus.minutes}
                  type="number"
                  min="1"
                  max="240"
                  defaultValue={focus.minutes}
                  disabled={locked}
                  onBlur={commitMinutes}
                  onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                />
                <span>min</span>
              </label>
            </div>
          </div>
          <FocusControls task={focusTask} onToggleTask={onToggleTask} />
        </div>
      </section>

      <Panel title="Up next" className="up-next">
        {upNext.length === 0 ? (
          <EmptyState text="This is your only open task." icon={Target} />
        ) : (
          <ol className="deadline-list">
            {upNext.map((task) => {
              const when = countdown(task, now);
              return (
                <li className="deadline deadline-simple" key={task.id}>
                  <span className={`deadline-dot tone-${when.tone}`} aria-hidden="true" />
                  <div className="deadline-main"><strong>{task.title}</strong><span>{formatMinutes(task.minutes)} · {task.priority}</span></div>
                  <span className={`badge tone-${when.tone}`}>{when.label}</span>
                  <button type="button" className="button-outline small" disabled={locked} onClick={() => focus.setTaskId(task.id)}>Focus on this</button>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </div>
  );
}

function RescuePage({ onNavigate }) {
  const [available, setAvailable] = useState("120");
  const [disruption, setDisruption] = useState("0");
  const [recovery, setRecovery] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fetchHistory = useCallback(() => api.getRecoveryHistory(), []);
  const historyState = useRemote(fetchHistory, 0);
  const history = historyState.data || [];

  async function buildRecovery() {
    setLoading(true);
    setError("");
    try {
      const result = await api.recover(Math.max(0, Number(available) || 0), Math.max(0, Number(disruption) || 0));
      setRecovery(result);
      await historyState.reload();
    } catch (requestError) {
      setError(friendlyError(requestError, "We couldn't rebuild your plan."));
    } finally {
      setLoading(false);
    }
  }

  const schedule = recovery?.schedule?.schedule || [];
  const deferred = recovery?.schedule?.unscheduled || [];
  const risks = recovery?.deadline_risks || [];

  return (
    <section className="rescue-layout">
      <div className="rescue-form glass">
        <h2>Let's start with today.</h2>
        <label>How much focused time did you have?
          <div className="time-input"><Clock3 size={17} aria-hidden="true" /><input type="number" min="0" step="15" value={available} onChange={(event) => setAvailable(event.target.value)} /><span>minutes</span></div>
        </label>
        <label>How much time did the disruption take?
          <div className="time-input"><RotateCcw size={17} aria-hidden="true" /><input type="number" min="0" step="5" value={disruption} onChange={(event) => setDisruption(event.target.value)} /><span>minutes</span></div>
        </label>
        <p className="form-hint"><Target size={15} aria-hidden="true" /> Your saved tasks are replanned by deadline, priority, and the time left after the interruption.</p>
        {error && <InlineError message={error} />}
        <button type="button" className="button-primary generate-button" onClick={buildRecovery} disabled={loading}>
          <Sparkles size={16} /> {loading ? "Rebuilding…" : "Build my recovery plan"} <ArrowRight size={16} />
        </button>
        {history.length > 0 && <p className="history-note">Last reset: {history[0].disruption_minutes} minutes lost · {history[0].scheduled_count} task{history[0].scheduled_count === 1 ? "" : "s"} replanned</p>}
      </div>

      <div className="rescue-preview glass">
        {!recovery ? (
          <div className="preview-empty">
            <Sparkle size={30} strokeWidth={1.3} aria-hidden="true" />
            <h3>Progress, not perfection.</h3>
            <p>Your reset plan will appear here. We'll make the most of the time you have.</p>
          </div>
        ) : (
          <>
            <h3 className="plan-heading">{schedule.length ? "Here's a place to start." : "Let's make this smaller."}</h3>
            <p className="plan-description">{recovery.available_minutes_after_disruption} minutes remain after the interruption. This plan is saved so future sessions can retain the recovery context.</p>
            <ol className="plan-items">
              {schedule.map((item, index) => (
                <li className="plan-item" key={`${item.task_id}-${item.start}`}>
                  <span className="plan-number">{index + 1}</span>
                  <div><strong>{item.title}</strong><small>{item.duration_minutes} minutes · {item.priority} priority</small></div>
                  <CheckCircle2 size={17} aria-hidden="true" />
                </li>
              ))}
            </ol>
            {!schedule.length && <p className="no-fit">No task fits this time window. Try adding time or choosing one small task to start.</p>}
            {deferred.length > 0 && (
              <div className="recovery-deferred">
                <h4>{deferred.length} task{deferred.length === 1 ? "" : "s"} to revisit</h4>
                {deferred.map((item) => {
                  const minutesNeeded = Number(item.task?.estimated_minutes) || 0;
                  const reason = item.reason || "This task could not be scheduled.";
                  const shortfall = minutesNeeded - (Number(recovery.available_minutes_after_disruption) || 0);
                  const needsMoreTime = reason.toLowerCase().includes("insufficient available time");
                  return (
                    <div className="recovery-deferred-item" key={item.task.id}>
                      <strong>{item.task.title}</strong>
                      <p>{reason}</p>
                      {needsMoreTime && minutesNeeded > 0 && (
                        <>
                          <small>Estimated focus time: {minutesNeeded} minutes.</small>
                          {schedule.length === 0 && shortfall > 0 && <small>You are {shortfall} minutes short of fitting this task into the available window.</small>}
                        </>
                      )}
                    </div>
                  );
                })}
                <p className="recovery-kindness">You don't have to do everything at once. Choose a longer window or come back to this task later.</p>
              </div>
            )}
            {risks.length > 0 && (
              <div className="risk-note">
                <strong>{risks.length} deadline risk{risks.length === 1 ? "" : "s"}</strong>
                {risks.slice(0, 2).map((risk) => <span key={risk.task_id}>{risk.title}: {risk.reason}</span>)}
              </div>
            )}
            <div className="plan-footer">
              <span><Clock3 size={15} aria-hidden="true" /> {recovery.schedule.scheduled_minutes} of {recovery.available_minutes_after_disruption} minutes planned</span>
              <button type="button" className="text-link" onClick={() => onNavigate("tasks")}>Review tasks <ArrowUpRight size={14} /></button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pages: projects, notes, analytics                                  */
/* ------------------------------------------------------------------ */

function ProjectsPage({ tasks, now, loading, onOpenProject, onNewTask }) {
  const groups = useMemo(() => {
    const map = new Map();
    tasks.forEach((task) => {
      const group = map.get(task.project) || { name: task.project, open: 0, done: 0, minutes: 0, next: null };
      if (task.done) group.done += 1;
      else {
        group.open += 1;
        group.minutes += Number(task.minutes) || 0;
        if (!group.next || byDeadline(task, group.next) < 0) group.next = task;
      }
      map.set(task.project, group);
    });
    return [...map.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  }, [tasks]);

  if (loading) return <section className="page-card glass"><Skeleton lines={4} /></section>;
  if (groups.length === 0) {
    return (
      <section className="page-card glass">
        <EmptyState text="No projects yet. A project appears as soon as a task belongs to it." icon={Folder}>
          <button type="button" className="button-primary" onClick={onNewTask}><Plus size={16} /> Add a task</button>
        </EmptyState>
      </section>
    );
  }

  return (
    <div className="project-grid">
      {groups.map((group) => {
        const total = group.open + group.done;
        const percent = total ? Math.round((group.done / total) * 100) : 0;
        const when = group.next ? countdown(group.next, now) : null;
        return (
          <button type="button" className="project-card glass" key={group.name} onClick={() => onOpenProject(group.name)}>
            <span className="project-name">{group.name}</span>
            <span className="project-stats">{group.open} open · {group.done} done · {formatMinutes(group.minutes)} left</span>
            <span className="meter" role="meter" aria-label={`${group.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></span>
            <span className="project-next">
              {group.next ? <>Next: <b>{group.next.title}</b> <em className={`tone-${when.tone}`}>{when.label}</em></> : "Everything here is done."}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NotesPage({ revision }) {
  const fetchNotes = useCallback(() => api.getAssistantMemory(), []);
  const notes = useRemote(fetchNotes, revision);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState("");
  const bodyRef = useRef(null);

  async function save(event) {
    event.preventDefault();
    const key = title.trim();
    const value = body.trim();
    if (!key || !value) return;
    setSaving(true);
    setFormError("");
    setSaved("");
    try {
      await api.saveAssistantMemory(key, value);
      setTitle("");
      setBody("");
      setSaved(`Saved “${key}”.`);
      await notes.reload();
    } catch (requestError) {
      setFormError(friendlyError(requestError, "We couldn't save that note."));
    } finally {
      setSaving(false);
    }
  }

  const list = notes.data || [];

  return (
    <div className="notes-layout">
      <form className="note-form glass" onSubmit={save}>
        <h2>Add a note</h2>
        <label>Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="e.g. exam week" required />
        </label>
        <label>Note
          <textarea ref={bodyRef} value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} rows={5} placeholder="What should EDITH remember?" required />
        </label>
        <p className="form-hint">Notes are EDITH's saved memory. Saving under an existing title replaces that note.</p>
        {formError && <InlineError message={formError} />}
        {saved && <p className="saved-note" role="status"><CheckCircle2 size={15} aria-hidden="true" /> {saved}</p>}
        <button type="submit" className="button-primary" disabled={saving || !title.trim() || !body.trim()}>{saving ? "Saving…" : "Save note"}</button>
      </form>

      <section className="notes-list glass" aria-label="Saved notes">
        {notes.loading && !notes.data ? <Skeleton lines={4} /> : notes.error ? <InlineError message={notes.error} onRetry={notes.reload} /> : list.length === 0 ? (
          <EmptyState text="No notes yet. Save one here, or tell EDITH “remember that…”." icon={StickyNote} />
        ) : (
          <ul>
            {list.map((note) => (
              <li className="note" key={note.memory_key}>
                <div>
                  <strong>{note.memory_key}</strong>
                  <p>{note.memory_value}</p>
                  <small>Updated {new Date(note.updated_at).toLocaleString()}</small>
                </div>
                <button type="button" className="button-outline small" onClick={() => { setTitle(note.memory_key); setBody(note.memory_value); setSaved(""); bodyRef.current?.focus(); }}>Edit</button>
              </li>
            ))}
          </ul>
        )}
        <p className="form-hint">The backend has no delete endpoint for notes yet, so they can be edited but not removed here.</p>
      </section>
    </div>
  );
}

function MeterRow({ label, value, max, display }) {
  return (
    <li className="meter-row">
      <span>{label}</span>
      <span className="meter"><span style={{ width: `${max > 0 ? Math.max(value > 0 ? 4 : 0, Math.round((value / max) * 100)) : 0}%` }} /></span>
      <strong>{display ?? value}</strong>
    </li>
  );
}

function AnalyticsPage({ tasks, openTasks, now, loading }) {
  const fetchHistory = useCallback(() => api.getRecoveryHistory(5), []);
  const history = useRemote(fetchHistory, 0);

  if (loading) return <section className="page-card glass"><Skeleton lines={4} /></section>;
  if (tasks.length === 0) {
    return <section className="page-card glass"><EmptyState text="Analytics start once you have saved tasks." icon={ChartColumn} /></section>;
  }

  const done = tasks.filter((task) => task.done);
  const rate = Math.round((done.length / tasks.length) * 100);
  const openMinutes = openTasks.reduce((sum, task) => sum + (Number(task.minutes) || 0), 0);
  const doneMinutes = done.reduce((sum, task) => sum + (Number(task.minutes) || 0), 0);
  const overdue = openTasks.filter((task) => dueMs(task) < now).length;

  const byPriority = Object.entries(
    openTasks.reduce((acc, task) => ({ ...acc, [task.priority]: (acc[task.priority] || 0) + (Number(task.minutes) || 0) }), {}),
  ).sort(([a], [b]) => (PRIORITY_RANK[a] ?? 9) - (PRIORITY_RANK[b] ?? 9));
  const priorityMax = Math.max(0, ...byPriority.map(([, value]) => value));

  const byProject = Object.entries(tasks.reduce((acc, task) => ({ ...acc, [task.project]: (acc[task.project] || 0) + 1 }), {})).sort(([, a], [, b]) => b - a);
  const projectMax = Math.max(0, ...byProject.map(([, value]) => value));

  const upcoming = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setDate(day.getDate() + index);
    const key = localDate(day);
    return {
      key,
      label: index === 0 ? "Today" : day.toLocaleDateString("en", { weekday: "short" }),
      minutes: openTasks.filter((task) => task.date === key).reduce((sum, task) => sum + (Number(task.minutes) || 0), 0),
    };
  });
  const upcomingMax = Math.max(0, ...upcoming.map((day) => day.minutes));

  return (
    <div className="analytics">
      <section className="stat-row" aria-label="Totals">
        <div className="stat glass"><strong>{rate}%</strong><span>Tasks completed</span></div>
        <div className="stat glass"><strong>{formatMinutes(openMinutes)}</strong><span>Work still open</span></div>
        <div className="stat glass"><strong>{formatMinutes(doneMinutes)}</strong><span>Work completed</span></div>
        <div className="stat glass"><strong>{overdue}</strong><span>Open and overdue</span></div>
      </section>

      <div className="analytics-grid">
        <Panel title="Open work by priority">
          {byPriority.length === 0 ? <p className="muted-line">No open work.</p> : (
            <ul className="meter-list">{byPriority.map(([label, value]) => <MeterRow key={label} label={label} value={value} max={priorityMax} display={formatMinutes(value)} />)}</ul>
          )}
        </Panel>
        <Panel title="Tasks by project">
          <ul className="meter-list">{byProject.map(([label, value]) => <MeterRow key={label} label={label} value={value} max={projectMax} />)}</ul>
        </Panel>
        <Panel title="Next 7 days">
          <ul className="mini-bars" aria-label="Minutes due per day for the next seven days">
            {upcoming.map((day) => (
              <li key={day.key} title={`${day.label}: ${formatMinutes(day.minutes)} due`}>
                <span className="mini-bar"><i style={{ height: upcomingMax ? `${Math.max(day.minutes > 0 ? 6 : 0, Math.round((day.minutes / upcomingMax) * 100))}%` : "0%" }} /></span>
                <small>{day.label}</small>
                <span className="sr-only">{formatMinutes(day.minutes)} due</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Recent recovery events">
          {history.loading && !history.data ? <Skeleton lines={3} /> : history.error ? <InlineError message={history.error} onRetry={history.reload} /> : !history.data?.length ? (
            <p className="muted-line">No recovery plans yet. Build one from Deadline Rescue.</p>
          ) : (
            <ul className="history-list">
              {history.data.map((event) => (
                <li key={event.id}>
                  <strong>{event.disruption_minutes} min lost</strong>
                  <span>{event.scheduled_count} replanned · {event.unscheduled_count} deferred · {event.risk_count} at risk</span>
                  <small>{new Date(event.created_at).toLocaleString()}</small>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* EDITH Studio: assistant workspace + Alexa+ simulator               */
/* ------------------------------------------------------------------ */

function friendlyMcpSummary(result, label) {
  const data = result?.structuredContent ?? result ?? {};
  const title = label || "Your request is complete";
  if (Array.isArray(data.tasks)) {
    const open = data.tasks.filter((task) => !task.completed);
    return { title: "Here are your tasks", message: `${data.tasks.length} saved task${data.tasks.length === 1 ? "" : "s"}; ${open.length} still open.`, items: data.tasks.map((task) => `${task.title}${task.completed ? " — completed" : " — open"}`) };
  }
  if (Array.isArray(data.risks) || typeof data.count === "number") {
    const risks = data.risks || [];
    return { title: risks.length ? "A few deadlines need attention" : "You're clear for now", message: risks.length ? `${risks.length} deadline risk${risks.length === 1 ? "" : "s"} found.` : "No deadline risks were found in the current check.", items: risks.slice(0, 5).map((risk) => risk.title || risk.task_title || risk.message || "A task may need attention") };
  }
  const schedule = data.schedule && typeof data.schedule === "object" ? data.schedule : data;
  if (Array.isArray(schedule.schedule) || Array.isArray(schedule.unassigned)) {
    const planned = schedule.schedule || [];
    const deferred = schedule.unassigned || [];
    return { title: "Your focus plan is ready", message: `${planned.length} task${planned.length === 1 ? "" : "s"} planned${deferred.length ? `, ${deferred.length} left for another session` : ""}.`, items: planned.slice(0, 5).map((item) => `${item.task?.title || item.title || "Task"}${item.start_time ? ` · ${item.start_time}` : ""}`) };
  }
  if (data.message || data.summary) return { title, message: data.message || data.summary, items: [] };
  return { title, message: "EDITH completed the request and received an update from your workspace.", items: [] };
}

function AlexaPane() {
  const [connection, setConnection] = useState(null);
  const [activity, setActivity] = useState([]);
  const [result, setResult] = useState(null);
  const [resultLabel, setResultLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function connect() {
    setLoading(true);
    setError("");
    try {
      const session = await api.initializeMcp();
      setConnection(session);
      setActivity([`Assistant services ready · ${session.tools.length} capabilities available`]);
      return session;
    } catch {
      setError("EDITH couldn't reach its local services. Check that Deadline Rescue is running, then try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await api.initializeMcp();
        if (cancelled) return;
        setConnection(session);
        setActivity([`Assistant services ready · ${session.tools.length} capabilities available`]);
      } catch {
        if (!cancelled) setError("EDITH couldn't reach its local services. Check that Deadline Rescue is running, then try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function callTool(name, arguments_, label) {
    setLoading(true);
    setError("");
    setResultLabel(label);
    try {
      const session = connection || await connect();
      if (!session) return;
      const response = await api.callMcpTool(name, arguments_);
      setResult(response.structuredContent || response);
      setActivity((previous) => [...previous.slice(-4), `Completed: ${label}`]);
    } catch {
      setError("That didn't work just now. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  const summary = result ? friendlyMcpSummary(result, resultLabel) : null;
  const actions = [
    ["get_deadline_risks", {}, "Check deadlines", "What needs attention?"],
    ["build_focus_plan", { available_minutes: 120 }, "Plan the next 2 hours", "Plan my next 2 hours"],
    ["recover_from_disruption", { available_minutes: 180, disruption_minutes: 45 }, "Adjust after losing 45 minutes", "I lost 45 minutes"],
    ["get_recovery_history", { limit: 3 }, "Review recent changes", "What changed earlier?"],
  ];

  return (
    <div className="alexa-pane">
      <div className="mcp-status glass">
        <div>
          <h2>{loading && !connection ? "Getting things ready…" : connection ? "Your assistant is ready" : "Assistant needs a moment"}</h2>
          <p>{connection ? "Connected to your Deadline Rescue workspace." : "Your tasks are safe. We just need to reconnect to the local app."}</p>
        </div>
        {!connection && <button type="button" className="button-primary" onClick={connect} disabled={loading}>{loading ? "Connecting…" : "Try again"} <ArrowRight size={15} /></button>}
      </div>
      {error && <InlineError message={error} />}
      <div className="simulator-grid">
        <div className="simulator-actions glass">
          <h2>What can I help with?</h2>
          {actions.map(([name, args, label, text]) => (
            <button type="button" key={name} onClick={() => callTool(name, args, label)} disabled={loading || !connection}>{text} <ArrowRight size={15} /></button>
          ))}
        </div>
        <div className="simulator-result glass">
          {summary ? (
            <div className="friendly-result">
              <h2>{summary.title}</h2>
              <p>{summary.message}</p>
              {summary.items?.length > 0 && <ul>{summary.items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}
              <details className="chat-details"><summary>Technical details</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>
            </div>
          ) : (
            <div className="preview-empty">
              <Sparkle size={28} strokeWidth={1.3} aria-hidden="true" />
              <h2>{loading ? "Working on it…" : "Ready when you are."}</h2>
              <p>Choose an action and EDITH will give you a clear summary here.</p>
            </div>
          )}
        </div>
      </div>
      <details className="chat-details glass-note">
        <summary>Developer details</summary>
        {activity.map((entry, index) => <p key={`${entry}-${index}`}>{pad(index + 1)} · {entry}</p>)}
        <p>Self-hosted MCP server with a browser-based simulation. Not connected to a consumer Alexa+ device or private preview tools.</p>
      </details>
      <p className="disclosure">This is a hackathon simulation of an assistant experience, not a live connection to an Alexa+ device.</p>
    </div>
  );
}

const STUDIO_PROMPTS = [
  ["What should I work on?", "What should I work on?"],
  ["Plan 2 hours", "plan 120 minutes"],
  ["Check deadlines", "check deadline risks"],
  ["View my tasks", "show tasks"],
];

function AssistantPane({ chat, onViewTask }) {
  const fetchMemory = useCallback(() => api.getAssistantMemory(), []);
  const fetchActions = useCallback(() => api.getAssistantActions(8), []);
  const memory = useRemote(fetchMemory, chat.revision);
  const actions = useRemote(fetchActions, chat.revision);
  const memoryList = memory.data || [];
  const actionList = actions.data || [];

  return (
    <div className="assistant-pane">
      <section className="studio-chat glass" aria-label="Conversation with EDITH">
        <div className="studio-scroll">
          {chat.messages.length === 0 && !chat.busy && (
            <div className="studio-empty">
              <Bot size={26} aria-hidden="true" />
              <h2>Your day, within reach.</h2>
              <p>Ask EDITH to plan your time, organize tasks, check deadlines, or remember a note.</p>
              <div className="prompt-row">
                {STUDIO_PROMPTS.map(([label, text]) => <button type="button" key={label} onClick={() => chat.sendMessage(text)} disabled={chat.busy}>{label}</button>)}
              </div>
            </div>
          )}
          <ChatThread chat={chat} onViewTask={onViewTask} />
        </div>
        <ChatComposer chat={chat} />
      </section>

      <details className="context-disclosure glass">
        <summary>
          <span><Brain size={15} aria-hidden="true" /> Memory &amp; recent activity</span>
          <small>{memoryList.length} saved notes · {actionList.length} actions</small>
        </summary>
        <div className="context-body">
          <h4>Saved memory</h4>
          {memory.error ? <InlineError message={memory.error} onRetry={memory.reload} /> : memoryList.length ? memoryList.map((item) => (
            <div className="context-item" key={item.memory_key}>
              <strong>{item.memory_key}</strong>
              <p>{item.memory_value}</p>
              <small>Updated {new Date(item.updated_at).toLocaleString()}</small>
            </div>
          )) : <p className="muted-line">No saved notes yet. Ask EDITH to remember something specific.</p>}
          <h4><History size={14} aria-hidden="true" /> Recent actions</h4>
          {actions.error ? <InlineError message={actions.error} onRetry={actions.reload} /> : actionList.length ? actionList.map((item) => (
            <div className="context-action" key={item.id}>
              <strong>{item.action.replaceAll("_", " ")}</strong>
              <span>{new Date(item.created_at).toLocaleString()}</span>
              <small>{item.status}</small>
            </div>
          )) : <p className="muted-line">Completed actions will appear here.</p>}
        </div>
      </details>
      <p className="disclosure">EDITH combines local task management with AI-powered conversation. Your tasks and saved memory stay local; only the message you submit for a reply is sent to hosted AI.</p>
    </div>
  );
}

function StudioPage({ chat, onViewTask }) {
  const [tab, setTab] = useState("assistant");
  const tabs = [["assistant", "Assistant", Bot], ["alexa", "Alexa+ simulator", Sparkles]];
  return (
    <div className="studio">
      <div className="tabs" role="tablist" aria-label="EDITH Studio">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} tabIndex={tab === id ? 0 : -1} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "assistant" ? <AssistantPane chat={chat} onViewTask={onViewTask} /> : <AlexaPane />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shell + root                                                       */
/* ------------------------------------------------------------------ */

function readStored(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function Shell({ onReplayIntro }) {
  const focus = useFocus();
  const now = useNow(30000);
  const [page, setPage] = useState("overview");
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [modal, setModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");
  const [available, setAvailable] = useState(() => {
    const saved = Number(readStored(MINUTES_KEY, "240"));
    return Number.isFinite(saved) && saved >= 0 && saved <= 10080 ? saved : 240;
  });
  const [scene, setScene] = useState(() => (readStored(SCENE_KEY, "dusk") === "night" ? "night" : "dusk"));
  const commandRef = useRef(null);
  const composerRef = useRef(null);
  const mainRef = useRef(null);
  const isDrawer = useMediaQuery("(max-width: 1279px)");
  const isMobile = useMediaQuery("(max-width: 899px)");

  const refreshTasks = useCallback(async () => {
    try {
      const list = await api.listTasks();
      setTasks(list);
      setDataError("");
    } catch (requestError) {
      setDataError(friendlyError(requestError, "Deadline Rescue could not load your saved tasks."));
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.listTasks()
      .then((list) => {
        if (cancelled) return;
        setTasks(list);
        setDataError("");
      })
      .catch((requestError) => {
        if (!cancelled) setDataError(friendlyError(requestError, "Deadline Rescue could not load your saved tasks."));
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const chat = useEdithChat({ refreshTasks });

  const signature = useMemo(() => tasks.map((task) => `${task.id}:${task.done}:${task.minutes}:${task.deadline}`).join("|"), [tasks]);
  const fetchPlan = useCallback(() => api.getSchedule(available), [available]);
  const fetchRisks = useCallback(() => api.getDeadlineRisks(), []);
  const plan = useRemote(fetchPlan, signature, !tasksLoading);
  const risks = useRemote(fetchRisks, signature, !tasksLoading);

  const openTasks = useMemo(() => tasks.filter((task) => !task.done).sort(byDeadline), [tasks]);
  const projectNames = useMemo(
    () => [...new Set(["Personal", "College", "Academics", "Deadline Rescue", "Work", ...tasks.map((task) => task.project)])],
    [tasks],
  );
  const sessionTask = focus.status !== "idle" ? tasks.find((task) => task.id === focus.sessionTaskId) ?? null : null;
  const focusTask = sessionTask ?? pickFocusTask(openTasks, plan.data, focus.taskId);

  const focusTaskId = focusTask?.id;
  const focusTaskMinutes = focusTask?.minutes;
  useEffect(() => {
    if (focus.status === "idle" && focusTaskMinutes != null) focus.setDuration(defaultSession({ minutes: focusTaskMinutes }));
  }, [focusTaskId, focusTaskMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { localStorage.setItem(MINUTES_KEY, String(available)); } catch { /* ignore */ }
  }, [available]);
  useEffect(() => {
    try { localStorage.setItem(SCENE_KEY, scene); } catch { /* ignore */ }
  }, [scene]);

  // Drawers only exist on narrow screens; on desktop the stored flags are simply ignored.
  const railShown = isDrawer && railOpen;
  const menuShown = isMobile && menuOpen;
  useEffect(() => { if (railShown) composerRef.current?.focus(); }, [railShown]);

  const locked = modal || menuShown || railShown;
  useEffect(() => {
    if (!locked) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [locked]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        setModal(false);
        setMenuOpen(false);
        setRailOpen(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !modal) {
        event.preventDefault();
        commandRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  const navigate = useCallback((id) => {
    setPage(id);
    setMenuOpen(false);
    setRailOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, []);

  async function addTask(task) {
    const created = await api.createTask(task);
    setTasks((old) => [...old, created].sort(byDeadline));
  }
  async function toggleTask(id) {
    const current = tasks.find((task) => task.id === id);
    if (!current) return;
    try {
      const updated = await api.updateTask(id, { completed: !current.done });
      setTasks((old) => old.map((task) => (task.id === id ? updated : task)));
    } catch (requestError) {
      setDataError(friendlyError(requestError, "We couldn't update that task."));
    }
  }
  async function deleteTask(id) {
    try {
      await api.deleteTask(id);
      setTasks((old) => old.filter((task) => task.id !== id));
    } catch (requestError) {
      setDataError(friendlyError(requestError, "We couldn't delete that task."));
    }
  }

  const ask = useCallback((text) => {
    if (isDrawer) setRailOpen(true);
    chat.sendMessage(text);
  }, [chat, isDrawer]);

  const onSuggest = useCallback((id, kind, label) => {
    if (kind === "send") {
      chat.sendMessage(label);
    } else if (kind === "local") {
      const upcoming = openTasks.slice(0, 5);
      chat.addLocal(
        label,
        upcoming.length
          ? `Here ${upcoming.length === 1 ? "is your next deadline" : `are your next ${upcoming.length} deadlines`}, straight from your saved tasks.`
          : "You have no open tasks with deadlines. Add one and it will show up here.",
        upcoming,
      );
    } else {
      const prefix = "Add a task to ";
      chat.setInput(`${prefix} tomorrow for 30 minutes`);
      requestAnimationFrame(() => {
        const el = composerRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(prefix.length, prefix.length);
        }
      });
    }
  }, [chat, openTasks]);

  const viewTask = useCallback(() => navigate("tasks"), [navigate]);
  const openProject = useCallback((name) => { setProjectFilter(name); navigate("tasks"); }, [navigate]);
  const online = !dataError;

  return (
    <div className={`app scene-${scene}`}>
      <Scene />
      <div className="shell">
        <Sidebar
          page={page}
          onNavigate={navigate}
          onClose={() => setMenuOpen(false)}
          inert={isMobile && !menuShown}
          open={menuShown}
          chat={chat}
          onReplayIntro={onReplayIntro}
        />
        <TopBar
          now={now}
          risks={risks.data}
          risksLoading={risks.loading && !risks.data}
          scene={scene}
          onScene={() => setScene((value) => (value === "night" ? "dusk" : "night"))}
          onMenu={() => setMenuOpen(true)}
          onOpenRail={() => setRailOpen((value) => !value)}
          showMenu={isMobile}
          showRailButton={isDrawer}
          railOpen={railShown}
        />

        <main className="main" id="main" ref={mainRef} tabIndex={-1}>
          <div className="main-inner">
            <CommandBar onAsk={ask} onNewTask={() => setModal(true)} inputRef={commandRef} />
            {dataError && <InlineError message={dataError} onRetry={refreshTasks} />}
            {page !== "overview" && <PageHeader page={page} />}

            {page === "overview" && (
              <Overview
                tasks={tasks}
                openTasks={openTasks}
                tasksLoading={tasksLoading}
                plan={plan}
                risks={risks}
                now={now}
                focusTask={focusTask}
                available={available}
                onAvailable={setAvailable}
                onToggleTask={toggleTask}
                onNavigate={navigate}
                onPlanWithEdith={() => ask(`plan ${available} minutes`)}
                onNewTask={() => setModal(true)}
              />
            )}
            {page === "tasks" && (
              <TasksPage
                tasks={tasks}
                now={now}
                loading={tasksLoading}
                projectFilter={projectFilter}
                onProjectFilter={setProjectFilter}
                onToggle={toggleTask}
                onDelete={deleteTask}
                onAdd={() => setModal(true)}
              />
            )}
            {page === "schedule" && <SchedulePage tasks={tasks} />}
            {page === "focus" && <FocusPage openTasks={openTasks} focusTask={focusTask} now={now} onToggleTask={toggleTask} onNewTask={() => setModal(true)} />}
            {page === "rescue" && <RescuePage onNavigate={navigate} />}
            {page === "projects" && <ProjectsPage tasks={tasks} now={now} loading={tasksLoading} onOpenProject={openProject} onNewTask={() => setModal(true)} />}
            {page === "notes" && <NotesPage revision={chat.revision} />}
            {page === "analytics" && <AnalyticsPage tasks={tasks} openTasks={openTasks} now={now} loading={tasksLoading} />}
            {page === "studio" && <StudioPage chat={chat} onViewTask={viewTask} />}

            <footer className="app-footer">
              <span>EDITH · Deadline Rescue</span>
              <span><Command size={12} aria-hidden="true" /> K to ask EDITH</span>
            </footer>
          </div>
        </main>

        <EdithRail
          chat={chat}
          online={online}
          isDrawer={isDrawer}
          open={railShown}
          onClose={() => setRailOpen(false)}
          composerRef={composerRef}
          onSuggest={onSuggest}
          onViewTask={viewTask}
        />
        {menuShown && <button type="button" className="scrim" onClick={() => setMenuOpen(false)} aria-label="Close menu" />}
        {railShown && <button type="button" className="scrim scrim-rail" onClick={() => setRailOpen(false)} aria-label="Close assistant" />}
      </div>

      {modal && <AddTaskModal onClose={() => setModal(false)} onAdd={addTask} projects={projectNames} />}
    </div>
  );
}

export default function App() {
  const [entered, setEntered] = useState(false);
  if (!entered) return <CinematicIntro onComplete={() => setEntered(true)} />;
  return (
    <FocusProvider>
      <Shell onReplayIntro={() => setEntered(false)} />
    </FocusProvider>
  );
}
