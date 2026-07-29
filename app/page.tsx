"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

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
const COLORS = ["#2F8FC4", "#5279C8", "#2D9A93", "#7B73C9", "#3486A8", "#6B8EBD"];
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

function parseEnrollment(text: string): { result?: ParseResult; issue?: ParseIssue } {
  const cleaned = text.replace(/\r/g, "").replace(/\u00a0/g, " ").trim();
  if (!cleaned) {
    return { issue: { kind: "empty", title: "Nothing was pasted", detail: "Copy the Enrolled Subjects section from your Subject Enlistment page, then paste it here." } };
  }

  const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
  const lower = cleaned.toLowerCase();
  const blockIndex = lines.findIndex((line) => /^Block\s*No\.?\s*:/i.test(line));
  const totalIndex = lines.findIndex((line, index) => index > Math.max(blockIndex, -1) && /^Total\s+Units\s*:/i.test(line));

  const firstSubjectIndex = lines.findIndex((line) => /^[A-Z]{2,}\s?\d{2,}[A-Z]?\s*:\s*.+/i.test(line));
  if (firstSubjectIndex < 0) {
    if (/assessment of fees|tuition fee|total due|schedule of payment/i.test(lower)) {
      return { issue: { kind: "fees-only", title: "This is the fees section", detail: "Copy the enrolled-subjects table instead. It should contain subject codes followed by class days, time, and room." } };
    }
    return { issue: { kind: "missing-table", title: "No class schedule was found", detail: "Paste the part that lists each subject code, class days, start and end time, room, and units." } };
  }

  const semester = lines.find((line) => /^\d+(?:st|nd|rd|th)\s+Semester\s+\d{4}-\d{4}$/i.test(line)) || "";
  const program = lines.find((line) => /^(?:B\.?S\.?|B\.?A\.?|Bachelor|Master)/i.test(line)) || "";
  const yearLevelLine = lines.find((line) => /(?:First|Second|Third|Fourth|Fifth)\s+Year/i.test(line)) || "";
  const yearLevel = yearLevelLine.match(/(?:First|Second|Third|Fourth|Fifth)\s+Year/i)?.[0] || "";
  const block = blockIndex >= 0 ? lines[blockIndex].split(":").slice(1).join(":").trim() : "";
  const declaredUnits = totalIndex >= 0 ? Number(lines[totalIndex].match(/([\d.]+)\s*$/)?.[1] || 0) : 0;
  const bodyStart = blockIndex >= 0 ? blockIndex + 1 : Math.max(0, firstSubjectIndex - 1);
  const bodyEnd = totalIndex >= 0 ? totalIndex : lines.length;
  const body = lines.slice(bodyStart, bodyEnd).filter((line) => !/^(Section|Subject|Units)$/i.test(line));
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
  const [calendarMode, setCalendarMode] = useState<"day" | "week">("week");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [taskTitle, setTaskTitle] = useState("");
  const [taskSubject, setTaskSubject] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
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
    const response = parseEnrollment(paste);
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
    canvas.width = mode === "wallpaper" ? 1290 : 1800;
    canvas.height = mode === "wallpaper" ? 2796 : 1500;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const margin = mode === "wallpaper" ? 58 : 72;
    const top = mode === "wallpaper" ? 680 : 210;
    const bottom = mode === "wallpaper" ? 180 : 90;
    const timeWidth = mode === "wallpaper" ? 78 : 105;
    const days = DAY_META;
    const gridLeft = margin + timeWidth;
    const gridWidth = width - gridLeft - margin;
    const headerHeight = mode === "wallpaper" ? 70 : 76;
    const gridTop = top + headerHeight;
    const gridHeight = height - gridTop - bottom;
    const hourHeight = gridHeight / 15;
    const dayWidth = gridWidth / days.length;

    ctx.fillStyle = "#EAF6FC";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#153A52";
    ctx.font = `700 ${mode === "wallpaper" ? 52 : 62}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText(data.profile.nickname ? `${data.profile.nickname}’s week` : "My week", margin, top - 112);
    ctx.fillStyle = "#56788D";
    ctx.font = `500 ${mode === "wallpaper" ? 24 : 27}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText(`${data.semester}${data.block ? `  ·  ${data.block}` : ""}`, margin, top - 62);

    ctx.fillStyle = "rgba(255,255,255,.86)";
    ctx.beginPath();
    ctx.roundRect(margin, top, width - margin * 2, height - top - bottom + 16, mode === "wallpaper" ? 30 : 36);
    ctx.fill();

    days.forEach((day, dayIndex) => {
      const x = gridLeft + dayIndex * dayWidth;
      ctx.fillStyle = "#56788D";
      ctx.font = `700 ${mode === "wallpaper" ? 16 : 20}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(day.short.toUpperCase(), x + dayWidth / 2, top + headerHeight * .62);
    });

    for (let hour = 7; hour <= 22; hour += 1) {
      const y = gridTop + (hour - 7) * hourHeight;
      ctx.strokeStyle = "rgba(71,128,158,.16)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(margin + 16, y); ctx.lineTo(width - margin - 16, y); ctx.stroke();
      if (hour < 22) {
        ctx.fillStyle = "#6E8796";
        ctx.font = `500 ${mode === "wallpaper" ? 14 : 18}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "right";
        ctx.fillText(formatTime(`${String(hour).padStart(2, "0")}:00`).replace(":00", ""), gridLeft - 16, y + 6);
      }
    }

    data.subjects.forEach((subject) => subject.meeting.days.forEach((day) => {
      const dayIndex = days.findIndex((item) => item.code === day);
      if (dayIndex < 0) return;
      const [startHour, startMinute] = subject.meeting.start.split(":").map(Number);
      const [endHour, endMinute] = subject.meeting.end.split(":").map(Number);
      const startOffset = startHour + startMinute / 60 - 7;
      const duration = endHour + endMinute / 60 - (startHour + startMinute / 60);
      const x = gridLeft + dayIndex * dayWidth + 4;
      const y = gridTop + startOffset * hourHeight + 3;
      const blockWidth = dayWidth - 8;
      const blockHeight = Math.max(duration * hourHeight - 6, 34);
      ctx.globalAlpha = .16;
      ctx.fillStyle = subject.color;
      ctx.beginPath(); ctx.roundRect(x, y, blockWidth, blockHeight, 14); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#153A52";
      ctx.textAlign = "left";
      ctx.font = `700 ${mode === "wallpaper" ? 14 : 19}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillText(subject.code, x + 10, y + 23, blockWidth - 18);
      if (blockHeight > 54) {
        ctx.fillStyle = "#56788D";
        ctx.font = `600 ${mode === "wallpaper" ? 11 : 15}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillText(subject.meeting.room, x + 10, y + 43, blockWidth - 18);
      }
    }));

    ctx.textAlign = "left";
    ctx.fillStyle = "#153A52";
    ctx.font = `700 ${mode === "wallpaper" ? 20 : 24}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText("AnoSked", margin, height - (mode === "wallpaper" ? 86 : 34));
    canvas.toBlob((blob) => {
      if (!blob) return;
      triggerDownload(blob, "image/png", `AnoSked-${mode}-${dateKey(new Date())}.png`);
      setNotice(mode === "wallpaper" ? "Wallpaper saved." : "Schedule image saved.");
    }, "image/png");
  }

  if (!hydrated) return <main className="loading-screen"><Image className="brand-mark" src="/assets/AnoSkedfinallogo.png" alt="" width={62} height={62} priority /><p>Preparing AnoSked…</p></main>;

  if (!data) {
    return (
      <main className="onboarding-shell">
        <header className="public-header">
          <a className="wordmark" href="#top" aria-label="AnoSked home"><Image className="brand-mark small" src="/assets/AnoSkedfinallogo.png" alt="" width={38} height={38} priority />AnoSked</a>
          <span className="header-note">Private. Offline-ready.</span>
        </header>

        <section className="onboarding-grid" id="top">
          <div className="intro-copy">
            <div className="eyebrow">A clearer school week</div>
            <h1>Your semester,<br />at a glance.</h1>
            <p>Paste your enrolled subjects. AnoSked turns them into a timetable you can actually read.</p>
            <div className="mini-week" aria-label="Sample weekly timetable">
              <div className="mini-week-head"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span></div>
              <div className="mini-week-grid">
                <div className="mini-block one"><strong>CS420</strong><span>SV217</span></div>
                <div className="mini-block two"><strong>CS468</strong><span>SV213</span></div>
                <div className="mini-block three"><strong>CS342</strong><span>SV213</span></div>
              </div>
            </div>
          </div>

          <div className="paste-card">
            {stage === "paste" ? (
              <>
                <div className="card-heading">
                  <div><h2>Import your schedule</h2><p>Paste the page or just its enrolled-subjects table.</p></div>
                </div>
                <textarea value={paste} onChange={(event) => { setPaste(event.target.value); setIssue(null); }} placeholder="Paste your enrolled subjects here…" aria-label="Subject enlistment text" />
                {issue && (
                  <div className="error-panel" role="alert">
                    <div className="error-icon">!</div>
                    <div><strong>{issue.title}</strong><p>{issue.detail}</p><button className="text-button" onClick={() => setPaste(SAMPLE)}>Load an example</button></div>
                  </div>
                )}
                <div className="paste-actions">
                  <button className="secondary-button" onClick={() => { setPaste(SAMPLE); setIssue(null); }}>Try sample</button>
                  <button className="primary-button" onClick={runParser}>Continue</button>
                </div>
                <p className="one-line-privacy">Processed on this device. No account, upload, or student number.</p>
              </>
            ) : parsed ? (
              <>
                <div className="card-heading">
                  <button className="back-button" onClick={() => setStage("paste")} aria-label="Go back">←</button>
                  <div><h2>Review your sked</h2><p>{parsed.subjects.length} subjects · {parsed.totalUnits} units found</p></div>
                </div>
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
                <details className="optional-profile">
                  <summary>Optional profile details</summary>
                  <div className="profile-fields"><label>Name or nickname<input value={profile.nickname} onChange={(e) => setProfile({ ...profile, nickname: e.target.value })} placeholder="Optional" /></label><label>Program<input value={profile.program} onChange={(e) => setProfile({ ...profile, program: e.target.value })} placeholder="Optional" /></label><label>Year level<input value={profile.yearLevel} onChange={(e) => setProfile({ ...profile, yearLevel: e.target.value })} placeholder="Optional" /></label></div>
                </details>
                <button className="primary-button wide" disabled={!parsed.subjects.length} onClick={saveSchedule}>Save schedule</button>
              </>
            ) : null}
          </div>
        </section>
        <footer className="public-footer">Local for now. Removing the app or clearing browser data removes its data too.</footer>
        {notice && <div className="toast">{notice}</div>}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="wordmark app-wordmark"><Image className="brand-mark small" src="/assets/AnoSkedfinallogo.png" alt="" width={38} height={38} priority />AnoSked</div>
        <nav>
          {([
            ["today", "Today"], ["calendar", "Calendar"], ["tasks", "Tasks"], ["subjects", "Subjects"],
          ] as Array<[View, string]>).map(([key, label]) => (
            <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}{key === "tasks" && data.tasks.filter((task) => !task.done).length > 0 ? <b>{data.tasks.filter((task) => !task.done).length}</b> : null}</button>
          ))}
        </nav>
        <button className="sidebar-settings" onClick={() => setView("settings")}>Settings</button>
      </aside>

      <section className="app-main">
        <header className="app-header">
          <div><span className="mobile-wordmark">AnoSked</span><p>{data.semester}{data.block ? ` · ${data.block}` : ""}</p></div>
          <button className="manage-button" onClick={() => setView("settings")}>Manage</button>
        </header>

        {view === "today" && (
          <div className="page today-page">
            <div className="page-title-row">
              <div><h1>{formatDate(selectedDate)}</h1><p>{daySubjects.length ? `${daySubjects.length} ${daySubjects.length === 1 ? "class" : "classes"}` : "No classes"}</p></div>
              <button className="date-button" onClick={() => setSelectedDate(new Date())}>Today</button>
            </div>
            <DayStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
            <div className="today-layout">
              <div className="timeline-card">
                <div className="section-heading"><h2>Timeline</h2><span>{DAY_META.find((day) => day.code === dayCode)?.label}</span></div>
                {!daySubjects.length ? <EmptyState title="Walang klase today" detail="Take it easy. Swipe to another day when you want to check the rest of your week." /> : daySubjects.map((subject) => {
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
              </aside>
            </div>
          </div>
        )}

        {view === "calendar" && (
          <div className="page calendar-page">
            <div className="calendar-toolbar">
              <div><h1>Calendar</h1><p>{data.semester}</p></div>
              <div className="calendar-actions">
                <div className="view-switch" aria-label="Calendar view">
                  <button className={calendarMode === "day" ? "active" : ""} onClick={() => setCalendarMode("day")}>Day</button>
                  <button className={calendarMode === "week" ? "active" : ""} onClick={() => setCalendarMode("week")}>Week</button>
                </div>
                <button className="quiet-button" onClick={exportICS}>Add to calendar</button>
                <button className="sky-button" onClick={() => drawSchedule("share")}>Save image</button>
              </div>
            </div>

            {calendarMode === "day" ? (
              <>
                <DayStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
                <div className="day-calendar">
                  <div className="day-calendar-heading"><strong>{DAY_META.find((day) => day.code === dayCode)?.label}</strong><span>{selectedDate.toLocaleDateString("en-PH", { month: "long", day: "numeric" })}</span></div>
                  {daySubjects.length ? daySubjects.map((subject) => (
                    <div className="day-class" key={subject.id}>
                      <div className="day-class-time"><strong>{formatTime(subject.meeting.start)}</strong><span>{formatTime(subject.meeting.end)}</span></div>
                      <div className="day-class-card" style={{ background: `${subject.color}18` }}>
                        <div><strong>{subject.code}</strong><span>{subject.title}</span></div><b>{subject.meeting.room}</b>
                      </div>
                    </div>
                  )) : <EmptyState title="No classes" detail="Nothing scheduled for this day." />}
                </div>
              </>
            ) : <WeeklyTimetable subjects={data.subjects} />}

            <div className="calendar-export-bar">
              <span>Use this weekly layout anywhere.</span>
              <div><button onClick={() => drawSchedule("wallpaper")}>iPhone wallpaper</button><button onClick={() => drawSchedule("share")}>PNG image</button></div>
            </div>
          </div>
        )}

        {view === "tasks" && (
          <div className="page tasks-page">
            <div className="page-title-row"><div><h1>Tasks</h1><p>{data.tasks.filter((task) => !task.done).length} open</p></div></div>
            <div className="tasks-layout">
              <div className="task-composer"><h2>Add a task</h2><label>What needs to be done?<input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Finish research chapter 1" /></label><label>Subject<select value={taskSubject} onChange={(e) => setTaskSubject(e.target.value)}><option value="">Choose a subject</option>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} · {subject.title}</option>)}</select></label><label>Due date<input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} /></label><div className="quick-dates"><button onClick={setDueNextClass}>Due next class</button><button onClick={() => { const date = new Date(); date.setDate(date.getDate() + 7); setTaskDue(new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); }}>7 days from now</button></div><button className="primary-button wide" onClick={createTask}>Add task</button></div>
              <div className="task-list-card"><div className="section-heading"><h2>All tasks</h2><span>{data.tasks.filter((task) => !task.done).length} open</span></div>{data.tasks.length ? [...data.tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map((task) => { const subject = data.subjects.find((item) => item.id === task.subjectId); return <button className={`task-row ${task.done ? "done" : ""}`} key={task.id} onClick={() => toggleTask(task.id)}><span className="task-check">{task.done ? "✓" : ""}</span><div><strong>{task.title}</strong><p><b style={{ color: subject?.color }}>{subject?.code}</b> · {new Date(task.dueAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div></button>; }) : <EmptyState title="No tasks yet" detail="Add your first task and connect it to a subject." />}</div>
            </div>
          </div>
        )}

        {view === "subjects" && (
          <div className="page">
            <div className="page-title-row"><div><h1>Subjects</h1><p>{data.subjects.length} subjects · {data.totalUnits} units</p></div></div>
            <div className="subject-grid">{data.subjects.map((subject) => <article className="subject-card" key={subject.id}><div className="subject-card-top"><span className="subject-bubble" style={{ background: `${subject.color}18`, color: subject.color }}>{subject.code.slice(0, 2)}</span><span className="unit-pill">{subject.units} units</span></div><span className="subject-code" style={{ color: subject.color }}>{subject.code}</span><h2>{subject.title}</h2><div className="subject-detail"><span>{subject.meeting.days.map((day) => DAY_META.find((item) => item.code === day)?.short).join(" · ")}</span><strong>{formatTime(subject.meeting.start)}–{formatTime(subject.meeting.end)}</strong></div><div className="subject-room"><span>Room</span><strong>{subject.meeting.room}</strong></div><div className="subject-task-count">{data.tasks.filter((task) => task.subjectId === subject.id && !task.done).length} open tasks</div></article>)}</div>
          </div>
        )}

        {view === "settings" && (
          <div className="page settings-page">
            <div className="page-title-row"><div><h1>Settings</h1></div></div>
            <div className="settings-panel">
              <div className="local-disclosure"><strong>Local storage</strong><span>AnoSked collects nothing. Delete the app or clear browser data and this schedule is gone.</span></div>
              <details open>
                <summary><span><strong>Backup</strong><small>Move or protect your schedule</small></span><b>›</b></summary>
                <div className="setting-content"><button className="sky-button" onClick={exportBackup}>Export backup</button><button className="quiet-button" onClick={() => fileInput.current?.click()}>Restore</button><input ref={fileInput} type="file" accept="application/json,.json" onChange={restoreBackup} hidden /></div>
              </details>
              <details>
                <summary><span><strong>Profile</strong><small>Optional labels for exports</small></span><b>›</b></summary>
                <div className="setting-content settings-form"><label>Name or nickname<input value={data.profile.nickname} onChange={(e) => setData({ ...data, profile: { ...data.profile, nickname: e.target.value } })} placeholder="Optional" /></label><label>Program<input value={data.profile.program} onChange={(e) => setData({ ...data, profile: { ...data.profile, program: e.target.value } })} placeholder="Optional" /></label><label>Year level<input value={data.profile.yearLevel} onChange={(e) => setData({ ...data, profile: { ...data.profile, yearLevel: e.target.value } })} placeholder="Optional" /></label></div>
              </details>
              <details>
                <summary><span><strong>Schedule</strong><small>{data.subjects.length} subjects · {data.semester}</small></span><b>›</b></summary>
                <div className="setting-content"><button className="danger-button" onClick={() => setConfirmDelete(true)}>Delete local data</button></div>
              </details>
            </div>
          </div>
        )}
      </section>

      <nav className="mobile-nav">
        {([ ["today", "Today"], ["calendar", "Calendar"], ["tasks", "Tasks"], ["subjects", "Subjects"], ["settings", "Settings"] ] as Array<[View, string]>).map(([key, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}
      </nav>
      {confirmDelete && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmDelete(false); }}>
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <Image src="/assets/AnoSkedfinallogo.png" alt="" width={54} height={54} />
            <h2 id="delete-title">Delete this schedule?</h2>
            <p>Subjects and tasks will be removed from this device. A backup is the only way to restore them.</p>
            <div><button className="quiet-button" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="confirm-delete" onClick={() => { setConfirmDelete(false); setData(null); setStage("paste"); }}>Delete</button></div>
          </div>
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

function WeeklyTimetable({ subjects }: { subjects: Subject[] }) {
  const firstHour = 7;
  const lastHour = 22;
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
  const totalMinutes = (lastHour - firstHour) * 60;
  const events = subjects.flatMap((subject) => subject.meeting.days.map((day) => ({ subject, day })));

  return (
    <div className="timetable-shell">
      <div className="timetable" aria-label="Weekly class timetable">
        <div className="timetable-header">
          <div className="time-corner" />
          {DAY_META.map((day) => <div key={day.code}><strong>{day.short}</strong><span>{day.label.slice(0, 3)}</span></div>)}
        </div>
        <div className="timetable-content">
          <div className="time-axis">
            {hours.slice(0, -1).map((hour) => <span key={hour} style={{ top: `${((hour - firstHour) / (lastHour - firstHour)) * 100}%` }}>{formatTime(`${String(hour).padStart(2, "0")}:00`).replace(":00", "")}</span>)}
          </div>
          <div className="schedule-grid">
            <div className="day-columns">{DAY_META.map((day) => <i key={day.code} />)}</div>
            <div className="hour-lines">{hours.map((hour) => <i key={hour} style={{ top: `${((hour - firstHour) / (lastHour - firstHour)) * 100}%` }} />)}</div>
            {events.map(({ subject, day }) => {
              const dayIndex = DAY_META.findIndex((item) => item.code === day);
              const [startHour, startMinute] = subject.meeting.start.split(":").map(Number);
              const [endHour, endMinute] = subject.meeting.end.split(":").map(Number);
              const start = Math.max(0, startHour * 60 + startMinute - firstHour * 60);
              const end = Math.min(totalMinutes, endHour * 60 + endMinute - firstHour * 60);
              if (end <= 0 || start >= totalMinutes || end <= start) return null;
              return (
                <div
                  className="schedule-block"
                  key={`${subject.id}-${day}`}
                  style={{
                    left: `calc(${dayIndex * (100 / 7)}% + 4px)`,
                    width: `calc(${100 / 7}% - 8px)`,
                    top: `calc(${(start / totalMinutes) * 100}% + 3px)`,
                    height: `calc(${((end - start) / totalMinutes) * 100}% - 6px)`,
                    background: `${subject.color}1F`,
                    color: subject.color,
                  }}
                >
                  <strong>{subject.code}</strong>
                  <span>{subject.meeting.room}</span>
                  <small>{formatTime(subject.meeting.start).replace(":00", "")}–{formatTime(subject.meeting.end).replace(":00", "")}</small>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
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
  return <div className="empty-state"><Image src="/assets/AnoSkedfinallogo.png" alt="" width={38} height={38} /><h3>{title}</h3><p>{detail}</p></div>;
}
