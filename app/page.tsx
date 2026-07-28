"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type DayCode = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

type Meeting = {
  days: DayCode[];
  start: string;
  end: string;
  room: string;
};

type Subject = {
  id: string;
  sectionId?: string;
  internalId?: string;
  code: string;
  title: string;
  units: number;
  color: string;
  meeting: Meeting;
};

type Task = {
  id: string;
  subjectId: string;
  title: string;
  dueAt: string;
  done: boolean;
};

type Profile = {
  nickname: string;
  program: string;
  yearLevel: string;
};

type SkedData = {
  semester: string;
  block: string;
  totalUnits: number;
  termStart: string;
  termEnd: string;
  profile: Profile;
  subjects: Subject[];
  tasks: Task[];
  createdAt: string;
};

type ParseIssue = {
  kind: "empty" | "fees-only" | "missing-table" | "empty-table" | "incomplete";
  title: string;
  detail: string;
};

type ParseResult = {
  semester: string;
  block: string;
  totalUnits: number;
  program: string;
  yearLevel: string;
  subjects: Subject[];
  warnings: string[];
};

type View = "today" | "calendar" | "tasks" | "subjects" | "settings";

const STORAGE_KEY = "anosked.local.v1";
const COLORS = ["#625AF6", "#F06F5E", "#1F9D78", "#D08B22", "#4B87E5", "#A64CC7"];
const DAY_META: Array<{ code: DayCode; short: string; label: string; js: number }> = [
  { code: "MO", short: "M", label: "Monday", js: 1 },
  { code: "TU", short: "T", label: "Tuesday", js: 2 },
  { code: "WE", short: "W", label: "Wednesday", js: 3 },
  { code: "TH", short: "Th", label: "Thursday", js: 4 },
  { code: "FR", short: "F", label: "Friday", js: 5 },
  { code: "SA", short: "S", label: "Saturday", js: 6 },
  { code: "SU", short: "Su", label: "Sunday", js: 0 },
];

const SAMPLE = `Welcome to Adamson University
Subject Enlistment
1st Semester 2026-2027
B.S. COMPUTER SCIENCE
Fourth Year - 1st Semester
Enrolled Subjects
Block No. : CS 402
Section
Subject
Units
25064
CS420 : CS RESEARCH PROJECT 2 (9750)
Wed 18:00-21:00 SV217
3
25069
CS467 : PE - CODING THEORY AND CRYPTOLOGY (250060)
MTh 19:30-21:00 SV213
3
25072
CS468 : PE- PARALLEL AND DISTRIBUTED COMPUTING (250065)
MTh 18:00-19:30 SV213
3
25066
CS342 : PROFESSIONAL ETHICS (9742)
TF 18:00-19:30 SV213
3
Total Units : 12`;

function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function decodeDays(raw: string): DayCode[] {
  const normalized = raw.trim().replace(/[,/&\-]/g, "");
  const tokens: Array<[string, DayCode]> = [
    ["Thursday", "TH"], ["Wednesday", "WE"], ["Tuesday", "TU"],
    ["Monday", "MO"], ["Friday", "FR"], ["Saturday", "SA"], ["Sunday", "SU"],
    ["Thu", "TH"], ["Th", "TH"], ["Wed", "WE"], ["Tue", "TU"],
    ["Mon", "MO"], ["Fri", "FR"], ["Sat", "SA"], ["Sun", "SU"],
    ["M", "MO"], ["T", "TU"], ["W", "WE"], ["F", "FR"], ["S", "SA"],
  ];
  const result: DayCode[] = [];
  let cursor = normalized;
  while (cursor.length) {
    const found = tokens.find(([token]) => cursor.toLowerCase().startsWith(token.toLowerCase()));
    if (!found) return [];
    result.push(found[1]);
    cursor = cursor.slice(found[0].length);
  }
  return [...new Set(result)];
}

function parseAdamson(text: string): { result?: ParseResult; issue?: ParseIssue } {
  const cleaned = text.replace(/\r/g, "").replace(/\u00a0/g, " ").trim();
  if (!cleaned) {
    return { issue: { kind: "empty", title: "Nothing was pasted", detail: "Copy the Enrolled Subjects section from your Subject Enlistment page, then paste it here." } };
  }

  const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
  const lower = cleaned.toLowerCase();
  const blockIndex = lines.findIndex((line) => /^Block\s*No\.?\s*:/i.test(line));
  const totalIndex = lines.findIndex((line, index) => index > blockIndex && /^Total\s+Units\s*:/i.test(line));

  if (blockIndex < 0) {
    if (/assessment of fees|tuition fee|total due|schedule of payment/i.test(lower)) {
      return { issue: { kind: "fees-only", title: "This looks like an assessment of fees", detail: "AnoSked found tuition or payment information, but not the enrolled-subjects table. Copy from Block No. through Total Units." } };
    }
    return { issue: { kind: "missing-table", title: "We couldn’t find an enrolled-subjects list", detail: "The pasted text needs the Block No., subject codes, class schedules, and Total Units from Subject Enlistment." } };
  }

  if (totalIndex < 0) {
    return { issue: { kind: "incomplete", title: "The subject list looks incomplete", detail: "AnoSked found the beginning of the table, but not Total Units. Copy through the Total Units line so every subject can be checked." } };
  }

  const semester = lines.find((line) => /^\d+(?:st|nd|rd|th)\s+Semester\s+\d{4}-\d{4}$/i.test(line)) || "";
  const program = lines.find((line) => /^(?:B\.?S\.?|B\.?A\.?|Bachelor|Master)/i.test(line)) || "";
  const yearLevelLine = lines.find((line) => /(?:First|Second|Third|Fourth|Fifth)\s+Year/i.test(line)) || "";
  const yearLevel = yearLevelLine.match(/(?:First|Second|Third|Fourth|Fifth)\s+Year/i)?.[0] || "";
  const block = lines[blockIndex].split(":").slice(1).join(":").trim();
  const declaredUnits = Number(lines[totalIndex].match(/([\d.]+)\s*$/)?.[1] || 0);
  const body = lines.slice(blockIndex + 1, totalIndex).filter((line) => !/^(Section|Subject|Units)$/i.test(line));
  const subjects: Subject[] = [];
  const warnings: string[] = [];

  for (let index = 0; index < body.length; index += 1) {
    const sectionId = body[index];
    const subjectLine = body[index + 1] || "";
    const match = subjectLine.match(/^([A-Z]{2,}\s?\d{2,}[A-Z]?)\s*:\s*(.+?)(?:\s+\((\d+)\))?$/i);
    if (!/^\d{4,}$/.test(sectionId) || !match) continue;

    const scheduleLine = body[index + 2] || "";
    const unitsLine = body[index + 3] || "";
    const schedule = scheduleLine.match(/^([A-Za-z]+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})(?:\s+(.+))?$/);
    const days = schedule ? decodeDays(schedule[1]) : [];
    const units = /^\d+(?:\.\d+)?$/.test(unitsLine) ? Number(unitsLine) : 0;
    if (!schedule || !days.length || !units) {
      warnings.push(`${match[1].replace(/\s/g, "")} needs its days, time, or units checked.`);
      continue;
    }

    subjects.push({
      id: uid("sub"),
      sectionId,
      internalId: match[3],
      code: match[1].replace(/\s/g, "").toUpperCase(),
      title: match[2].replace(/\s+/g, " ").trim(),
      units,
      color: COLORS[subjects.length % COLORS.length],
      meeting: { days, start: schedule[2], end: schedule[3], room: (schedule[4] || "TBA").trim() },
    });
    index += 3;
  }

  if (!subjects.length) {
    return { issue: { kind: "empty-table", title: "We found the table, but no complete subjects", detail: "Make sure each subject includes its code, class days, start and end time, room, and units." } };
  }

  const parsedUnits = subjects.reduce((sum, subject) => sum + subject.units, 0);
  if (declaredUnits && parsedUnits !== declaredUnits) {
    warnings.push(`The subjects add up to ${parsedUnits} units, but the page says ${declaredUnits}. Review the list before saving.`);
  }
  if (!semester) warnings.push("The semester label was not found. You can add it before saving.");

  return { result: { semester, block, totalUnits: declaredUnits || parsedUnits, program, yearLevel, subjects, warnings } };
}

function formatTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric" }).format(date);
}

function getSelectedDay(date: Date): DayCode {
  return DAY_META.find((day) => day.js === date.getDay())?.code || "MO";
}

function nextClassDate(subject: Subject, after = new Date()) {
  const [hour, minute] = subject.meeting.start.split(":").map(Number);
  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = new Date(after);
    candidate.setDate(after.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);
    if (subject.meeting.days.includes(getSelectedDay(candidate)) && candidate > after) return candidate;
  }
  return null;
}

function escapeICS(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function triggerDownload(content: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Home() {
  const [data, setData] = useState<SkedData | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [stage, setStage] = useState<"paste" | "review">("paste");
  const [paste, setPaste] = useState("");
  const [issue, setIssue] = useState<ParseIssue | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [profile, setProfile] = useState<Profile>({ nickname: "", program: "", yearLevel: "" });
  const [termStart, setTermStart] = useState("");
  const [termEnd, setTermEnd] = useState("");
  const [view, setView] = useState<View>("today");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [taskTitle, setTaskTitle] = useState("");
  const [taskSubject, setTaskSubject] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) setData(JSON.parse(saved));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
      setHydrated(true);
    });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    else localStorage.removeItem(STORAGE_KEY);
  }, [data, hydrated]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const dayCode = getSelectedDay(selectedDate);
  const daySubjects = useMemo(() => {
    if (!data) return [];
    return data.subjects
      .filter((subject) => subject.meeting.days.includes(dayCode))
      .sort((a, b) => a.meeting.start.localeCompare(b.meeting.start));
  }, [data, dayCode]);

  const todayTasks = useMemo(() => {
    if (!data) return [];
    const key = dateKey(selectedDate);
    return data.tasks.filter((task) => task.dueAt.slice(0, 10) === key);
  }, [data, selectedDate]);

  function runParser() {
    const response = parseAdamson(paste);
    if (response.issue) {
      setIssue(response.issue);
      setParsed(null);
      return;
    }
    if (response.result) {
      setIssue(null);
      setParsed(response.result);
      setProfile({ nickname: "", program: response.result.program, yearLevel: response.result.yearLevel });
      const year = Number(response.result.semester.match(/(20\d{2})/)?.[1]);
      if (year) {
        setTermStart(`${year}-08-01`);
        setTermEnd(`${year}-12-31`);
      }
      setStage("review");
    }
  }

  function saveSchedule() {
    if (!parsed) return;
    if (!termStart || !termEnd || termEnd < termStart) {
      setNotice("Confirm a valid start and end date for the semester.");
      return;
    }
    const next: SkedData = {
      semester: parsed.semester || "Current Semester",
      block: parsed.block,
      totalUnits: parsed.totalUnits,
      termStart,
      termEnd,
      profile,
      subjects: parsed.subjects,
      tasks: [],
      createdAt: new Date().toISOString(),
    };
    setData(next);
    setPaste("");
    setParsed(null);
    setStage("paste");
    setView("today");
    setNotice("Your sked is saved on this device.");
  }

  function removeParsedSubject(id: string) {
    if (!parsed) return;
    const subjects = parsed.subjects.filter((subject) => subject.id !== id);
    setParsed({ ...parsed, subjects, totalUnits: subjects.reduce((sum, subject) => sum + subject.units, 0) });
  }

  function updateParsedSubject(id: string, field: "code" | "title" | "room" | "start" | "end", value: string) {
    if (!parsed) return;
    setParsed({
      ...parsed,
      subjects: parsed.subjects.map((subject) => {
        if (subject.id !== id) return subject;
        if (field === "room" || field === "start" || field === "end") {
          return { ...subject, meeting: { ...subject.meeting, [field]: value } };
        }
        return { ...subject, [field]: value };
      }),
    });
  }

  function createTask() {
    if (!data || !taskTitle.trim() || !taskSubject || !taskDue) {
      setNotice("Add a task, subject, and due date first.");
      return;
    }
    const task: Task = { id: uid("task"), subjectId: taskSubject, title: taskTitle.trim(), dueAt: taskDue, done: false };
    setData({ ...data, tasks: [...data.tasks, task] });
    setTaskTitle("");
    setTaskDue("");
    setNotice("Task added.");
  }

  function setDueNextClass() {
    const subject = data?.subjects.find((item) => item.id === taskSubject);
    if (!subject) {
      setNotice("Choose a subject first.");
      return;
    }
    const next = nextClassDate(subject);
    if (!next) return;
    const local = new Date(next.getTime() - next.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setTaskDue(local);
  }

  function toggleTask(id: string) {
    if (!data) return;
    setData({ ...data, tasks: data.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task) });
  }

  function exportBackup() {
    if (!data) return;
    triggerDownload(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data }, null, 2), "application/json", `AnoSked-Backup-${dateKey(new Date())}.json`);
    setNotice("Backup downloaded.");
  }

  function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsedFile = JSON.parse(String(reader.result));
        const restored = parsedFile.data || parsedFile;
        if (!Array.isArray(restored.subjects)) throw new Error("Invalid backup");
        setData(restored);
        setNotice("Backup restored on this device.");
      } catch {
        setNotice("This file isn’t a valid AnoSked backup.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function exportICS() {
    if (!data) return;
    const dayCodeMap: Record<DayCode, string> = { MO: "MO", TU: "TU", WE: "WE", TH: "TH", FR: "FR", SA: "SA", SU: "SU" };
    const until = data.termEnd.replace(/-/g, "") + "T155959Z";
    const events = data.subjects.map((subject) => {
      const startBase = new Date(`${data.termStart}T00:00:00`);
      let first: Date | null = null;
      for (let offset = 0; offset < 7; offset += 1) {
        const candidate = new Date(startBase);
        candidate.setDate(startBase.getDate() + offset);
        if (subject.meeting.days.includes(getSelectedDay(candidate))) { first = candidate; break; }
      }
      if (!first) return "";
      const compact = dateKey(first).replace(/-/g, "");
      const start = subject.meeting.start.replace(":", "") + "00";
      const end = subject.meeting.end.replace(":", "") + "00";
      return [
        "BEGIN:VEVENT",
        `UID:${subject.id}@anosked.local`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
        `DTSTART;TZID=Asia/Manila:${compact}T${start}`,
        `DTEND;TZID=Asia/Manila:${compact}T${end}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${subject.meeting.days.map((day) => dayCodeMap[day]).join(",")};UNTIL=${until}`,
        `SUMMARY:${escapeICS(`${subject.code} · ${subject.title}`)}`,
        `LOCATION:${escapeICS(subject.meeting.room)}`,
        "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15M", `DESCRIPTION:${escapeICS(`${subject.code} starts in 15 minutes`)}`, "END:VALARM",
        "END:VEVENT",
      ].join("\r\n");
    }).join("\r\n");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AnoSked//Local Student Calendar//EN", "CALSCALE:GREGORIAN", events, "END:VCALENDAR"].join("\r\n");
    triggerDownload(ics, "text/calendar;charset=utf-8", `AnoSked-${data.semester.replace(/\s+/g, "-")}.ics`);
    setNotice("Calendar export ready.");
  }

  function drawSchedule(mode: "share" | "wallpaper") {
    if (!data) return;
    const canvas = document.createElement("canvas");
    canvas.width = mode === "wallpaper" ? 1290 : 1400;
    canvas.height = mode === "wallpaper" ? 2796 : 1800;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const top = mode === "wallpaper" ? 650 : 170;
    const margin = mode === "wallpaper" ? 100 : 90;
    const available = width - margin * 2;
    const days = DAY_META.slice(0, 6);

    ctx.fillStyle = "#F4F2FF";
    ctx.fillRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "rgba(98,90,246,.18)");
    gradient.addColorStop(1, "rgba(240,111,94,.10)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#181725";
    ctx.font = `700 ${mode === "wallpaper" ? 66 : 72}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText(data.profile.nickname ? `${data.profile.nickname}’s sked` : "My weekly sked", margin, top - 95);
    ctx.fillStyle = "#686677";
    ctx.font = `500 ${mode === "wallpaper" ? 30 : 34}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText(`${data.semester}${data.block ? `  ·  ${data.block}` : ""}`, margin, top - 38);

    const dayHeight = mode === "wallpaper" ? 285 : 230;
    days.forEach((day, dayIndex) => {
      const y = top + dayIndex * dayHeight;
      ctx.fillStyle = "rgba(255,255,255,.82)";
      ctx.beginPath();
      ctx.roundRect(margin, y, available, dayHeight - 22, 34);
      ctx.fill();
      ctx.fillStyle = "#8A8799";
      ctx.font = "700 25px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(day.label.toUpperCase(), margin + 34, y + 48);
      const entries = data.subjects.filter((subject) => subject.meeting.days.includes(day.code)).sort((a, b) => a.meeting.start.localeCompare(b.meeting.start));
      if (!entries.length) {
        ctx.fillStyle = "#9C99A8";
        ctx.font = "500 30px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText("No classes", margin + 34, y + 112);
      }
      entries.forEach((subject, itemIndex) => {
        const itemY = y + 86 + itemIndex * 76;
        ctx.fillStyle = subject.color;
        ctx.beginPath();
        ctx.roundRect(margin + 34, itemY, 12, 52, 6);
        ctx.fill();
        ctx.fillStyle = "#1D1B29";
        ctx.font = "700 31px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(subject.code, margin + 66, itemY + 30);
        ctx.fillStyle = "#666374";
        ctx.font = "500 27px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(`${formatTime(subject.meeting.start)}–${formatTime(subject.meeting.end)}  ·  ${subject.meeting.room}`, margin + 255, itemY + 30);
      });
    });
    ctx.fillStyle = "#625AF6";
    ctx.font = "700 28px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("AnoSked", margin, height - 62);
    ctx.fillStyle = "#777487";
    ctx.font = "500 24px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("Your schedule stays yours.", margin + 145, height - 62);
    canvas.toBlob((blob) => {
      if (!blob) return;
      triggerDownload(blob, "image/png", `AnoSked-${mode}-${dateKey(new Date())}.png`);
      setNotice(mode === "wallpaper" ? "Wallpaper saved." : "Schedule image saved.");
    }, "image/png");
  }

  if (!hydrated) return <main className="loading-screen"><div className="brand-mark">A</div><p>Preparing AnoSked…</p></main>;

  if (!data) {
    return (
      <main className="onboarding-shell">
        <header className="public-header">
          <a className="wordmark" href="#top" aria-label="AnoSked home"><span className="brand-mark small">A</span>AnoSked</a>
          <span className="privacy-pill"><span className="status-dot" /> Local by default</span>
        </header>

        <section className="onboarding-grid" id="top">
          <div className="intro-copy">
            <div className="eyebrow">Adamson subject enlistment, organized</div>
            <h1>Paste it once.<br />Know what’s next.</h1>
            <p>AnoSked turns your enrolled subjects into a calm, readable calendar—without an account or uploading your academic data.</p>
            <div className="promise-row">
              <span>No sign-up</span><span>No student number</span><span>No fees</span>
            </div>
            <div className="mini-schedule" aria-label="Sample AnoSked calendar">
              <div className="mini-date"><strong>Wednesday</strong><span>2 classes</span></div>
              <div className="mini-event active"><i style={{ background: "#625AF6" }} /><div><strong>CS420</strong><span>6:00–9:00 PM · SV217</span></div><b>Now</b></div>
              <div className="mini-event"><i style={{ background: "#1F9D78" }} /><div><strong>CS467</strong><span>7:30–9:00 PM · SV213</span></div></div>
            </div>
          </div>

          <div className="paste-card">
            {stage === "paste" ? (
              <>
                <div className="card-heading">
                  <span className="step-badge">1</span>
                  <div><h2>Paste enrolled subjects</h2><p>You may paste the whole page. Only the subject table is kept.</p></div>
                </div>
                <textarea value={paste} onChange={(event) => { setPaste(event.target.value); setIssue(null); }} placeholder={`Paste from “Block No.” through “Total Units”`} aria-label="Subject enlistment text" />
                {issue && (
                  <div className="error-panel" role="alert">
                    <div className="error-icon">!</div>
                    <div><strong>{issue.title}</strong><p>{issue.detail}</p><button className="text-button" onClick={() => setPaste(SAMPLE)}>Use a safe example</button></div>
                  </div>
                )}
                <div className="paste-actions">
                  <button className="secondary-button" onClick={() => { setPaste(SAMPLE); setIssue(null); }}>Try sample</button>
                  <button className="primary-button" onClick={runParser}>Build my sked <span>→</span></button>
                </div>
                <details className="copy-guide">
                  <summary>Where should I copy from?</summary>
                  <div className="copy-example"><b>Block No. : CS 402</b><br />Section · Subject · Units<br />…your subject records…<br /><b>Total Units : 12</b></div>
                  <p>Copy from <strong>Block No.</strong> through <strong>Total Units</strong>. The entire page also works.</p>
                </details>
                <div className="local-note"><span className="shield">✓</span><div><strong>Processed only on this device</strong><p>Your student number, name, fees, balances, and payment details are ignored. The pasted text is discarded after confirmation.</p></div></div>
              </>
            ) : parsed ? (
              <>
                <div className="card-heading">
                  <button className="back-button" onClick={() => setStage("paste")} aria-label="Go back">←</button>
                  <div><h2>Review your sked</h2><p>{parsed.subjects.length} subjects · {parsed.totalUnits} units found</p></div>
                </div>
                <div className="success-strip"><span>✓</span><div><strong>Personal and financial information ignored</strong><p>Only the subject details below will be saved.</p></div></div>
                {parsed.warnings.map((warning) => <div className="warning-strip" key={warning}>! {warning}</div>)}
                <div className="review-list">
                  {parsed.subjects.map((subject) => (
                    <div className="review-subject" key={subject.id}>
                      <div className="subject-color" style={{ background: subject.color }} />
                      <div className="review-fields">
                        <div className="inline-fields"><input value={subject.code} onChange={(e) => updateParsedSubject(subject.id, "code", e.target.value)} aria-label="Subject code" /><input value={subject.title} onChange={(e) => updateParsedSubject(subject.id, "title", e.target.value)} aria-label="Subject title" /></div>
                        <div className="schedule-edit"><span>{subject.meeting.days.map((day) => DAY_META.find((item) => item.code === day)?.short).join(" · ")}</span><input type="time" value={subject.meeting.start} onChange={(e) => updateParsedSubject(subject.id, "start", e.target.value)} aria-label="Start time" /><span>to</span><input type="time" value={subject.meeting.end} onChange={(e) => updateParsedSubject(subject.id, "end", e.target.value)} aria-label="End time" /><input value={subject.meeting.room} onChange={(e) => updateParsedSubject(subject.id, "room", e.target.value)} aria-label="Room" /></div>
                      </div>
                      <button className="remove-button" onClick={() => removeParsedSubject(subject.id)} aria-label={`Remove ${subject.code}`}>×</button>
                    </div>
                  ))}
                </div>
                <div className="review-section">
                  <h3>Confirm the semester dates</h3><p>These dates aren’t included in the enlistment page.</p>
                  <div className="date-fields"><label>Classes start<input type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} /></label><label>Classes end<input type="date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} /></label></div>
                </div>
                <div className="review-section optional-profile">
                  <h3>Personalize exports <span>Optional</span></h3>
                  <div className="profile-fields"><label>Name or nickname<input value={profile.nickname} onChange={(e) => setProfile({ ...profile, nickname: e.target.value })} placeholder="Leave blank for My Weekly Sked" /></label><label>Program<input value={profile.program} onChange={(e) => setProfile({ ...profile, program: e.target.value })} /></label><label>Year level<input value={profile.yearLevel} onChange={(e) => setProfile({ ...profile, yearLevel: e.target.value })} /></label></div>
                  <p className="fine-print">Student numbers are never saved. These optional labels stay on this device.</p>
                </div>
                <button className="primary-button wide" disabled={!parsed.subjects.length} onClick={saveSchedule}>Save on this device <span>→</span></button>
              </>
            ) : null}
          </div>
        </section>
        <footer className="public-footer"><strong>AnoSked</strong><span>Your schedule stays yours.</span></footer>
        {notice && <div className="toast">{notice}</div>}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="wordmark app-wordmark"><span className="brand-mark small">A</span>AnoSked</div>
        <nav>
          {([
            ["today", "Today", "●"], ["calendar", "Calendar", "▦"], ["tasks", "Tasks", "✓"], ["subjects", "Subjects", "▤"], ["settings", "Settings", "○"],
          ] as Array<[View, string, string]>).map(([key, label, icon]) => (
            <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><span>{icon}</span>{label}{key === "tasks" && data.tasks.filter((task) => !task.done).length > 0 ? <b>{data.tasks.filter((task) => !task.done).length}</b> : null}</button>
          ))}
        </nav>
        <div className="sidebar-local"><span className="status-dot" /><div><strong>Stored locally</strong><p>Only on this device</p></div></div>
      </aside>

      <section className="app-main">
        <header className="app-header">
          <div><span className="mobile-wordmark">AnoSked</span><p>{data.semester}{data.block ? ` · ${data.block}` : ""}</p></div>
          <button className="avatar-button" onClick={() => setView("settings")}>{data.profile.nickname?.[0]?.toUpperCase() || "A"}</button>
        </header>

        {view === "today" && (
          <div className="page today-page">
            <div className="page-title-row">
              <div><div className="eyebrow">Your day at a glance</div><h1>{formatDate(selectedDate)}</h1><p>{daySubjects.length ? `${daySubjects.length} ${daySubjects.length === 1 ? "class" : "classes"} today` : "No classes today"}</p></div>
              <button className="date-button" onClick={() => setSelectedDate(new Date())}>Today</button>
            </div>
            <DayStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
            <div className="today-layout">
              <div className="timeline-card">
                <div className="section-heading"><h2>Timeline</h2><span>{DAY_META.find((day) => day.code === dayCode)?.label}</span></div>
                {!daySubjects.length ? <EmptyState title="A clear day" detail="No enrolled subjects meet today. Swipe to another day to check your week." /> : daySubjects.map((subject) => {
                  const now = new Date();
                  const isToday = dateKey(now) === dateKey(selectedDate);
                  const currentMinutes = now.getHours() * 60 + now.getMinutes();
                  const [sh, sm] = subject.meeting.start.split(":").map(Number);
                  const [eh, em] = subject.meeting.end.split(":").map(Number);
                  const active = isToday && currentMinutes >= sh * 60 + sm && currentMinutes < eh * 60 + em;
                  const linked = todayTasks.filter((task) => task.subjectId === subject.id);
                  return <div className={`timeline-event ${active ? "is-active" : ""}`} key={subject.id}>
                    <div className="timeline-time"><strong>{formatTime(subject.meeting.start)}</strong><span>{formatTime(subject.meeting.end)}</span></div>
                    <div className="event-line"><i style={{ background: subject.color }} /></div>
                    <div className="event-content"><div className="event-top"><div><span className="subject-code" style={{ color: subject.color }}>{subject.code}</span><h3>{subject.title}</h3></div>{active ? <span className="now-pill">Now</span> : null}</div><p className="event-meta"><b>{subject.meeting.room}</b><span>·</span>{subject.units} units</p>
                      {linked.map((task) => <button className={`inline-task ${task.done ? "done" : ""}`} key={task.id} onClick={() => toggleTask(task.id)}><span>{task.done ? "✓" : ""}</span>{task.title}</button>)}
                    </div>
                  </div>;
                })}
              </div>
              <aside className="today-side">
                <div className="side-card"><div className="section-heading"><h2>Due today</h2><button onClick={() => setView("tasks")}>View all</button></div>{todayTasks.length ? todayTasks.map((task) => { const subject = data.subjects.find((item) => item.id === task.subjectId); return <button className={`side-task ${task.done ? "done" : ""}`} key={task.id} onClick={() => toggleTask(task.id)}><span>{task.done ? "✓" : ""}</span><div><strong>{task.title}</strong><p>{subject?.code} · {new Date(task.dueAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</p></div></button>; }) : <p className="muted-copy">Nothing due. Your evening is yours.</p>}</div>
                <div className="privacy-card"><div className="shield large">✓</div><h3>Your sked stays here</h3><p>Subjects and tasks are stored only on this device. Export a backup before deleting the app.</p><button onClick={exportBackup}>Export backup</button></div>
              </aside>
            </div>
          </div>
        )}

        {view === "calendar" && (
          <div className="page">
            <div className="page-title-row"><div><div className="eyebrow">Your own calendar</div><h1>Weekly sked</h1><p>Easy to read, simple to share.</p></div><div className="export-menu"><button className="secondary-button" onClick={() => drawSchedule("share")}>Export image</button><button className="primary-button" onClick={() => drawSchedule("wallpaper")}>iPhone wallpaper</button></div></div>
            <DayStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
            <div className="week-card">
              <div className="week-header"><div><span>{DAY_META.find((day) => day.code === dayCode)?.label}</span><strong>{selectedDate.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</strong></div><button onClick={exportICS}>Export .ics calendar</button></div>
              <div className="week-list">{daySubjects.length ? daySubjects.map((subject) => <div className="week-event" key={subject.id}><div className="week-time"><strong>{formatTime(subject.meeting.start)}</strong><span>{formatTime(subject.meeting.end)}</span></div><div className="week-block" style={{ borderLeftColor: subject.color, background: `${subject.color}10` }}><div><span style={{ color: subject.color }}>{subject.code}</span><h3>{subject.title}</h3></div><p>{subject.meeting.room}</p></div></div>) : <EmptyState title="No classes" detail="This day has no enrolled subjects." />}</div>
            </div>
            <div className="export-explainer"><div><span>Image</span><h3>Shareable weekly card</h3><p>A clean PNG for class chats and Stories.</p><button onClick={() => drawSchedule("share")}>Download image</button></div><div><span>Wallpaper</span><h3>Lock Screen-ready</h3><p>Leaves space for the iPhone clock and controls.</p><button onClick={() => drawSchedule("wallpaper")}>Download wallpaper</button></div><div><span>Calendar</span><h3>Apple or Google</h3><p>Recurring classes with 15-minute reminders.</p><button onClick={exportICS}>Download .ics</button></div></div>
          </div>
        )}

        {view === "tasks" && (
          <div className="page tasks-page">
            <div className="page-title-row"><div><div className="eyebrow">Subject-linked work</div><h1>Tasks</h1><p>Set a deadline in a few taps.</p></div></div>
            <div className="tasks-layout">
              <div className="task-composer"><h2>Add a task</h2><label>What needs to be done?<input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Finish research chapter 1" /></label><label>Subject<select value={taskSubject} onChange={(e) => setTaskSubject(e.target.value)}><option value="">Choose a subject</option>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} · {subject.title}</option>)}</select></label><label>Due date<input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} /></label><div className="quick-dates"><button onClick={setDueNextClass}>Due next class</button><button onClick={() => { const date = new Date(); date.setDate(date.getDate() + 7); setTaskDue(new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); }}>7 days from now</button></div><button className="primary-button wide" onClick={createTask}>Add task</button></div>
              <div className="task-list-card"><div className="section-heading"><h2>All tasks</h2><span>{data.tasks.filter((task) => !task.done).length} open</span></div>{data.tasks.length ? [...data.tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map((task) => { const subject = data.subjects.find((item) => item.id === task.subjectId); return <button className={`task-row ${task.done ? "done" : ""}`} key={task.id} onClick={() => toggleTask(task.id)}><span className="task-check">{task.done ? "✓" : ""}</span><div><strong>{task.title}</strong><p><b style={{ color: subject?.color }}>{subject?.code}</b> · {new Date(task.dueAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div></button>; }) : <EmptyState title="No tasks yet" detail="Add your first task and connect it to a subject." />}</div>
            </div>
          </div>
        )}

        {view === "subjects" && (
          <div className="page">
            <div className="page-title-row"><div><div className="eyebrow">{data.totalUnits} total units</div><h1>Enrolled subjects</h1><p>{data.subjects.length} subject workspaces, created automatically.</p></div></div>
            <div className="subject-grid">{data.subjects.map((subject) => <article className="subject-card" key={subject.id}><div className="subject-card-top"><span className="subject-bubble" style={{ background: `${subject.color}18`, color: subject.color }}>{subject.code.slice(0, 2)}</span><span className="unit-pill">{subject.units} units</span></div><span className="subject-code" style={{ color: subject.color }}>{subject.code}</span><h2>{subject.title}</h2><div className="subject-detail"><span>{subject.meeting.days.map((day) => DAY_META.find((item) => item.code === day)?.short).join(" · ")}</span><strong>{formatTime(subject.meeting.start)}–{formatTime(subject.meeting.end)}</strong></div><div className="subject-room"><span>Room</span><strong>{subject.meeting.room}</strong></div><div className="subject-task-count">{data.tasks.filter((task) => task.subjectId === subject.id && !task.done).length} open tasks</div></article>)}</div>
          </div>
        )}

        {view === "settings" && (
          <div className="page settings-page">
            <div className="page-title-row"><div><div className="eyebrow">Your device, your data</div><h1>Settings</h1><p>Manage privacy, backups, and your schedule.</p></div></div>
            <div className="settings-grid">
              <section className="settings-card privacy-settings"><div className="shield jumbo">✓</div><div><span className="setting-label">Privacy & storage</span><h2>Stored locally on this device</h2><p>AnoSked does not upload or collect your enrollment text, subjects, schedule, tasks, or optional profile details. There is no account or cloud backup.</p><ul><li>Student numbers are never saved</li><li>Fees and payment details are ignored</li><li>Original pasted text is discarded</li></ul><div className="loss-warning"><strong>Deleting AnoSked or clearing browser data may permanently erase everything.</strong><p>Export a backup before removing the app or changing devices.</p></div></div></section>
              <section className="settings-card"><span className="setting-label">Backup & restore</span><h2>Keep a copy you control</h2><p>Backups contain structured subjects and tasks—not the original enrollment page.</p><div className="settings-actions"><button className="primary-button" onClick={exportBackup}>Export backup</button><button className="secondary-button" onClick={() => fileInput.current?.click()}>Restore backup</button><input ref={fileInput} type="file" accept="application/json,.json" onChange={restoreBackup} hidden /></div></section>
              <section className="settings-card"><span className="setting-label">Optional profile</span><h2>Personalize exports</h2><div className="settings-form"><label>Name or nickname<input value={data.profile.nickname} onChange={(e) => setData({ ...data, profile: { ...data.profile, nickname: e.target.value } })} placeholder="Optional" /></label><label>Program<input value={data.profile.program} onChange={(e) => setData({ ...data, profile: { ...data.profile, program: e.target.value } })} placeholder="Optional" /></label><label>Year level<input value={data.profile.yearLevel} onChange={(e) => setData({ ...data, profile: { ...data.profile, yearLevel: e.target.value } })} placeholder="Optional" /></label></div></section>
              <section className="settings-card"><span className="setting-label">Schedule</span><h2>Update or start over</h2><p>Your current sked has {data.subjects.length} subjects for {data.semester}.</p><div className="settings-actions"><button className="secondary-button" onClick={() => { exportBackup(); setNotice("Backup first—then you can safely replace your sked."); }}>Backup before update</button><button className="danger-button" onClick={() => { if (window.confirm("Delete all subjects and tasks stored on this device? This cannot be undone without a backup.")) { setData(null); setStage("paste"); } }}>Delete local data</button></div></section>
            </div>
          </div>
        )}
      </section>

      <nav className="mobile-nav">
        {([ ["today", "Today", "●"], ["calendar", "Calendar", "▦"], ["tasks", "Tasks", "✓"], ["subjects", "Subjects", "▤"], ["settings", "Settings", "○"] ] as Array<[View, string, string]>).map(([key, label, icon]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><span>{icon}</span>{label}</button>)}
      </nav>
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

function DayStrip({ selectedDate, onSelect }: { selectedDate: Date; onSelect: (date: Date) => void }) {
  const start = new Date(selectedDate);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  return <div className="day-strip" aria-label="Choose a day">{days.map((date) => { const selected = dateKey(date) === dateKey(selectedDate); const today = dateKey(date) === dateKey(new Date()); return <button key={dateKey(date)} className={`${selected ? "selected" : ""} ${today ? "is-today" : ""}`} onClick={() => onSelect(date)}><span>{date.toLocaleDateString("en-PH", { weekday: "short" }).slice(0, 2)}</span><strong>{date.getDate()}</strong><i /></button>; })}</div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><div>○</div><h3>{title}</h3><p>{detail}</p></div>;
}
