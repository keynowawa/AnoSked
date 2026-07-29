/* eslint-disable @next/next/no-img-element */
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
  icon?: IconName;
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
  exportTitle?: string;
  subjects: Subject[];
  tasks: Task[];
  createdAt: string;
  consent?: { acceptedAt: string; version: string };
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

type View = "today" | "calendar" | "tasks" | "subjects" | "settings" | "about";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type IconName = "today" | "calendar" | "tasks" | "subjects" | "settings" | "about" | "install" | "image" | "calendarAdd" | "jump" | "book" | "flask" | "key" | "cpu" | "balance" | "backup" | "profile" | "trash";

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
const PRIMARY_NAV: Array<{ key: View; label: string; icon: IconName }> = [
  { key: "today", label: "Today", icon: "today" },
  { key: "calendar", label: "Calendar", icon: "calendar" },
  { key: "tasks", label: "Tasks", icon: "tasks" },
  { key: "subjects", label: "Subjects", icon: "subjects" },
];
const SUBJECT_ICONS: Array<{ icon: IconName; label: string }> = [
  { icon: "book", label: "Book" },
  { icon: "flask", label: "Research" },
  { icon: "cpu", label: "Technology" },
  { icon: "key", label: "Security" },
  { icon: "balance", label: "Humanities" },
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

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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

function subjectIcon(subject: Subject): IconName {
  if (subject.icon) return subject.icon;
  const name = `${subject.code} ${subject.title}`.toLowerCase();
  if (/research|thesis|project/.test(name)) return "flask";
  if (/crypto|security|coding theory/.test(name)) return "key";
  if (/parallel|distributed|comput/.test(name)) return "cpu";
  if (/ethic|law|society/.test(name)) return "balance";
  return "book";
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "today") return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
  if (name === "calendar") return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 17h2" /></svg>;
  if (name === "tasks") return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="m8 12 2.3 2.3L16 8.8" /></svg>;
  if (name === "subjects" || name === "book") return <svg {...common}><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H19v16H8.5A3.5 3.5 0 0 0 5 21.5z" /><path d="M5 5.5v16M9 6h6M9 10h6" /></svg>;
  if (name === "settings") return <svg {...common}><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" /></svg>;
  if (name === "about") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.2h.01" /></svg>;
  if (name === "install") return <svg {...common}><path d="M12 3v11m0 0 4-4m-4 4-4-4" /><path d="M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>;
  if (name === "image") return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m5 17 4-4 3 3 2-2 5 4" /></svg>;
  if (name === "calendarAdd") return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M12 13v5M9.5 15.5h5" /></svg>;
  if (name === "jump") return <svg {...common}><path d="M12 4v13m0 0 5-5m-5 5-5-5M6 21h12" /></svg>;
  if (name === "backup") return <svg {...common}><path d="M12 4v10m0-10L8 8m4-4 4 4" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>;
  if (name === "profile") return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>;
  if (name === "trash") return <svg {...common}><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></svg>;
  if (name === "flask") return <svg {...common}><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M8 15h8" /></svg>;
  if (name === "key") return <svg {...common}><circle cx="8" cy="12" r="4" /><path d="M12 12h9M17 12v3M20 12v2" /></svg>;
  if (name === "cpu") return <svg {...common}><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M17 9h4M3 15h4M17 15h4" /></svg>;
  return <svg {...common}><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m5 11v5c3 3 11 3 14 0v-5M21 8v6" /></svg>;
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
  const [clock, setClock] = useState(new Date());
  const [taskTitle, setTaskTitle] = useState("");
  const [taskSubject, setTaskSubject] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [policy, setPolicy] = useState<"privacy" | "terms" | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
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
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", captureInstall);
    return () => window.removeEventListener("beforeinstallprompt", captureInstall);
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

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

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
  const selectedIsToday = dateKey(selectedDate) === dateKey(clock);
  const selectedWeekday = selectedDate.toLocaleDateString("en-PH", { weekday: "long" });
  const firstDaySubject = daySubjects[0];
  const dashboardSummary = firstDaySubject
    ? `${selectedIsToday ? "You have" : "There are"} ${daySubjects.length} ${daySubjects.length === 1 ? "class" : "classes"}${selectedIsToday ? " today" : " scheduled"}. ${selectedIsToday ? "First up" : "The first one"} is ${firstDaySubject.title} at ${formatTime(firstDaySubject.meeting.start).replace(":00", "")} in ${firstDaySubject.meeting.room}.`
    : selectedIsToday
      ? "No classes today—your schedule is clear."
      : "No classes scheduled. Your day is open.";

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

  async function requestInstall() {
    if (!installPrompt) {
      setShowInstallGuide(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setNotice("AnoSked is being added to your Home Screen.");
    setInstallPrompt(null);
  }

  function saveSchedule() {
    if (!parsed) return;
    if (!acceptedTerms) {
      setNotice("Please review and accept the Privacy Notice and Terms first.");
      return;
    }
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
      exportTitle: "My week",
      subjects: parsed.subjects,
      tasks: [],
      createdAt: new Date().toISOString(),
      consent: { acceptedAt: new Date().toISOString(), version: "2026-07-29" },
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

  function updateParsedSubjectIcon(id: string, icon: IconName) {
    if (!parsed) return;
    setParsed({ ...parsed, subjects: parsed.subjects.map((subject) => subject.id === id ? { ...subject, icon } : subject) });
  }

  function addSubject(subject: Subject) {
    if (!data) return;
    setData({ ...data, subjects: [...data.subjects, subject], totalUnits: data.totalUnits + subject.units });
    setShowSubjectForm(false);
    setNotice(`${subject.title} was added.`);
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
        `SUMMARY:${escapeICS(`${subject.title} · ${subject.code}`)}`,
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
    const days = DAY_META.filter((day) => data.subjects.some((subject) => subject.meeting.days.includes(day.code)));
    const starts = data.subjects.map((subject) => { const [hour, minute] = subject.meeting.start.split(":").map(Number); return hour * 60 + minute; });
    const ends = data.subjects.map((subject) => { const [hour, minute] = subject.meeting.end.split(":").map(Number); return hour * 60 + minute; });
    const firstHour = Math.floor(Math.min(...starts) / 60);
    const lastHour = Math.ceil(Math.max(...ends) / 60);
    const hourSpan = Math.max(1, lastHour - firstHour);
    const gridLeft = margin + timeWidth;
    const gridWidth = width - gridLeft - margin;
    const headerHeight = mode === "wallpaper" ? 70 : 76;
    const gridTop = top + headerHeight;
    const gridHeight = height - gridTop - bottom;
    const hourHeight = gridHeight / hourSpan;
    const dayWidth = gridWidth / days.length;

    ctx.fillStyle = "#EAF6FC";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#153A52";
    ctx.font = `700 ${mode === "wallpaper" ? 52 : 62}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText(data.exportTitle?.trim() || (data.profile.nickname ? `${data.profile.nickname}’s week` : "My week"), margin, top - 112);
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

    for (let index = 0; index <= days.length; index += 1) {
      const x = gridLeft + index * dayWidth;
      ctx.strokeStyle = "rgba(71,128,158,.14)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, top + 14); ctx.lineTo(x, gridTop + gridHeight); ctx.stroke();
    }

    for (let hour = firstHour; hour <= lastHour; hour += 1) {
      const y = gridTop + (hour - firstHour) * hourHeight;
      ctx.strokeStyle = "rgba(71,128,158,.16)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(margin + 16, y); ctx.lineTo(width - margin - 16, y); ctx.stroke();
      if (hour < lastHour) {
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
      const startOffset = startHour + startMinute / 60 - firstHour;
      const duration = endHour + endMinute / 60 - (startHour + startMinute / 60);
      const x = gridLeft + dayIndex * dayWidth + 4;
      const y = gridTop + startOffset * hourHeight + 3;
      const blockWidth = dayWidth - 8;
      const blockHeight = Math.max(duration * hourHeight - 6, 34);
      ctx.globalAlpha = .88;
      ctx.fillStyle = subject.color;
      ctx.beginPath(); ctx.roundRect(x, y, blockWidth, blockHeight, 14); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "left";
      ctx.font = `700 ${mode === "wallpaper" ? 12 : 16}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillText(subject.title, x + 10, y + 22, blockWidth - 18);
      if (blockHeight > 54) {
        ctx.fillStyle = "rgba(255,255,255,.84)";
        ctx.font = `600 ${mode === "wallpaper" ? 11 : 15}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillText(`${subject.code} · ${subject.meeting.room}`, x + 10, y + 43, blockWidth - 18);
      }
    }));

    ctx.textAlign = "left";
    ctx.fillStyle = "#153A52";
    ctx.font = `700 ${mode === "wallpaper" ? 20 : 24}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText("Created in AnoSked?", margin, height - (mode === "wallpaper" ? 86 : 34));
    canvas.toBlob((blob) => {
      if (!blob) return;
      triggerDownload(blob, "image/png", `AnoSked-${mode}-${dateKey(new Date())}.png`);
      setNotice(mode === "wallpaper" ? "Wallpaper saved." : "Schedule image saved.");
    }, "image/png");
  }

  if (!hydrated) return <main className="loading-screen"><img className="brand-mark" src="/assets/AnoSkedfinallogo.png" alt="" /><p>Preparing AnoSked…</p></main>;

  if (!data) {
    return (
      <main className="onboarding-shell">
        <header className="public-header">
          <a className="wordmark" href="#top" aria-label="AnoSked home"><img className="brand-mark small" src="/assets/AnoSkedfinallogo.png" alt="" />AnoSked?</a>
          <button className="header-install" onClick={requestInstall}><Icon name="install" size={16} /> Add to Home Screen</button>
        </header>

        <section className="onboarding-grid" id="top">
          <div className="intro-copy">
            <img className="hero-mascot" src="/assets/AnoSkedlogo.png" alt="AnoSked carabao mascot" />
            <h1>Know your week.<br />Keep your cool.</h1>
            <p>A friendly calendar for classes, rooms, and schoolwork—built directly from your enrolled subjects.</p>
            <div className="hero-actions"><button className="install-button" onClick={requestInstall}><Icon name="install" /> Add to Home Screen</button><a href="#import">Set up my schedule</a></div>
            <div className="mini-week" aria-label="Sample weekly timetable">
              <div className="mini-week-head"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span></div>
              <div className="mini-week-grid">
                <div className="mini-block one"><strong>Research</strong><span>6 PM · SV217</span></div>
                <div className="mini-block two"><strong>Parallel Computing</strong><span>6 PM · SV213</span></div>
                <div className="mini-block three"><strong>Ethics</strong><span>6 PM · SV213</span></div>
              </div>
            </div>
          </div>

          <div className="paste-card" id="import">
            {stage === "paste" ? (
              <>
                <div className="card-heading">
                  <div><h2>Paste your subjects</h2><p>We’ll find the subject names, rooms, days, and times.</p></div>
                </div>
                <textarea value={paste} onChange={(event) => { setPaste(event.target.value); setIssue(null); }} placeholder="Paste your enrolled subjects here…" aria-label="Subject enlistment text" />
                {issue && (
                  <div className="error-panel" role="alert">
                    <img src="/assets/thinking.png" alt="" />
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
                        <div className="schedule-edit"><span className="meeting-days">{subject.meeting.days.map((day) => DAY_META.find((item) => item.code === day)?.short).join(" · ")}</span><label>Starts<input type="time" value={subject.meeting.start} onChange={(e) => updateParsedSubject(subject.id, "start", e.target.value)} aria-label="Start time" /></label><label>Ends<input type="time" value={subject.meeting.end} onChange={(e) => updateParsedSubject(subject.id, "end", e.target.value)} aria-label="End time" /></label><label>Room<input value={subject.meeting.room} onChange={(e) => updateParsedSubject(subject.id, "room", e.target.value)} aria-label="Room" /></label></div>
                        <IconPicker value={subject.icon || subjectIcon(subject)} onChange={(icon) => updateParsedSubjectIcon(subject.id, icon)} compact />
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
                <label className="consent-row"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /><span>I agree to the <button type="button" onClick={() => setPolicy("terms")}>Terms</button> and acknowledge the <button type="button" onClick={() => setPolicy("privacy")}>Privacy Notice</button>.</span></label>
                <button className="primary-button wide" disabled={!parsed.subjects.length || !acceptedTerms} onClick={saveSchedule}>Save schedule</button>
              </>
            ) : null}
          </div>
        </section>
        <footer className="public-footer"><span>© 2026 AnoSked? · Created by Kyann Tagle</span><nav><button onClick={() => setPolicy("privacy")}>Privacy</button><button onClick={() => setPolicy("terms")}>Terms</button><button onClick={() => setShowInstallGuide(true)}>Install help</button></nav></footer>
        {showInstallGuide && <InstallDialog onClose={() => setShowInstallGuide(false)} />}
        {policy && <PolicyDialog type={policy} onClose={() => setPolicy(null)} />}
        {notice && <BrandedToast message={notice} />}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="wordmark app-wordmark"><img className="brand-mark small" src="/assets/AnoSkedfinallogo.png" alt="" />AnoSked?</div>
        <nav>
          {PRIMARY_NAV.map(({ key, label, icon }) => (
            <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><Icon name={icon} /><span>{label}</span>{key === "tasks" && data.tasks.filter((task) => !task.done).length > 0 ? <b>{data.tasks.filter((task) => !task.done).length}</b> : null}</button>
          ))}
        </nav>
        <div className="sidebar-secondary"><button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Icon name="settings" /><span>Settings</span></button><button className={view === "about" ? "active" : ""} onClick={() => setView("about")}><Icon name="about" /><span>About</span></button></div>
      </aside>

      <section className="app-main">
        <header className="app-header">
          <div><span className="mobile-wordmark"><img src="/assets/AnoSkedfinallogo.png" alt="" />AnoSked?</span><p>{data.semester}{data.block ? ` · ${data.block}` : ""}</p></div>
          <button className="header-icon-button" onClick={() => setView("about")} aria-label="About AnoSked"><Icon name="about" /></button>
        </header>

        {view === "today" && (
          <div className="page today-page">
            <div className="page-title-row mascot-title dashboard-title">
              <div><span className="dashboard-greeting">{greeting(clock)}{data.profile.nickname ? `, ${data.profile.nickname}` : ""}</span><h1>{selectedIsToday ? `Today is ${selectedWeekday}.` : `${selectedWeekday} at a glance.`}</h1><p><strong>{selectedDate.toLocaleDateString("en-PH", { month: "long", day: "numeric" })}</strong> · {dashboardSummary}</p></div>
              <div className="dashboard-title-side"><img src="/assets/thinking.png" alt="AnoSked thinking" /><button className="date-button" onClick={() => setSelectedDate(new Date())}>Today</button></div>
            </div>
            <DayStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
            <div className="today-layout">
              <div className="timeline-card">
                <div className="section-heading"><h2>Timeline</h2><span>{DAY_META.find((day) => day.code === dayCode)?.label}</span></div>
                {!daySubjects.length ? <EmptyState title="Walang klase today" detail="Take it easy. Swipe to another day when you want to check the rest of your week." /> : daySubjects.map((subject) => {
                  const now = clock;
                  const isToday = dateKey(now) === dateKey(selectedDate);
                  const currentMinutes = now.getHours() * 60 + now.getMinutes();
                  const [sh, sm] = subject.meeting.start.split(":").map(Number);
                  const [eh, em] = subject.meeting.end.split(":").map(Number);
                  const active = isToday && currentMinutes >= sh * 60 + sm && currentMinutes < eh * 60 + em;
                  const linked = todayTasks.filter((task) => task.subjectId === subject.id);
                  return <div className={`timeline-event ${active ? "is-active" : ""}`} key={subject.id}>
                    <div className="timeline-time"><strong>{formatTime(subject.meeting.start)}</strong><span>{formatTime(subject.meeting.end)}</span></div>
                    <div className="event-line"><i style={{ background: subject.color }} /></div>
                    <div className="event-content"><div className="event-top"><div><h3>{subject.title}</h3><span className="subject-code" style={{ color: subject.color }}>{subject.code}</span></div>{active ? <span className="now-pill">Now</span> : null}</div><p className="event-meta"><b>{subject.meeting.room}</b><span>·</span>{subject.units} units</p>
                      {linked.map((task) => <button className={`inline-task ${task.done ? "done" : ""}`} key={task.id} onClick={() => toggleTask(task.id)}><span className="task-check">{task.done ? "✓" : ""}</span><b>{task.title}</b></button>)}
                    </div>
                  </div>;
                })}
              </div>
              <aside className="today-side">
                <div className="side-card"><div className="section-heading"><h2>Due today</h2><button onClick={() => setView("tasks")}>View all</button></div>{todayTasks.length ? todayTasks.map((task) => { const subject = data.subjects.find((item) => item.id === task.subjectId); return <button className={`side-task ${task.done ? "done" : ""}`} key={task.id} onClick={() => toggleTask(task.id)}><span>{task.done ? "✓" : ""}</span><div><strong>{task.title}</strong><p>{subject?.title} · {new Date(task.dueAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</p></div></button>; }) : <EmptyState title="All clear" detail="Nothing is due today." />}</div>
              </aside>
            </div>
          </div>
        )}

        {view === "calendar" && (
          <div className="page calendar-page">
            <div className="calendar-toolbar">
              <div><h1>Calendar</h1><p>See one day up close or your whole week at once.</p></div>
              <div className="calendar-actions">
                <div className="view-switch" aria-label="Calendar view">
                  <button className={calendarMode === "day" ? "active" : ""} onClick={() => setCalendarMode("day")}>Day</button>
                  <button className={calendarMode === "week" ? "active" : ""} onClick={() => setCalendarMode("week")}>Week</button>
                </div>
                <button className="quiet-button icon-button" onClick={exportICS}><Icon name="calendarAdd" size={16} /> Add to calendar</button>
                <button className="sky-button icon-button" onClick={() => setShowExportSheet(true)}><Icon name="image" size={16} /> Save image</button>
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
                      <div className="day-class-card" style={{ background: subject.color }}>
                        <div><strong>{subject.title}</strong><span>{subject.code}</span></div><b>{subject.meeting.room}</b>
                      </div>
                    </div>
                  )) : <EmptyState title="No classes" detail="Nothing scheduled for this day." />}
                </div>
              </>
            ) : <WeeklyTimetable subjects={data.subjects} />}

          </div>
        )}

        {view === "tasks" && (
          <div className="page tasks-page">
            <div className="page-title-row mascot-title"><div><h1>Tasks</h1><p>{data.tasks.filter((task) => !task.done).length} open · Keep each deadline connected to its subject.</p></div><img src="/assets/studying.png" alt="AnoSked studying" /></div>
            <div className="tasks-layout">
              <div className="task-composer"><div className="composer-heading"><h2>New task</h2><p>Three quick choices, then you’re done.</p></div><label className="task-title-field">Task title<input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} aria-label="Task title" /></label><div className="task-field-group"><span className="field-label">Subject</span><div className="task-subject-choices">{data.subjects.map((subject) => <button key={subject.id} className={taskSubject === subject.id ? "selected" : ""} onClick={() => setTaskSubject(subject.id)}><span style={{ background: subject.color }}><Icon name={subjectIcon(subject)} size={15} /></span><b>{subject.title}</b><small>{subject.code}</small></button>)}</div></div><div className="task-field-group"><span className="field-label">When is it due?</span><div className="quick-dates"><button onClick={setDueNextClass}>Next class</button><button onClick={() => { const date = new Date(); date.setDate(date.getDate() + 7); setTaskDue(new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); }}>In 7 days</button></div><label className="custom-due">Or choose a date<input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} /></label></div><button className="primary-button wide" onClick={createTask}>Add task</button></div>
              <div className="task-list-card"><div className="section-heading"><h2>Your tasks</h2><span>{data.tasks.filter((task) => !task.done).length} open</span></div>{data.tasks.length ? [...data.tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map((task) => { const subject = data.subjects.find((item) => item.id === task.subjectId); return <button className={`task-row ${task.done ? "done" : ""}`} key={task.id} onClick={() => toggleTask(task.id)}><span className="task-check">{task.done ? "✓" : ""}</span><div><strong>{task.title}</strong><p><b style={{ color: subject?.color }}>{subject?.title}</b> · {new Date(task.dueAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div></button>; }) : <EmptyState title="No tasks yet" detail="Add one when something comes up." />}</div>
            </div>
          </div>
        )}

        {view === "subjects" && (
          <div className="page">
            <div className="page-title-row"><div><h1>Subjects</h1><p>{data.subjects.length} subjects · {data.totalUnits} units · Rooms and schedules in one place.</p></div><button className="sky-button icon-button" onClick={() => setShowSubjectForm(true)}><Icon name="subjects" size={16} /> Add class or activity</button></div>
            <div className="subject-grid">{data.subjects.map((subject) => <article className="subject-card" key={subject.id}><div className="subject-card-top"><span className="subject-bubble" style={{ background: subject.color }}><Icon name={subjectIcon(subject)} size={21} /></span><span className="unit-pill">{subject.units} units</span></div><h2>{subject.title}</h2><span className="subject-code" style={{ color: subject.color }}>{subject.code}</span><div className="subject-detail"><span>{subject.meeting.days.map((day) => DAY_META.find((item) => item.code === day)?.short).join(" · ")}</span><strong>{formatTime(subject.meeting.start)}–{formatTime(subject.meeting.end)}</strong></div><div className="subject-room"><span>Room</span><strong>{subject.meeting.room}</strong></div><div className="subject-task-count">{data.tasks.filter((task) => task.subjectId === subject.id && !task.done).length} open tasks</div></article>)}</div>
          </div>
        )}

        {view === "settings" && (
          <div className="page settings-page">
            <div className="page-title-row mascot-title"><div><h1>Settings</h1><p>Back up, personalize, or reset AnoSked.</p></div><img src="/assets/checklist.png" alt="AnoSked checklist" /></div>
            <div className="settings-panel">
              <div className="local-disclosure"><strong>Local storage</strong><span>AnoSked collects nothing. Delete the app or clear browser data and this schedule is gone.</span></div>
              <details open>
                <summary><span className="setting-summary-main"><i><Icon name="backup" size={17} /></i><span><strong>Backup</strong><small>Move or protect your schedule</small></span></span><b>›</b></summary>
                <div className="setting-content"><button className="sky-button" onClick={exportBackup}>Export backup</button><button className="quiet-button" onClick={() => fileInput.current?.click()}>Restore</button><input ref={fileInput} type="file" accept="application/json,.json" onChange={restoreBackup} hidden /></div>
              </details>
              <details>
                <summary><span className="setting-summary-main"><i><Icon name="profile" size={17} /></i><span><strong>Profile and exports</strong><small>Customize names and image headings</small></span></span><b>›</b></summary>
                <div className="setting-content settings-form"><label>Export heading<input value={data.exportTitle || ""} onChange={(e) => setData({ ...data, exportTitle: e.target.value })} placeholder="My week" /></label><label>Name or nickname<input value={data.profile.nickname} onChange={(e) => setData({ ...data, profile: { ...data.profile, nickname: e.target.value } })} placeholder="Optional" /></label><label>Program<input value={data.profile.program} onChange={(e) => setData({ ...data, profile: { ...data.profile, program: e.target.value } })} placeholder="Optional" /></label><label>Year level<input value={data.profile.yearLevel} onChange={(e) => setData({ ...data, profile: { ...data.profile, yearLevel: e.target.value } })} placeholder="Optional" /></label></div>
              </details>
              <details>
                <summary><span className="setting-summary-main"><i><Icon name="calendarAdd" size={17} /></i><span><strong>Class reminders</strong><small>Use dependable Apple or Google Calendar alerts</small></span></span><b>›</b></summary>
                <div className="setting-content reminder-setting"><p>System Web Push needs a future notification service. For now, export recurring classes with 15-minute calendar alerts.</p><button className="sky-button icon-button" onClick={exportICS}><Icon name="calendarAdd" size={15} /> Add to calendar</button></div>
              </details>
              <details>
                <summary><span className="setting-summary-main"><i className="danger-setting-icon"><Icon name="trash" size={17} /></i><span><strong>Delete all local data</strong><small>Removes {data.subjects.length} subjects and every task from this device</small></span></span><b>›</b></summary>
                <div className="setting-content"><button className="danger-button" onClick={() => setConfirmDelete(true)}>Review deletion</button></div>
              </details>
              <button className="settings-link" onClick={() => setView("about")}><span><Icon name="about" /><span><strong>About AnoSked?</strong><small>Privacy, Terms, and how local storage works</small></span></span><b>›</b></button>
            </div>
          </div>
        )}

        {view === "about" && (
          <div className="page about-page">
            <div className="about-hero"><img src="/assets/AnoSkedlogo.png" alt="AnoSked carabao mascot" /><div><h1>About AnoSked?</h1><p>A friendly, independent student planner that turns enrolled subjects into a clearer week.</p></div></div>
            <div className="about-grid">
              <section><h2>Built to stay local</h2><p>Your pasted text, subjects, tasks, and optional profile stay in this browser. AnoSked has no account system, creator-accessible database, or analytics tracker.</p><button onClick={() => setPolicy("privacy")}>Read Privacy Notice</button></section>
              <section><h2>Keep your official record close</h2><p>AnoSked helps you read and remember your schedule, but your school’s official portal remains the source of truth.</p><button onClick={() => setPolicy("terms")}>Read Terms</button></section>
              <section><h2>Install when you’re ready</h2><p>Add AnoSked to your Home Screen for a full-screen, app-like experience on supported phones and tablets.</p><button onClick={requestInstall}><Icon name="install" size={15} /> Install AnoSked?</button></section>
              <section><h2>Your consent</h2><p>Privacy Notice and Terms accepted {data.consent?.acceptedAt ? new Date(data.consent.acceptedAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "on this device"}.</p></section>
              <section><h2>Found something off?</h2><p>Prepare a privacy-safe bug report and share it through any app you choose. AnoSked sends nothing automatically.</p><button onClick={() => setShowReport(true)}>Prepare bug report</button></section>
            </div>
            <footer className="about-footer">AnoSked? · Version 1.0 · Created by Kyann Tagle · Not affiliated with any university.</footer>
          </div>
        )}
      </section>

      <nav className="mobile-nav">
        {PRIMARY_NAV.map(({ key, label, icon }) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><Icon name={icon} size={18} /><span>{label}</span></button>)}
        <button className={view === "settings" || view === "about" ? "active" : ""} onClick={() => setView("settings")}><Icon name="settings" size={18} /><span>Settings</span></button>
      </nav>
      {confirmDelete && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmDelete(false); }}>
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <img src="/assets/thinking.png" alt="" />
            <h2 id="delete-title">Delete this schedule?</h2>
            <p>Subjects and tasks will be removed from this device. A backup is the only way to restore them.</p>
            <div><button className="quiet-button" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="confirm-delete" onClick={() => { setConfirmDelete(false); setData(null); setStage("paste"); }}>Delete</button></div>
          </div>
        </div>
      )}
      {showExportSheet && <ExportDialog onClose={() => setShowExportSheet(false)} onWallpaper={() => { setShowExportSheet(false); drawSchedule("wallpaper"); }} onImage={() => { setShowExportSheet(false); drawSchedule("share"); }} />}
      {showSubjectForm && <SubjectDialog onClose={() => setShowSubjectForm(false)} onAdd={addSubject} color={COLORS[data.subjects.length % COLORS.length]} />}
      {showReport && <ReportDialog onClose={() => setShowReport(false)} />}
      {showInstallGuide && <InstallDialog onClose={() => setShowInstallGuide(false)} />}
      {policy && <PolicyDialog type={policy} onClose={() => setPolicy(null)} />}
      {!data.consent && <ConsentDialog onAccept={() => setData({ ...data, consent: { acceptedAt: new Date().toISOString(), version: "2026-07-29" } })} onPolicy={setPolicy} />}
      {notice && <BrandedToast message={notice} />}
    </main>
  );
}

function WeeklyTimetable({ subjects }: { subjects: Subject[] }) {
  const timetableRef = useRef<HTMLDivElement>(null);
  const firstHour = 7;
  const lastHour = 22;
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
  const totalMinutes = (lastHour - firstHour) * 60;
  const events = subjects.flatMap((subject) => subject.meeting.days.map((day) => ({ subject, day })));
  const earliest = [...subjects].sort((a, b) => a.meeting.start.localeCompare(b.meeting.start))[0];
  const jumpKey = earliest ? `${earliest.id}-${earliest.meeting.days[0]}` : "";
  const earliestHour = earliest ? Number(earliest.meeting.start.split(":")[0]) : 0;
  const shouldShowJump = earliestHour >= 12;

  function jumpToClasses() {
    timetableRef.current?.querySelector(".jump-target")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="weekly-view">
      <div className="timetable-intro"><div><strong>Your weekly timetable</strong><span>{earliest ? `First class begins at ${formatTime(earliest.meeting.start).replace(":00", "")}.` : "No classes scheduled."}</span></div>{shouldShowJump && <button className="jump-to-classes" onClick={jumpToClasses}><Icon name="jump" size={16} /> Jump to {formatTime(earliest.meeting.start).replace(":00", "")}</button>}</div>
      <div className="timetable-shell" ref={timetableRef}>
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
                  className={`schedule-block ${`${subject.id}-${day}` === jumpKey ? "jump-target" : ""}`}
                  key={`${subject.id}-${day}`}
                  style={{
                    left: `calc(${dayIndex * (100 / 7)}% + 4px)`,
                    width: `calc(${100 / 7}% - 8px)`,
                    top: `calc(${(start / totalMinutes) * 100}% + 3px)`,
                    height: `calc(${((end - start) / totalMinutes) * 100}% - 6px)`,
                    background: subject.color,
                  }}
                >
                  <strong>{subject.title}</strong>
                  <span>{subject.code} · {subject.meeting.room}</span>
                  <small>{formatTime(subject.meeting.start).replace(":00", "")}–{formatTime(subject.meeting.end).replace(":00", "")}</small>
                </div>
              );
            })}
          </div>
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
  return <div className="empty-state"><img src="/assets/noclass.png" alt="" /><h3>{title}</h3><p>{detail}</p></div>;
}

function IconPicker({ value, onChange, compact = false }: { value: IconName; onChange: (icon: IconName) => void; compact?: boolean }) {
  return <div className={`icon-picker ${compact ? "compact" : ""}`}><span>{compact ? "Icon" : "Choose an icon"}</span><div>{SUBJECT_ICONS.map(({ icon, label }) => <button type="button" key={icon} className={value === icon ? "selected" : ""} onClick={() => onChange(icon)} aria-label={label} title={label}><Icon name={icon} size={compact ? 14 : 18} /></button>)}</div></div>;
}

function SubjectDialog({ onClose, onAdd, color }: { onClose: () => void; onAdd: (subject: Subject) => void; color: string }) {
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:00");
  const [units, setUnits] = useState("0");
  const [days, setDays] = useState<DayCode[]>(["MO"]);
  const [icon, setIcon] = useState<IconName>("book");
  const [error, setError] = useState("");

  function toggleDay(day: DayCode) {
    setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
  }

  function submit() {
    if (!title.trim()) { setError("Add a name for this class or activity."); return; }
    if (!days.length) { setError("Choose at least one meeting day."); return; }
    if (!start || !end || end <= start) { setError("The end time must be after the start time."); return; }
    onAdd({ id: uid("sub"), code: code.trim().toUpperCase() || "ACTIVITY", title: title.trim(), units: Math.max(0, Number(units) || 0), color, icon, meeting: { days, start, end, room: room.trim() || "TBA" } });
  }

  return <div className="dialog-backdrop policy-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="brand-dialog subject-dialog" role="dialog" aria-modal="true" aria-labelledby="subject-dialog-title"><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><img src="/assets/studying.png" alt="" /><h2 id="subject-dialog-title">Add a class or activity</h2><p>Use this for an added class, organization work, review session, or recurring commitment.</p><div className="subject-form"><label className="wide-field">Name<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Code <small>Optional</small><input value={code} onChange={(event) => setCode(event.target.value)} /></label><label>Room or place <small>Optional</small><input value={room} onChange={(event) => setRoom(event.target.value)} /></label><div className="wide-field day-picker"><span>Meeting days</span><div>{DAY_META.map((day) => <button type="button" key={day.code} className={days.includes(day.code) ? "selected" : ""} onClick={() => toggleDay(day.code)}>{day.short}</button>)}</div></div><label>Starts<input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>Ends<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></label><label>Units <small>Optional</small><input type="number" min="0" step="1" value={units} onChange={(event) => setUnits(event.target.value)} /></label><div className="wide-field"><IconPicker value={icon} onChange={setIcon} /></div></div>{error && <p className="form-error">{error}</p>}<button className="sky-button wide-dialog" onClick={submit}>Add to my schedule</button></div></div>;
}

function ReportDialog({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState("Something looks wrong");
  const [detail, setDetail] = useState("");
  const [feedback, setFeedback] = useState("");

  async function prepareReport() {
    if (!detail.trim()) { setFeedback("Describe what happened first."); return; }
    const text = `AnoSked? bug report\nCategory: ${category}\nApp version: 1.0\n\n${detail.trim()}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "AnoSked? bug report", text });
        setFeedback("Report opened in your share sheet.");
      } else {
        await navigator.clipboard.writeText(text);
        setFeedback("Report copied. Send it through your preferred contact app.");
      }
    } catch {
      setFeedback("Sharing was cancelled. Your report stays here.");
    }
  }

  return <div className="dialog-backdrop policy-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="brand-dialog report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title"><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><img src="/assets/thinking.png" alt="" /><h2 id="report-title">Report a problem</h2><p>Nothing is sent automatically. You choose where the finished report goes.</p><label>What kind of problem?<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Something looks wrong</option><option>Schedule parsed incorrectly</option><option>A button does not work</option><option>Accessibility problem</option><option>Suggestion</option></select></label><label>What happened?<textarea value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="What did you expect, and what happened instead?" /></label>{feedback && <p className="report-feedback">{feedback}</p>}<button className="sky-button wide-dialog" onClick={prepareReport}>Share report</button></div></div>;
}

function BrandedToast({ message }: { message: string }) {
  return <div className="toast" role="status"><img src="/assets/AnoSkedlogo.png" alt="" /><span>{message}</span></div>;
}

function InstallDialog({ onClose }: { onClose: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="brand-dialog install-dialog" role="dialog" aria-modal="true" aria-labelledby="install-title"><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><img src="/assets/AnoSkedlogo.png" alt="" /><h2 id="install-title">Add AnoSked? to your Home Screen</h2><div className="install-steps"><div><b>iPhone or iPad</b><span>Open the Share menu, choose “Add to Home Screen,” then tap Add.</span></div><div><b>Android</b><span>Open your browser menu and choose “Install app” or “Add to Home screen.”</span></div></div><button className="sky-button wide-dialog" onClick={onClose}>Got it</button></div></div>;
}

function ExportDialog({ onClose, onWallpaper, onImage }: { onClose: () => void; onWallpaper: () => void; onImage: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="brand-dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title"><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><img src="/assets/AnoSkedlogo.png" alt="" /><h2 id="export-title">Save your weekly timetable</h2><p>Choose a layout. Both use the same Monday–Sunday grid shown in Calendar.</p><div className="export-choices"><button onClick={onWallpaper}><Icon name="today" /><span><strong>iPhone wallpaper</strong><small>Leaves room for the Lock Screen clock</small></span></button><button onClick={onImage}><Icon name="image" /><span><strong>PNG image</strong><small>Easy to share or keep in Photos</small></span></button></div></div></div>;
}

function PolicyDialog({ type, onClose }: { type: "privacy" | "terms"; onClose: () => void }) {
  const privacy = type === "privacy";
  return <div className="dialog-backdrop policy-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="brand-dialog policy-dialog" role="dialog" aria-modal="true" aria-labelledby="policy-title"><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><h2 id="policy-title">{privacy ? "Privacy Notice" : "Terms of Use"}</h2><p className="policy-date">Effective July 29, 2026</p>{privacy ? <div className="policy-copy"><h3>What stays on your device</h3><p>Enrollment text is processed in your browser. Parsed subjects, tasks, optional profile labels, and your consent record are stored locally in this browser. AnoSked currently has no accounts, creator-accessible database, advertising tracker, or analytics tracker.</p><h3>What is ignored</h3><p>Student numbers, fees, balances, and payment details are not intentionally saved. The original pasted text is discarded after you confirm the parsed schedule.</p><h3>Deletion and exports</h3><p>Clearing browser data or deleting the installed app can remove everything. Backup, image, wallpaper, and calendar files leave AnoSked only when you choose to export them; the destination app then applies its own privacy practices.</p></div> : <div className="policy-copy"><h3>Use of AnoSked</h3><p>AnoSked is a convenience tool for organizing class information. Check important dates, rooms, and schedule changes against your school’s official records.</p><h3>Your responsibility</h3><p>You are responsible for reviewing parsed information, maintaining backups, and deciding what to export. AnoSked is provided as-is and may not recognize every enrollment format.</p><h3>Independence</h3><p>AnoSked is not affiliated with, endorsed by, or an official service of any university.</p></div>}<button className="sky-button wide-dialog" onClick={onClose}>Close</button></div></div>;
}

function ConsentDialog({ onAccept, onPolicy }: { onAccept: () => void; onPolicy: (policy: "privacy" | "terms") => void }) {
  const [checked, setChecked] = useState(false);
  return <div className="dialog-backdrop consent-layer"><div className="brand-dialog consent-dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title"><img src="/assets/AnoSkedlogo.png" alt="" /><h2 id="consent-title">Before you continue</h2><p>AnoSked stores your schedule on this device. Please review how it works and agree before using this saved schedule.</p><label className="consent-row"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /><span>I agree to the <button type="button" onClick={() => onPolicy("terms")}>Terms</button> and acknowledge the <button type="button" onClick={() => onPolicy("privacy")}>Privacy Notice</button>.</span></label><button className="sky-button wide-dialog" disabled={!checked} onClick={onAccept}>Accept and continue</button></div></div>;
}
