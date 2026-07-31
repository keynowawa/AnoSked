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
  meetings?: Meeting[];
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
  soundEffects?: boolean;
  tourCompleted?: boolean;
};

type ParseIssue = {
  kind: "empty" | "fees-only" | "missing-table" | "empty-table" | "incomplete" | "timetable-grid" | "file";
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

type IconName = "today" | "calendar" | "tasks" | "subjects" | "settings" | "about" | "install" | "share" | "image" | "calendarAdd" | "jump" | "book" | "flask" | "key" | "cpu" | "balance" | "calculator" | "globe" | "backup" | "profile" | "trash" | "sound" | "edit";

const STORAGE_KEY = "anosked.local.v1";
const TIMETABLE_GRID_DETAIL = "This looks like text copied from a timetable image or PDF. Its rows and columns were lost, so AnoSked can’t safely match subjects with their times and rooms. Upload the original timetable when supported, paste a line-by-line subject list, or add each class manually.";
const SHARE_URL = "https://anosked.vercel.app";
const SHARE_MESSAGE = `Meet AnoSked? 📅

Paste your enrolled subjects and turn them into a clear daily timeline and weekly schedule in seconds. Save your timetable as a phone wallpaper, add tasks under each subject, and install AnoSked? on your Home Screen for quick access.

No account needed. Your schedule stays on your device.

Your classes, rooms, and deadlines, all one tap away.`;
const COLORS = ["#2F8FC4", "#5279C8", "#2D9A93", "#7B73C9", "#B86B5E", "#A8628E", "#4F8668"];
const MASCOT_ASSETS = ["/assets/default.webp", "/assets/thinking.webp", "/assets/studying.webp", "/assets/checklist.webp", "/assets/noclass.webp"];
const REVIEW_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
const DAY_META: Array<{ code: DayCode; short: string; label: string; js: number }> = [
  { code: "MO", short: "Mon", label: "Monday", js: 1 },
  { code: "TU", short: "Tue", label: "Tuesday", js: 2 },
  { code: "WE", short: "Wed", label: "Wednesday", js: 3 },
  { code: "TH", short: "Thu", label: "Thursday", js: 4 },
  { code: "FR", short: "Fri", label: "Friday", js: 5 },
  { code: "SA", short: "Sat", label: "Saturday", js: 6 },
  { code: "SU", short: "Sun", label: "Sunday", js: 0 },
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
  { icon: "calculator", label: "Mathematics" },
  { icon: "globe", label: "Language or social studies" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isShortString(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.length <= max;
}

function isValidStoredData(value: unknown): value is SkedData {
  if (!isRecord(value) || !Array.isArray(value.subjects) || !Array.isArray(value.tasks) || !isRecord(value.profile)) return false;
  if (value.subjects.length > 100 || value.tasks.length > 2000) return false;
  if (![value.semester, value.block, value.termStart, value.termEnd, value.createdAt].every((item) => isShortString(item))) return false;
  if (typeof value.totalUnits !== "number" || !Number.isFinite(value.totalUnits) || value.totalUnits < 0 || value.totalUnits > 200) return false;
  if (![value.profile.nickname, value.profile.program, value.profile.yearLevel].every((item) => isShortString(item))) return false;
  if (value.exportTitle !== undefined && !isShortString(value.exportTitle, 120)) return false;
  if (value.soundEffects !== undefined && typeof value.soundEffects !== "boolean") return false;
  if (value.tourCompleted !== undefined && typeof value.tourCompleted !== "boolean") return false;
  const validDays = new Set(DAY_META.map((day) => day.code));
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const validSubjects = value.subjects.every((subject) => {
    if (!isRecord(subject) || !isRecord(subject.meeting)) return false;
    const meetings = Array.isArray(subject.meetings) && subject.meetings.length ? subject.meetings : [subject.meeting];
    const validMeetings = meetings.length <= 14 && meetings.every((meeting) => isRecord(meeting) && Array.isArray(meeting.days) && meeting.days.length > 0
      && meeting.days.length <= 7 && meeting.days.every((day) => typeof day === "string" && validDays.has(day as DayCode))
      && isShortString(meeting.start, 5) && timePattern.test(meeting.start) && isShortString(meeting.end, 5)
      && timePattern.test(meeting.end) && meeting.end > meeting.start && isShortString(meeting.room, 150));
    return isShortString(subject.id, 100) && isShortString(subject.code, 50) && isShortString(subject.title, 300)
      && isShortString(subject.color, 30) && typeof subject.units === "number" && Number.isFinite(subject.units)
      && subject.units >= 0 && subject.units <= 20 && validMeetings;
  });
  if (!validSubjects) return false;
  const subjectIds = new Set(value.subjects.map((subject) => subject.id));
  return value.tasks.every((task) => isRecord(task) && isShortString(task.id, 100) && isShortString(task.subjectId, 100)
    && subjectIds.has(task.subjectId) && isShortString(task.title, 500) && isShortString(task.dueAt, 40)
    && !Number.isNaN(new Date(task.dueAt).getTime()) && typeof task.done === "boolean");
}

const SAMPLE = `Welcome to Adamson University
Subject Enlistment
1st Semester 2026-2027
B.S. COMPUTER SCIENCE
Fourth Year - 1st Semester
Enrolled Subjects
Block No. : CS 401
Section
Subject
Units
51001
CS421 : SOFTWARE ENGINEERING 2 (12001)
MTh 09:00-10:30 OZ AVR
3
51002
CS450 : MACHINE LEARNING (12002)
TF 10:30-12:00 SV213
3
51003
CS470 : CLOUD COMPUTING (12003)
Wed 13:00-16:00 CS LAB 2
3
51004
CS430 : INFORMATION ASSURANCE AND SECURITY (12004)
TF 14:00-15:30 SV217
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

function looksLikeTimetableGrid(text: string) {
  const dayCount = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].filter((day) => new RegExp(`\\b${day}\\b`, "i").test(text)).length;
  const timeCount = text.match(/\b\d{1,2}(?::|\.)\d{2}\s*(?:AM|PM)\b/gi)?.length || 0;
  return dayCount >= 3 && (timeCount >= 4 || /\b(?:class schedule|timetable|time)\b/i.test(text));
}

function subjectMeetings(subject: Subject) {
  return subject.meetings?.length ? subject.meetings : [subject.meeting];
}

function clockPart(raw: string) {
  const match = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return { hour, minute, suffix: match[3] || "" };
}

function flexibleTimeRange(startRaw: string, endRaw: string) {
  const startPart = clockPart(startRaw);
  const endPart = clockPart(endRaw);
  if (!startPart || !endPart) return null;
  const toMinutes = (part: NonNullable<ReturnType<typeof clockPart>>, suffix = part.suffix) => {
    let hour = part.hour % 12;
    if (suffix === "pm") hour += 12;
    return hour * 60 + part.minute;
  };
  let end = toMinutes(endPart);
  let start: number;
  if (startPart.suffix) {
    start = toMinutes(startPart);
  } else if (endPart.suffix) {
    const amCandidate = toMinutes(startPart, "am");
    const pmCandidate = toMinutes(startPart, "pm");
    start = pmCandidate < end && end - pmCandidate <= 6 * 60 ? pmCandidate : amCandidate;
  } else {
    start = toMinutes(startPart, startPart.hour === 12 ? "pm" : "am");
  }
  if (!endPart.suffix && end <= start) end += 12 * 60;
  if (endPart.suffix && end <= start) end += 12 * 60;
  if (start < 0 || end > 24 * 60 || end - start < 15 || end - start > 12 * 60) return null;
  const format = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { start: format(start), end: format(end) };
}

function parseFlexibleMeeting(line: string): Meeting | null {
  const match = line.trim().match(/^([A-Za-z/&]+)\s*(?:-|:)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)(?:\s+(?:(?:room|rm)\s*[:#-]?\s*)?(.+))?$/i);
  if (!match) return null;
  const days = decodeDays(match[1]);
  const times = flexibleTimeRange(match[2], match[3]);
  if (!days.length || !times) return null;
  const roomMatch = (match[4] || "").match(/^(?:(?:room|rm)\s*[:#-]?\s*)?(.+)$/i);
  return { days, ...times, room: roomMatch?.[1]?.trim() || "TBA" };
}

function parseFlexibleSubjectList(lines: string[]): ParseResult | null {
  const subjects: Subject[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const code = lines[index].replace(/\s+/g, " ").trim();
    const meetingOnNextLine = parseFlexibleMeeting(lines[index + 1] || "");
    const title = meetingOnNextLine ? code : (lines[index + 1] || "").replace(/\s+/g, " ").trim();
    let cursor = meetingOnNextLine ? index + 1 : index + 2;
    const meetings: Meeting[] = [];
    while (cursor < lines.length) {
      const meeting = parseFlexibleMeeting(lines[cursor]);
      if (!meeting) break;
      meetings.push(meeting);
      cursor += 1;
    }
    if (!meetings.length || !code || !title || code.length > 60 || title.length > 300) continue;
    subjects.push({
      id: uid("sub"),
      code: code.toUpperCase(),
      title,
      units: 0,
      color: COLORS[subjects.length % COLORS.length],
      meeting: meetings[0],
      meetings,
    });
    index = cursor - 1;
  }
  if (!subjects.length) return null;
  const semester = lines.find((line) => /(?:semester|term).*\d{4}\s*[-–]\s*\d{4}/i.test(line)) || "";
  const block = lines.find((line) => /^(?:section|block)\s*:/i.test(line))?.split(":").slice(1).join(":").trim() || "";
  return { semester, block, totalUnits: 0, program: "", yearLevel: "", subjects, warnings: ["Units were not included in this schedule and were saved as 0. Review every class before saving."] };
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
    const flexibleResult = parseFlexibleSubjectList(lines);
    if (flexibleResult) return { result: flexibleResult };
    if (looksLikeTimetableGrid(cleaned)) {
      return { issue: { kind: "timetable-grid", title: "This timetable needs its original layout", detail: TIMETABLE_GRID_DETAIL } };
    }
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
    const flexibleResult = parseFlexibleSubjectList(lines);
    if (flexibleResult) return { result: flexibleResult };
    if (looksLikeTimetableGrid(cleaned)) {
      return { issue: { kind: "timetable-grid", title: "This timetable needs its original layout", detail: TIMETABLE_GRID_DETAIL } };
    }
    return { issue: { kind: "empty-table", title: "We found the table, but no complete subjects", detail: "Make sure each subject includes its code, class days, start and end time, room, and units." } };
  }

  const parsedUnits = subjects.reduce((sum, subject) => sum + subject.units, 0);
  if (declaredUnits && parsedUnits !== declaredUnits) {
    warnings.push(`The subjects add up to ${parsedUnits} units, but the page says ${declaredUnits}. Review the list before saving.`);
  }
  if (!semester) warnings.push("The semester label was not found. You can add it before saving.");

  return { result: { semester, block, totalUnits: declaredUnits || parsedUnits, program, yearLevel, subjects, warnings } };
}

async function createLocalOcrWorker(onProgress: (message: string) => void) {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr",
    logger: (event) => {
      if (event.status === "loading tesseract core") onProgress("Starting the local reader…");
      else if (event.status === "loading language traineddata") onProgress("Loading the text reader…");
      else if (event.status === "initializing api") onProgress("Almost ready…");
      else if (event.status === "recognizing text") onProgress(`Reading timetable… ${Math.round((event.progress || 0) * 100)}%`);
    },
  });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1" });
  return worker;
}

async function preparePhotoForOcr(file: File) {
  const bitmap = await createImageBitmap(file);
  const longestSide = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, 2200 / longestSide);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    bitmap.close();
    throw new Error("This browser could not prepare the photo.");
  }
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.filter = "grayscale(1) contrast(1.18)";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

async function extractScheduleFile(file: File, onProgress: (message: string) => void) {
  if (file.type.startsWith("image/")) {
    onProgress("Optimizing the photo…");
    const canvas = await preparePhotoForOcr(file);
    const worker = await createLocalOcrWorker(onProgress);
    try {
      const result = await worker.recognize(canvas);
      return result.data.text.trim();
    } finally {
      await worker.terminate();
    }
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Choose a JPG, PNG, HEIC, WEBP, or PDF file.");
  }

  onProgress("Reading the PDF…");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  if (pdf.numPages > 8) {
    await loadingTask.destroy();
    throw new Error("Choose a timetable PDF with 8 pages or fewer.");
  }

  try {
    const pageLines: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(`Reading PDF page ${pageNumber} of ${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const entries = content.items.flatMap((item) => {
        if (!("str" in item) || !item.str.trim()) return [];
        return [{ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }];
      }).sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x);
      const rows: Array<{ y: number; cells: Array<{ x: number; text: string }> }> = [];
      entries.forEach((entry) => {
        const row = rows.find((candidate) => Math.abs(candidate.y - entry.y) <= 3);
        if (row) row.cells.push({ x: entry.x, text: entry.text });
        else rows.push({ y: entry.y, cells: [{ x: entry.x, text: entry.text }] });
      });
      pageLines.push(rows.sort((a, b) => b.y - a.y).map((row) => row.cells.sort((a, b) => a.x - b.x).map((cell) => cell.text).join(" ")).join("\n"));
    }

    const embeddedText = pageLines.join("\n").trim();
    if (embeddedText.length >= 60) return embeddedText;

    onProgress("This PDF is scanned. Reading it as an image…");
    const worker = await createLocalOcrWorker(onProgress);
    try {
      const scannedPages: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("This browser could not prepare the PDF page.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        onProgress(`Reading scanned page ${pageNumber} of ${pdf.numPages}…`);
        const result = await worker.recognize(canvas);
        scannedPages.push(result.data.text.trim());
      }
      return scannedPages.join("\n").trim();
    } finally {
      await worker.terminate();
    }
  } finally {
    await loadingTask.destroy();
  }
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

function compactTitle(title: string, max = 42) {
  const clean = title.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function reviewMeetingSummary(subject: Subject) {
  const meetings = subjectMeetings(subject);
  const first = meetings[0];
  if (!first) return "No meeting added";
  const days = first.days.map((day) => DAY_META.find((item) => item.code === day)?.short).filter(Boolean).join(" · ");
  const room = first.room && first.room !== "TBA" ? ` · ${first.room}` : "";
  const more = meetings.length > 1 ? ` · +${meetings.length - 1} more` : "";
  return `${days} · ${formatTime(first.start).replace(":00", "")}–${formatTime(first.end).replace(":00", "")}${room}${more}`;
}

function playFeedbackTone(kind: "save" | "complete" | "delete" = "save") {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  if (context.state === "suspended") void context.resume();
  const tones = kind === "complete"
    ? [{ frequency: 523.25, delay: 0, duration: .16 }, { frequency: 659.25, delay: .075, duration: .18 }, { frequency: 783.99, delay: .15, duration: .22 }]
    : kind === "delete"
      ? [{ frequency: 659.25, delay: 0, duration: .13 }, { frequency: 523.25, delay: .085, duration: .19 }]
      : [{ frequency: 659.25, delay: 0, duration: .14 }, { frequency: 783.99, delay: .08, duration: .19 }];
  tones.forEach((tone, index) => {
    const oscillator = context.createOscillator();
    const shimmer = context.createOscillator();
    const gain = context.createGain();
    const shimmerGain = context.createGain();
    const start = context.currentTime + tone.delay;
    const end = start + tone.duration;
    oscillator.type = "sine";
    shimmer.type = "triangle";
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    shimmer.frequency.setValueAtTime(tone.frequency * 2, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.036, start + .018);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    shimmerGain.gain.setValueAtTime(0.0001, start);
    shimmerGain.gain.exponentialRampToValueAtTime(0.006, start + .014);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, end - .01);
    oscillator.connect(gain);
    shimmer.connect(shimmerGain);
    gain.connect(context.destination);
    shimmerGain.connect(context.destination);
    oscillator.start(start);
    shimmer.start(start);
    oscillator.stop(end);
    shimmer.stop(end);
    if (index === tones.length - 1) oscillator.addEventListener("ended", () => void context.close());
  });
}

function getSelectedDay(date: Date): DayCode {
  return DAY_META.find((day) => day.js === date.getDay())?.code || "MO";
}

function nextClassDate(subject: Subject, after = new Date()) {
  const candidates = subjectMeetings(subject).flatMap((meeting) => {
    const [hour, minute] = meeting.start.split(":").map(Number);
    const dates: Date[] = [];
    for (let offset = 0; offset <= 14; offset += 1) {
      const candidate = new Date(after);
      candidate.setDate(after.getDate() + offset);
      candidate.setHours(hour, minute, 0, 0);
      if (meeting.days.includes(getSelectedDay(candidate)) && candidate > after) dates.push(candidate);
    }
    return dates;
  });
  return candidates.sort((a, b) => a.getTime() - b.getTime())[0] || null;
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

async function shareOrDownload(blob: Blob, filename: string, title: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared" as const;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled" as const;
    }
  }
  triggerDownload(blob, blob.type, filename);
  return "downloaded" as const;
}

function canvasBlob(canvas: HTMLCanvasElement) {
  const dataUrl = canvas.toDataURL("image/png");
  const binary = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: "image/png" });
}

function subjectIcon(subject: Subject): IconName {
  if (subject.icon) return subject.icon;
  const name = `${subject.code} ${subject.title}`.toLowerCase();
  if (/research|thesis|project/.test(name)) return "flask";
  if (/crypto|security|coding theory/.test(name)) return "key";
  if (/parallel|distributed|comput/.test(name)) return "cpu";
  if (/ethic|law|philosophy/.test(name)) return "balance";
  if (/math|statistic|account|calculus|algebra/.test(name)) return "calculator";
  if (/language|history|society|geograph|culture/.test(name)) return "globe";
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
  if (name === "share") return <svg {...common}><rect x="5" y="9" width="14" height="12" rx="3" /><path d="M12 16V3m0 0L8 7m4-4 4 4" /></svg>;
  if (name === "image") return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m5 17 4-4 3 3 2-2 5 4" /></svg>;
  if (name === "calendarAdd") return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M12 13v5M9.5 15.5h5" /></svg>;
  if (name === "jump") return <svg {...common}><path d="M12 4v13m0 0 5-5m-5 5-5-5M6 21h12" /></svg>;
  if (name === "backup") return <svg {...common}><path d="M12 4v10m0-10L8 8m4-4 4 4" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>;
  if (name === "profile") return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>;
  if (name === "trash") return <svg {...common}><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></svg>;
  if (name === "edit") return <svg {...common}><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z" /><path d="m13 7 4 4" /></svg>;
  if (name === "sound") return <svg {...common}><path d="M5 10v4h4l5 4V6l-5 4H5Z" /><path d="M17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" /></svg>;
  if (name === "flask") return <svg {...common}><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M8 15h8" /></svg>;
  if (name === "key") return <svg {...common}><circle cx="8" cy="12" r="4" /><path d="M12 12h9M17 12v3M20 12v2" /></svg>;
  if (name === "cpu") return <svg {...common}><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M17 9h4M3 15h4M17 15h4" /></svg>;
  if (name === "balance") return <svg {...common}><path d="M12 3v18M7 6h10M5 6l-3 6h6L5 6Zm14 0-3 6h6l-3-6ZM8 21h8" /></svg>;
  if (name === "calculator") return <svg {...common}><rect x="5" y="3" width="14" height="18" rx="3" /><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h4" /></svg>;
  if (name === "globe") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>;
  return <svg {...common}><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m5 11v5c3 3 11 3 14 0v-5M21 8v6" /></svg>;
}

export default function Home() {
  const [data, setData] = useState<SkedData | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [stage, setStage] = useState<"paste" | "review">("paste");
  const [paste, setPaste] = useState("");
  const [issue, setIssue] = useState<ParseIssue | null>(null);
  const [importingFile, setImportingFile] = useState(false);
  const [fileImportStatus, setFileImportStatus] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [openReviewSubjectId, setOpenReviewSubjectId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>({ nickname: "", program: "", yearLevel: "" });
  const [termStart, setTermStart] = useState("");
  const [termEnd, setTermEnd] = useState("");
  const [view, setView] = useState<View>("today");
  const [calendarMode, setCalendarMode] = useState<"day" | "week">("week");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [followingToday, setFollowingToday] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [taskTitle, setTaskTitle] = useState("");
  const [taskSubject, setTaskSubject] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskPendingDelete, setTaskPendingDelete] = useState<Task | null>(null);
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectPendingDelete, setSubjectPendingDelete] = useState<Subject | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [policy, setPolicy] = useState<"privacy" | "terms" | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scheduleFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsedSaved: unknown = JSON.parse(saved);
          if (isValidStoredData(parsedSaved)) setData(parsedSaved);
          else localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
      setHydrated(true);
    });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    MASCOT_ASSETS.forEach((source) => {
      const image = new Image();
      image.decoding = "async";
      image.src = source;
      void image.decode().catch(() => undefined);
    });
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
    const timer = window.setInterval(() => {
      const now = new Date();
      setClock(now);
      if (followingToday) setSelectedDate(now);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [followingToday]);

  useEffect(() => {
    if (data?.tourCompleted !== false) return;
    const timeout = window.setTimeout(() => setShowTour(true), 0);
    return () => window.clearTimeout(timeout);
  }, [data?.tourCompleted]);

  const dayCode = getSelectedDay(selectedDate);
  const selectedDateKey = dateKey(selectedDate);
  const selectedBeforeTerm = Boolean(data && selectedDateKey < data.termStart);
  const selectedAfterTerm = Boolean(data && selectedDateKey > data.termEnd);
  const selectedOutsideTerm = selectedBeforeTerm || selectedAfterTerm;
  const daySubjects = useMemo(() => {
    if (!data || selectedOutsideTerm) return [];
    return data.subjects
      .flatMap((subject) => subjectMeetings(subject).filter((meeting) => meeting.days.includes(dayCode)).map((meeting) => ({ subject, meeting })))
      .sort((a, b) => a.meeting.start.localeCompare(b.meeting.start));
  }, [data, dayCode, selectedOutsideTerm]);

  const todayTasks = useMemo(() => {
    if (!data) return [];
    const key = dateKey(selectedDate);
    return data.tasks.filter((task) => task.dueAt.slice(0, 10) === key);
  }, [data, selectedDate]);
  const selectedIsToday = selectedDateKey === dateKey(clock);
  const selectedWeekday = selectedDate.toLocaleDateString("en-PH", { weekday: "long" });
  const firstDaySubject = daySubjects[0];
  const clockMinutes = clock.getHours() * 60 + clock.getMinutes();
  const activeDaySubject = selectedIsToday ? daySubjects.find((subject) => {
    const [startHour, startMinute] = subject.meeting.start.split(":").map(Number);
    const [endHour, endMinute] = subject.meeting.end.split(":").map(Number);
    return clockMinutes >= startHour * 60 + startMinute && clockMinutes < endHour * 60 + endMinute;
  }) : undefined;
  const nextDaySubject = selectedIsToday ? daySubjects.find((subject) => {
    const [startHour, startMinute] = subject.meeting.start.split(":").map(Number);
    return startHour * 60 + startMinute > clockMinutes;
  }) : firstDaySubject;
  const highlightedSubjectId = activeDaySubject?.subject.id || nextDaySubject?.subject.id;
  const openTasks = data?.tasks.filter((task) => !task.done) || [];
  const overdueTasks = openTasks.filter((task) => new Date(task.dueAt).getTime() < clock.getTime());
  const dashboardTasks = selectedIsToday
    ? [...overdueTasks, ...todayTasks.filter((task) => !overdueTasks.some((overdue) => overdue.id === task.id))]
    : todayTasks;
  const semesterEnded = Boolean(data && new Date(`${data.termEnd}T23:59:59`).getTime() < clock.getTime());
  const dashboardSummary = selectedAfterTerm
    ? semesterEnded && selectedIsToday
      ? `This semester ended on ${new Date(`${data?.termEnd}T12:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}. Your saved schedule is now inactive.`
      : "This date falls after the saved semester."
    : selectedBeforeTerm
      ? "This date falls before the saved semester begins."
      : firstDaySubject
    ? `${daySubjects.length} ${daySubjects.length === 1 ? "class" : "classes"}${selectedIsToday ? " today" : " scheduled"}. First: ${compactTitle(firstDaySubject.subject.title)} at ${formatTime(firstDaySubject.meeting.start).replace(":00", "")} · ${firstDaySubject.meeting.room}.`
    : selectedIsToday
      ? "No classes today. Your schedule is clear."
      : "No classes scheduled. Your day is open.";
  const emptyTimelineTitle = selectedAfterTerm
    ? semesterEnded && selectedIsToday ? "Semester complete" : "Outside this semester"
    : selectedBeforeTerm
      ? "Semester hasn’t started"
      : selectedIsToday ? "Walang klase today" : `No classes on ${selectedWeekday}`;
  const emptyTimelineDetail = selectedAfterTerm
    ? "Old recurring classes are no longer shown as active. Your saved schedule is still available."
    : selectedBeforeTerm
      ? `Classes begin on ${new Date(`${data?.termStart}T12:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric" })}.`
      : selectedIsToday
        ? "Take it easy. Swipe to another day when you want to check the rest of your week."
        : `Nothing is scheduled for ${selectedDate.toLocaleDateString("en-PH", { month: "long", day: "numeric" })}. Swipe to check another day.`;

  function prepareScheduleText(text: string) {
    const response = parseEnrollment(text);
    if (response.issue) {
      setIssue(response.issue);
      setParsed(null);
      return;
    }
    if (response.result) {
      setIssue(null);
      setParsed(response.result);
      setOpenReviewSubjectId(null);
      setProfile({ nickname: "", program: response.result.program, yearLevel: response.result.yearLevel });
      const year = Number(response.result.semester.match(/(20\d{2})/)?.[1]);
      if (year) {
        setTermStart(`${year}-08-01`);
        setTermEnd(`${year}-12-31`);
      }
      setStage("review");
      playFeedbackTone();
    }
  }

  function runParser() {
    prepareScheduleText(paste);
  }

  async function importScheduleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setIssue({ kind: "file", title: "That file is too large", detail: "Choose a photo or PDF smaller than 20 MB." });
      return;
    }
    setIssue(null);
    setImportingFile(true);
    setFileImportStatus("Opening the file…");
    try {
      const extracted = await extractScheduleFile(file, setFileImportStatus);
      if (!extracted.trim()) {
        setIssue({ kind: "file", title: "No readable text was found", detail: "Try a clearer, straight-on photo with the entire timetable visible, or use a PDF with selectable text." });
        return;
      }
      setPaste(extracted);
      prepareScheduleText(extracted);
    } catch (error) {
      setIssue({ kind: "file", title: "AnoSked couldn’t read that file", detail: error instanceof Error ? error.message : "Try another photo or PDF, or paste the subject list instead." });
    } finally {
      setImportingFile(false);
      setFileImportStatus("");
    }
  }

  function startManualSchedule() {
    setIssue(null);
    setParsed({ semester: "", block: "", totalUnits: 0, program: "", yearLevel: "", subjects: [], warnings: [] });
    setOpenReviewSubjectId(null);
    setProfile({ nickname: "", program: "", yearLevel: "" });
    setTermStart("");
    setTermEnd("");
    setStage("review");
  }

  function addParsedSubject(subject: Subject) {
    setParsed((current) => current ? { ...current, subjects: [...current.subjects, subject], totalUnits: current.totalUnits + subject.units } : current);
    setShowSubjectForm(false);
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

  async function shareAnoSked() {
    const completeMessage = `${SHARE_MESSAGE}\n\n${SHARE_URL}`;
    try {
      if (navigator.share) {
        await navigator.share({ text: completeMessage });
        setNotice("AnoSked? is ready to share.");
        return;
      }
      await navigator.clipboard.writeText(completeMessage);
      setNotice("Promo message and link copied.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(completeMessage);
        setNotice("Promo message and link copied.");
      } catch {
        setNotice(`Share this link: ${SHARE_URL}`);
      }
    }
  }

  function selectDate(date: Date) {
    setSelectedDate(date);
    setFollowingToday(dateKey(date) === dateKey(new Date()));
  }

  function goToToday() {
    setFollowingToday(true);
    setSelectedDate(new Date());
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
      soundEffects: true,
      tourCompleted: false,
    };
    setData(next);
    setPaste("");
    setParsed(null);
    setOpenReviewSubjectId(null);
    setStage("paste");
    setView("today");
    setShowTour(true);
    playFeedbackTone("complete");
    setNotice("Your sked is saved on this device.");
  }

  function removeParsedSubject(id: string) {
    if (!parsed) return;
    const subjects = parsed.subjects.filter((subject) => subject.id !== id);
    setParsed({ ...parsed, subjects, totalUnits: subjects.reduce((sum, subject) => sum + subject.units, 0) });
    if (openReviewSubjectId === id) setOpenReviewSubjectId(null);
  }

  function updateParsedSubject(id: string, field: "code" | "title", value: string) {
    if (!parsed) return;
    setParsed({
      ...parsed,
      subjects: parsed.subjects.map((subject) => subject.id === id ? { ...subject, [field]: value } : subject),
    });
  }

  function updateParsedMeeting(id: string, meetingIndex: number, field: "room" | "start" | "end", value: string) {
    if (!parsed) return;
    setParsed({ ...parsed, subjects: parsed.subjects.map((subject) => {
      if (subject.id !== id) return subject;
      const meetings = subjectMeetings(subject).map((meeting, index) => index === meetingIndex ? { ...meeting, [field]: value } : meeting);
      return { ...subject, meeting: meetings[0], meetings };
    }) });
  }

  function updateParsedSubjectIcon(id: string, icon: IconName) {
    if (!parsed) return;
    setParsed({ ...parsed, subjects: parsed.subjects.map((subject) => subject.id === id ? { ...subject, icon } : subject) });
  }

  function updateParsedSubjectColor(id: string, color: string) {
    if (!parsed) return;
    setParsed({ ...parsed, subjects: parsed.subjects.map((subject) => subject.id === id ? { ...subject, color } : subject) });
  }

  function saveSubject(subject: Subject) {
    if (!data) return;
    const editing = data.subjects.some((item) => item.id === subject.id);
    const subjects = editing ? data.subjects.map((item) => item.id === subject.id ? subject : item) : [...data.subjects, subject];
    setData({ ...data, subjects, totalUnits: subjects.reduce((sum, item) => sum + item.units, 0) });
    if (data.soundEffects !== false) playFeedbackTone();
    setShowSubjectForm(false);
    setEditingSubject(null);
    setNotice(editing ? `${subject.title} was updated.` : `${subject.title} was added.`);
  }

  function deleteSubject() {
    if (!data || !subjectPendingDelete) return;
    const subjects = data.subjects.filter((subject) => subject.id !== subjectPendingDelete.id);
    setData({ ...data, subjects, tasks: data.tasks.filter((task) => task.subjectId !== subjectPendingDelete.id), totalUnits: subjects.reduce((sum, subject) => sum + subject.units, 0) });
    if (taskSubject === subjectPendingDelete.id) setTaskSubject("");
    if (data.soundEffects !== false) playFeedbackTone("delete");
    setSubjectPendingDelete(null);
    setNotice("Class deleted.");
  }

  function createTask() {
    if (!data || !taskTitle.trim() || !taskSubject || !taskDue) {
      setNotice("Add a task, subject, and due date first.");
      return;
    }
    if (editingTaskId) {
      setData({ ...data, tasks: data.tasks.map((task) => task.id === editingTaskId ? { ...task, subjectId: taskSubject, title: taskTitle.trim(), dueAt: taskDue } : task) });
    } else {
      const task: Task = { id: uid("task"), subjectId: taskSubject, title: taskTitle.trim(), dueAt: taskDue, done: false };
      setData({ ...data, tasks: [...data.tasks, task] });
    }
    if (data.soundEffects !== false) playFeedbackTone();
    setTaskTitle("");
    setTaskSubject("");
    setTaskDue("");
    setEditingTaskId(null);
    setNotice(editingTaskId ? "Task updated." : "Task added.");
  }

  function editTask(task: Task) {
    setTaskTitle(task.title);
    setTaskSubject(task.subjectId);
    setTaskDue(task.dueAt.slice(0, 16));
    setEditingTaskId(task.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelTaskEdit() {
    setEditingTaskId(null);
    setTaskTitle("");
    setTaskSubject("");
    setTaskDue("");
  }

  function deleteTask() {
    if (!data || !taskPendingDelete) return;
    setData({ ...data, tasks: data.tasks.filter((task) => task.id !== taskPendingDelete.id) });
    if (editingTaskId === taskPendingDelete.id) cancelTaskEdit();
    if (data.soundEffects !== false) playFeedbackTone("delete");
    setTaskPendingDelete(null);
    setNotice("Task deleted.");
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
    const completing = data.tasks.some((task) => task.id === id && !task.done);
    setData({ ...data, tasks: data.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task) });
    if (data.soundEffects !== false && completing) playFeedbackTone("complete");
  }

  function exportBackup() {
    if (!data) return;
    triggerDownload(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data }, null, 2), "application/json", `AnoSked-Backup-${dateKey(new Date())}.json`);
    if (data.soundEffects !== false) playFeedbackTone();
    setNotice("Backup downloaded.");
  }

  function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setNotice("That backup is too large to be an AnoSked file.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsedFile: unknown = JSON.parse(String(reader.result));
        const restored = isRecord(parsedFile) && "data" in parsedFile ? parsedFile.data : parsedFile;
        if (!isValidStoredData(restored)) throw new Error("Invalid backup");
        setData(restored);
        setNotice("Backup restored on this device.");
      } catch {
        setNotice("This file isn’t a valid AnoSked backup.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  async function exportICS() {
    if (!data) return;
    const dayCodeMap: Record<DayCode, string> = { MO: "MO", TU: "TU", WE: "WE", TH: "TH", FR: "FR", SA: "SA", SU: "SU" };
    const until = data.termEnd.replace(/-/g, "") + "T235959";
    const events = data.subjects.flatMap((subject) => subjectMeetings(subject).map((meeting, meetingIndex) => {
      const startBase = new Date(`${data.termStart}T00:00:00`);
      let first: Date | null = null;
      for (let offset = 0; offset < 7; offset += 1) {
        const candidate = new Date(startBase);
        candidate.setDate(startBase.getDate() + offset);
        if (meeting.days.includes(getSelectedDay(candidate))) { first = candidate; break; }
      }
      if (!first) return "";
      const compact = dateKey(first).replace(/-/g, "");
      const start = meeting.start.replace(":", "") + "00";
      const end = meeting.end.replace(":", "") + "00";
      return [
        "BEGIN:VEVENT",
        `UID:${subject.id}-${meetingIndex}@anosked.local`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
        `DTSTART:${compact}T${start}`,
        `DTEND:${compact}T${end}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${meeting.days.map((day) => dayCodeMap[day]).join(",")};UNTIL=${until}`,
        `SUMMARY:${escapeICS(`${subject.title} · ${subject.code}`)}`,
        `LOCATION:${escapeICS(meeting.room)}`,
        "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15M", `DESCRIPTION:${escapeICS(`${subject.code} starts in 15 minutes`)}`, "END:VALARM",
        "END:VEVENT",
      ].join("\r\n");
    })).join("\r\n");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AnoSked//Local Student Calendar//EN", "CALSCALE:GREGORIAN", events, "END:VCALENDAR"].join("\r\n");
    const filename = `AnoSked-${data.semester.replace(/\s+/g, "-")}.ics`;
    const result = await shareOrDownload(new Blob([ics], { type: "text/calendar;charset=utf-8" }), filename, "Add AnoSked? to your calendar");
    if (result !== "cancelled") {
      if (data.soundEffects !== false) playFeedbackTone();
      setNotice(result === "shared" ? "Choose Calendar from your device’s sharing menu." : "Calendar file downloaded.");
    }
  }

  function drawSchedule(mode: "image" | "wallpaper", action: "save" | "share" = "save") {
    if (!data) return;
    const canvas = document.createElement("canvas");
    canvas.width = mode === "wallpaper" ? 1290 : 1800;
    canvas.height = mode === "wallpaper" ? 2796 : 1500;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const margin = mode === "wallpaper" ? 58 : 72;
    const top = mode === "wallpaper" ? 880 : 210;
    const bottom = mode === "wallpaper" ? 180 : 90;
    const timeWidth = mode === "wallpaper" ? 78 : 105;
    const scheduleEntries = data.subjects.flatMap((subject) => subjectMeetings(subject).map((meeting) => ({ subject, meeting })));
    const days = DAY_META.filter((day) => scheduleEntries.some(({ meeting }) => meeting.days.includes(day.code)));
    const starts = scheduleEntries.map(({ meeting }) => { const [hour, minute] = meeting.start.split(":").map(Number); return hour * 60 + minute; });
    const ends = scheduleEntries.map(({ meeting }) => { const [hour, minute] = meeting.end.split(":").map(Number); return hour * 60 + minute; });
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
    ctx.textAlign = "center";
    ctx.fillStyle = "#153A52";
    ctx.font = `700 ${mode === "wallpaper" ? 52 : 62}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText(data.exportTitle?.trim() || (data.profile.nickname ? `${data.profile.nickname}’s week` : "My week"), width / 2, top - 112);
    ctx.fillStyle = "#56788D";
    ctx.font = `500 ${mode === "wallpaper" ? 24 : 27}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText(`${data.semester}${data.block ? `  •  ${data.block}` : ""}`, width / 2, top - 62);

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

    scheduleEntries.forEach(({ subject, meeting }) => meeting.days.forEach((day) => {
      const dayIndex = days.findIndex((item) => item.code === day);
      if (dayIndex < 0) return;
      const [startHour, startMinute] = meeting.start.split(":").map(Number);
      const [endHour, endMinute] = meeting.end.split(":").map(Number);
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
        ctx.fillText(`${subject.code} · ${meeting.room}`, x + 10, y + 43, blockWidth - 18);
      }
    }));

    ctx.textAlign = "center";
    ctx.fillStyle = "#153A52";
    ctx.font = `700 ${mode === "wallpaper" ? 20 : 24}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText("Made with AnoSked?", width / 2, height - (mode === "wallpaper" ? 86 : 34));
    const filename = `AnoSked-${mode}-${dateKey(new Date())}.png`;
    const blob = canvasBlob(canvas);
    if (action === "save") {
      triggerDownload(blob, "image/png", filename);
      if (data.soundEffects !== false) playFeedbackTone();
      setNotice(mode === "wallpaper" ? "Wallpaper saved to your device." : "PNG image saved to your device.");
      return;
    }
    void shareOrDownload(blob, filename, mode === "wallpaper" ? "AnoSked? iPhone wallpaper" : "AnoSked? weekly timetable").then((result) => {
      if (result === "cancelled") return;
      if (data.soundEffects !== false) playFeedbackTone();
      setNotice(result === "shared" ? "Image opened in your device’s sharing menu." : "Sharing is unavailable, so the PNG was saved instead.");
    });
  }

  if (!hydrated) return <main className="loading-screen"><img className="brand-mark" src="/assets/AnoSkedicon.png" alt="" /><p>Preparing AnoSked…</p></main>;

  if (!data) {
    return (
      <main className="onboarding-shell">
        <header className="public-header">
          <a className="wordmark" href="#top" aria-label="AnoSked home"><img className="brand-mark small" src="/assets/default.webp" alt="" />AnoSked?</a>
          <button className="header-install" onClick={requestInstall}><Icon name="install" size={16} /> Add to Home Screen</button>
        </header>

        <section className="onboarding-grid" id="top">
          <div className="intro-copy">
            <img className="hero-mascot" src="/assets/default.webp" alt="AnoSked carabao mascot" />
            <h1>Your week,<br />minus the chaos.</h1>
            <p>Paste your enrolled subjects once. Get a readable week with every class, room, and task in the right place.</p>
            <div className="hero-actions"><button className="install-button" onClick={requestInstall}><Icon name="install" /> Add to Home Screen</button><button className="install-button hero-share-button" onClick={shareAnoSked}><Icon name="share" size={15} /> Share AnoSked?</button></div>
            <div className="mini-week" aria-label="Sample weekly timetable">
              <div className="mini-week-head"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span></div>
              <div className="mini-week-grid">
                <div className="mini-block one"><strong>Web Systems</strong><span>9 AM · Lab 2</span></div>
                <div className="mini-block two"><strong>Team Project</strong><span>1 PM · Studio</span></div>
                <div className="mini-block three"><strong>Design Lab</strong><span>2 PM · Room 204</span></div>
              </div>
            </div>
          </div>

          <div className={`paste-card ${stage === "review" ? "review-mode" : ""}`} id="import">
            {stage === "paste" ? (
              <>
                <div className="card-heading">
                  <div><h2>Add your schedule</h2><p>Paste a subject list, then check what AnoSked? finds.</p></div>
                </div>
                <textarea value={paste} onChange={(event) => { setPaste(event.target.value); setIssue(null); }} placeholder="Paste your enrolled subjects here…" aria-label="Subject enlistment text" />
                {issue && (
                  <div className="error-panel" role="alert">
                    <img src="/assets/thinking.webp" alt="" />
                    <div><strong>{issue.title}</strong><p>{issue.detail}</p><div className="error-actions"><button className="text-button" onClick={() => setPaste(SAMPLE)}>Load an example</button>{(issue.kind === "timetable-grid" || issue.kind === "file") && <button className="text-button" onClick={startManualSchedule}>Add classes manually</button>}</div></div>
                  </div>
                )}
                <div className="paste-actions">
                  <button className="secondary-button" onClick={() => { setPaste(SAMPLE); setIssue(null); }}>Try sample</button>
                  <button className="primary-button" onClick={runParser}>Continue</button>
                </div>
                <details className="alternative-imports">
                  <summary><span><strong>Other ways to add it</strong><small>Photo, PDF, or manual entry</small></span><b>›</b></summary>
                  <div className="schedule-file-import">
                    <input ref={scheduleFileInput} type="file" accept="image/*,application/pdf,.pdf" onChange={importScheduleFile} hidden />
                    <button className="file-import-button" onClick={() => scheduleFileInput.current?.click()} disabled={importingFile}><Icon name="image" size={17} /><span><strong>{importingFile ? fileImportStatus || "Reading your timetable…" : "Choose photo or PDF"}</strong><small>{importingFile ? "Keep AnoSked? open while it reads" : "Processed locally · 20 MB maximum"}</small></span></button>
                    <button className="manual-import-button" onClick={startManualSchedule} disabled={importingFile}>Enter manually</button>
                  </div>
                </details>
                <p className="one-line-privacy">Text, photos, and PDFs are read privately on your device. AnoSked does not upload them, and student numbers are ignored.</p>
              </>
            ) : parsed ? (
              <>
                <div className="card-heading review-heading">
                  <button className="back-button" onClick={() => setStage("paste")} aria-label="Go back">←</button>
                  <div><h2>Review your sked</h2><p>{parsed.subjects.length} subjects ready. Tap one to edit.</p></div><button className="review-add-class" onClick={() => setShowSubjectForm(true)}><Icon name="subjects" size={14} /> Add class</button>
                </div>
                {parsed.warnings.map((warning) => <div className="warning-strip" key={warning}>! {warning}</div>)}
                <div className="review-list">
                  {parsed.subjects.map((subject) => {
                    const isOpen = openReviewSubjectId === subject.id;
                    return (
                      <article className={`review-subject ${isOpen ? "is-open" : ""}`} key={subject.id}>
                        <div className="review-subject-bar">
                          <button className="review-subject-toggle" onClick={() => setOpenReviewSubjectId(isOpen ? null : subject.id)} aria-expanded={isOpen} aria-controls={`review-subject-${subject.id}`}>
                            <span className="review-subject-icon" style={{ background: subject.color }}><Icon name={subject.icon || subjectIcon(subject)} size={17} /></span>
                            <span className="review-subject-overview"><strong>{subject.title}</strong><small><b>{subject.code}</b><span>{reviewMeetingSummary(subject)}</span></small></span>
                            <span className="review-edit-cue"><Icon name="edit" size={13} /><b>{isOpen ? "Done" : "Edit"}</b></span>
                          </button>
                          <button className="remove-button" onClick={() => removeParsedSubject(subject.id)} aria-label={`Remove ${subject.code}`} title="Remove subject"><Icon name="trash" size={14} /></button>
                        </div>
                        {isOpen && <div className="review-fields" id={`review-subject-${subject.id}`}>
                          <div className="inline-fields"><label className="subject-code-input"><input value={subject.code} onChange={(e) => updateParsedSubject(subject.id, "code", e.target.value)} aria-label="Subject code" /><i style={{ background: subject.color }} /></label><input value={subject.title} onChange={(e) => updateParsedSubject(subject.id, "title", e.target.value)} aria-label="Subject title" /></div>
                          <div className="review-meetings">{subjectMeetings(subject).map((meeting, meetingIndex) => <div className="schedule-edit" key={`${meeting.days.join("")}-${meeting.start}-${meetingIndex}`}><div className="meeting-identity"><span>Meeting {meetingIndex + 1}</span><strong>{meeting.days.map((day) => DAY_META.find((item) => item.code === day)?.short).join(" · ")}</strong></div><div className="meeting-time-range"><ReviewTimeSelect label="Starts" value={meeting.start} onChange={(value) => updateParsedMeeting(subject.id, meetingIndex, "start", value)} /><span className="time-range-arrow" aria-hidden="true">→</span><ReviewTimeSelect label="Ends" value={meeting.end} onChange={(value) => updateParsedMeeting(subject.id, meetingIndex, "end", value)} /></div><label className="meeting-room-field">Room<input value={meeting.room} onChange={(e) => updateParsedMeeting(subject.id, meetingIndex, "room", e.target.value)} aria-label={`Meeting ${meetingIndex + 1} room`} /></label></div>)}</div>
                          <details className="review-customize"><summary><span>Icon and color</span><span className="review-look-preview"><Icon name={subject.icon || subjectIcon(subject)} size={14} /><i style={{ background: subject.color }} /><b>›</b></span></summary><div className="review-customize-panel"><IconPicker value={subject.icon || subjectIcon(subject)} onChange={(icon) => updateParsedSubjectIcon(subject.id, icon)} compact /><ColorPicker value={subject.color} onChange={(color) => updateParsedSubjectColor(subject.id, color)} /></div></details>
                        </div>}
                      </article>
                    );
                  })}
                </div>
                <div className="review-section">
                  <h3>Confirm the semester</h3><p>Add anything the imported schedule did not include.</p>
                  <div className="term-fields single-field"><label>Term or semester<input value={parsed.semester} onChange={(event) => setParsed({ ...parsed, semester: event.target.value })} placeholder="e.g. 1st Term 2026–2027" /></label></div>
                  <div className="date-fields"><label>Classes start<input type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} /></label><label>Classes end<input type="date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} /></label></div>
                </div>
                <details className="optional-profile">
                  <summary>Optional details</summary>
                  <div className="profile-fields"><label>Section or block<input value={parsed.block} onChange={(event) => setParsed({ ...parsed, block: event.target.value })} placeholder="e.g. 4CSD" /></label><label>Name or nickname<input value={profile.nickname} onChange={(e) => setProfile({ ...profile, nickname: e.target.value })} placeholder="Optional" /></label><label>Program<input value={profile.program} onChange={(e) => setProfile({ ...profile, program: e.target.value })} placeholder="Optional" /></label><label>Year level<input value={profile.yearLevel} onChange={(e) => setProfile({ ...profile, yearLevel: e.target.value })} placeholder="Optional" /></label></div>
                </details>
                <div className="review-save-dock"><label className="consent-row"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /><span>I agree to the <button type="button" onClick={() => setPolicy("terms")}>Terms</button> and acknowledge the <button type="button" onClick={() => setPolicy("privacy")}>Privacy Notice</button>.</span></label><button className="primary-button" disabled={!parsed.subjects.length || !acceptedTerms} onClick={saveSchedule}>Save schedule</button></div>
              </>
            ) : null}
          </div>
        </section>
        <footer className="public-footer"><span>© 2026 AnoSked? · Created by Kyann Tagle</span><nav><button onClick={() => setPolicy("privacy")}>Privacy</button><button onClick={() => setPolicy("terms")}>Terms</button><button onClick={() => setShowInstallGuide(true)}>Install help</button></nav></footer>
        {showInstallGuide && <InstallDialog onClose={() => setShowInstallGuide(false)} />}
        {showSubjectForm && <SubjectDialog onClose={() => setShowSubjectForm(false)} onSave={addParsedSubject} color={COLORS[(parsed?.subjects.length || 0) % COLORS.length]} />}
        {policy && <PolicyDialog type={policy} onClose={() => setPolicy(null)} />}
        {notice && <BrandedToast message={notice} />}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="wordmark app-wordmark"><img className="brand-mark small" src="/assets/default.webp" alt="" />AnoSked?</div>
        <nav>
          {PRIMARY_NAV.map(({ key, label, icon }) => (
            <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><Icon name={icon} /><span>{label}</span>{key === "tasks" && data.tasks.filter((task) => !task.done).length > 0 ? <b>{data.tasks.filter((task) => !task.done).length}</b> : null}</button>
          ))}
        </nav>
        <div className="sidebar-secondary"><button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Icon name="settings" /><span>Settings</span></button><button className={view === "about" ? "active" : ""} onClick={() => setView("about")}><Icon name="about" /><span>About</span></button></div>
      </aside>

      <section className="app-main">
        <header className="app-header">
          <span className="mobile-wordmark"><img src="/assets/default.webp" alt="" />AnoSked?</span>
          <button className="header-icon-button" onClick={() => setView("about")} aria-label="About AnoSked"><Icon name="about" /></button>
        </header>

        {view === "today" && (
          <div className="page today-page">
            <div className="page-title-row mascot-title dashboard-title">
              <div className="dashboard-title-copy"><span className="dashboard-term">{data.semester}{data.block ? ` · ${data.block}` : ""}</span><span className="dashboard-greeting">{greeting(clock)}{data.profile.nickname ? `, ${data.profile.nickname}` : ""}</span><h1>{selectedIsToday ? `Today is ${selectedWeekday}.` : `${selectedWeekday} at a glance.`}</h1><p className="dashboard-date">{selectedDate.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}</p>{firstDaySubject ? <div className="dashboard-brief"><span>{daySubjects.length} {daySubjects.length === 1 ? "class" : "classes"}</span><div><small>First</small><strong>{compactTitle(firstDaySubject.subject.title, 34)}</strong><b>{formatTime(firstDaySubject.meeting.start).replace(":00", "")} · {firstDaySubject.meeting.room}</b></div></div> : <p className="dashboard-empty-summary">{dashboardSummary}</p>}</div>
              <div className="dashboard-title-side"><img src="/assets/thinking.webp" alt="AnoSked thinking" /><button className="date-button" onClick={goToToday}>Today</button></div>
            </div>
            {semesterEnded && <div className="semester-banner"><span><Icon name="calendar" size={18} /></span><div><strong>Semester complete</strong><p>Old recurring classes are inactive. Your schedule and tasks remain on your device until you replace or delete them.</p></div><button onClick={exportBackup}>Export backup</button></div>}
            <DayStrip selectedDate={selectedDate} onSelect={selectDate} />
            <div className="today-layout">
              <div className="timeline-card">
                <div className="section-heading"><h2>Timeline</h2><span>{DAY_META.find((day) => day.code === dayCode)?.label}</span></div>
                {!daySubjects.length ? <EmptyState title={emptyTimelineTitle} detail={emptyTimelineDetail} /> : daySubjects.map(({ subject, meeting }) => {
                  const now = clock;
                  const isToday = dateKey(now) === dateKey(selectedDate);
                  const currentMinutes = now.getHours() * 60 + now.getMinutes();
                  const [sh, sm] = meeting.start.split(":").map(Number);
                  const [eh, em] = meeting.end.split(":").map(Number);
                  const active = isToday && currentMinutes >= sh * 60 + sm && currentMinutes < eh * 60 + em;
                  const linked = todayTasks.filter((task) => task.subjectId === subject.id);
                  const featured = highlightedSubjectId === subject.id;
                  return <div className={`timeline-event ${active ? "is-active" : ""} ${featured ? "is-featured" : ""}`} key={`${subject.id}-${meeting.days.join("")}-${meeting.start}`}>
                    <div className="timeline-time"><strong>{formatTime(meeting.start)}</strong><span>{formatTime(meeting.end)}</span></div>
                    <div className="event-line"><i style={{ background: subject.color }} /></div>
                    <div className="event-content"><div className="event-top"><div><h3>{subject.title}</h3><span className="subject-code" style={{ color: subject.color }}>{subject.code}</span></div>{featured ? <span className="now-pill">{active ? "Now" : selectedIsToday ? "Up next" : "First"}</span> : null}</div><p className="event-meta"><b>{meeting.room}</b>{subject.units > 0 && <><span>·</span>{subject.units} units</>}</p>
                      {linked.map((task) => <button className={`inline-task ${task.done ? "done" : ""}`} key={task.id} onClick={() => toggleTask(task.id)}><span className="task-check">{task.done ? "✓" : ""}</span><b>{task.title}</b></button>)}
                    </div>
                  </div>;
                })}
              </div>
              <aside className="today-side">
                <div className="side-card"><div className="section-heading"><h2>{selectedIsToday && overdueTasks.length ? "Needs attention" : selectedIsToday ? "Due today" : `Due ${selectedWeekday}`}</h2><button onClick={() => setView("tasks")}>View all</button></div>{dashboardTasks.length ? dashboardTasks.map((task) => { const subject = data.subjects.find((item) => item.id === task.subjectId); const overdue = !task.done && new Date(task.dueAt).getTime() < clock.getTime(); return <button className={`side-task ${task.done ? "done" : ""} ${overdue ? "overdue" : ""}`} key={task.id} onClick={() => toggleTask(task.id)}><span>{task.done ? "✓" : ""}</span><div><strong>{task.title}</strong><p>{overdue ? "Overdue · " : ""}{subject?.title} · {new Date(task.dueAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div></button>; }) : <EmptyState title="All clear" detail={selectedIsToday ? "Nothing is due today." : "Nothing is due on this day."} />}</div>
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
                <button className="quiet-button icon-button" onClick={exportICS}><Icon name="calendarAdd" size={17} /> Add to calendar</button>
                <button className="sky-button icon-button" onClick={() => setShowExportSheet(true)}><Icon name="image" size={17} /> Save image</button>
              </div>
            </div>

            {calendarMode === "day" ? (
              <>
                <DayStrip selectedDate={selectedDate} onSelect={selectDate} />
                <div className="day-calendar">
                  <div className="day-calendar-heading"><strong>{DAY_META.find((day) => day.code === dayCode)?.label}</strong><span>{selectedDate.toLocaleDateString("en-PH", { month: "long", day: "numeric" })}</span></div>
                  {daySubjects.length ? daySubjects.map(({ subject, meeting }) => (
                    <div className="day-class" key={`${subject.id}-${meeting.days.join("")}-${meeting.start}`}>
                      <div className="day-class-time"><strong>{formatTime(meeting.start)}</strong><span>{formatTime(meeting.end)}</span></div>
                      <div className="day-class-card" style={{ background: subject.color }}>
                        <div><strong>{subject.title}</strong><span>{subject.code}</span></div><b>{meeting.room}</b>
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
            <div className="page-title-row mascot-title"><div><h1>Tasks</h1><p>{openTasks.length} open{overdueTasks.length ? ` · ${overdueTasks.length} overdue` : ""} · Keep each deadline connected to its subject.</p></div><img src="/assets/studying.webp" alt="AnoSked studying" /></div>
            <div className="tasks-layout">
              <div className="task-composer"><div className="composer-heading"><h2>{editingTaskId ? "Edit task" : "New task"}</h2><p>{editingTaskId ? "Update what changed, then save." : "Three quick choices, then you’re done."}</p></div><label className="task-title-field">Task title<input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} aria-label="Task title" placeholder="e.g. Finish the research introduction" /></label><div className="task-field-group"><span className="field-label">Subject</span><div className="task-subject-choices">{data.subjects.map((subject) => <button key={subject.id} className={taskSubject === subject.id ? "selected" : ""} onClick={() => setTaskSubject(subject.id)}><span style={{ background: subject.color }}><Icon name={subjectIcon(subject)} size={15} /></span><b>{subject.title}</b><small>{subject.code}</small></button>)}</div></div><div className="task-field-group"><span className="field-label">When is it due?</span><div className="quick-dates"><button onClick={setDueNextClass}>Next class</button><button onClick={() => { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(23, 59, 0, 0); setTaskDue(new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); }}>Tomorrow</button><button onClick={() => { const date = new Date(); date.setDate(date.getDate() + 7); date.setHours(23, 59, 0, 0); setTaskDue(new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); }}>In 7 days</button></div><button className={`due-date-button ${taskDue ? "has-value" : ""}`} onClick={() => setShowDuePicker(true)}><Icon name="calendar" size={17} /><span><small>Choose a date and time</small><strong>{taskDue ? new Date(taskDue).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not selected"}</strong></span><b>›</b></button></div><div className="task-submit-row">{editingTaskId && <button className="quiet-button" onClick={cancelTaskEdit}>Cancel</button>}<button className="primary-button" onClick={createTask}>{editingTaskId ? "Save changes" : "Add task"}</button></div></div>
              <div className="task-list-card"><div className="section-heading"><h2>Your tasks</h2><span>{openTasks.length} open</span></div>{data.tasks.length ? [...data.tasks].sort((a, b) => {
                if (a.done !== b.done) return a.done ? 1 : -1;
                const aOverdue = new Date(a.dueAt).getTime() < clock.getTime();
                const bOverdue = new Date(b.dueAt).getTime() < clock.getTime();
                if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
                return a.dueAt.localeCompare(b.dueAt);
              }).map((task) => { const subject = data.subjects.find((item) => item.id === task.subjectId); const overdue = !task.done && new Date(task.dueAt).getTime() < clock.getTime(); return <div className={`task-row ${task.done ? "done" : ""} ${overdue ? "overdue" : ""}`} key={task.id}><button className="task-check" onClick={() => toggleTask(task.id)} aria-label={task.done ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}>{task.done ? "✓" : ""}</button><div><span className="task-title-line"><strong>{task.title}</strong>{overdue && <em>Overdue</em>}</span><p><b style={{ color: subject?.color }}>{subject?.title}</b> · {new Date(task.dueAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div><div className="task-row-actions"><button onClick={() => editTask(task)} aria-label={`Edit ${task.title}`} title="Edit"><Icon name="edit" size={15} /></button><button className="delete-task-button" onClick={() => setTaskPendingDelete(task)} aria-label={`Delete ${task.title}`} title="Delete"><Icon name="trash" size={15} /></button></div></div>; }) : <EmptyState title="No tasks yet" detail="Add one when something comes up." />}</div>
            </div>
          </div>
        )}

        {view === "subjects" && (
          <div className="page subjects-page">
            <div className="page-title-row"><div><h1>Subjects</h1><p>{data.subjects.length} subjects · {data.totalUnits} units · Rooms and schedules in one place.</p></div><button className="sky-button icon-button" onClick={() => { setEditingSubject(null); setShowSubjectForm(true); }}><Icon name="subjects" size={16} /> Add class or activity</button></div>
            <div className="subject-grid">{data.subjects.map((subject) => <article className="subject-card" key={subject.id}><div className="subject-card-top"><span className="subject-bubble" style={{ background: subject.color }}><Icon name={subjectIcon(subject)} size={21} /></span><div className="subject-card-tools"><span className="unit-pill">{subject.units > 0 ? `${subject.units} units` : "Units not listed"}</span><button onClick={() => { setEditingSubject(subject); setShowSubjectForm(true); }} aria-label={`Edit ${subject.title}`} title="Edit class"><Icon name="edit" size={14} /></button><button className="subject-delete-button" onClick={() => setSubjectPendingDelete(subject)} aria-label={`Delete ${subject.title}`} title="Delete class"><Icon name="trash" size={14} /></button></div></div><h2>{subject.title}</h2><span className="subject-code" style={{ color: subject.color }}>{subject.code}</span>{subjectMeetings(subject).map((meeting, meetingIndex) => <div className="subject-meeting" key={`${meeting.days.join("")}-${meeting.start}-${meetingIndex}`}><div className="subject-detail"><span>{meeting.days.map((day) => DAY_META.find((item) => item.code === day)?.short).join(" · ")}</span><strong>{formatTime(meeting.start)}–{formatTime(meeting.end)}</strong></div><div className="subject-room"><span>Room</span><strong>{meeting.room}</strong></div></div>)}<div className="subject-task-count">{data.tasks.filter((task) => task.subjectId === subject.id && !task.done).length} open tasks</div></article>)}</div>
          </div>
        )}

        {view === "settings" && (
          <div className="page settings-page">
            <div className="page-title-row mascot-title"><div><h1>Settings</h1><p>Back up, personalize, or reset AnoSked.</p></div><img src="/assets/checklist.webp" alt="AnoSked checklist" /></div>
            <div className="settings-panel">
              <details>
                <summary><span className="setting-summary-main"><i><Icon name="backup" size={17} /></i><span><strong>Backup</strong><small>Move or protect your schedule</small></span></span><b>›</b></summary>
                <div className="setting-content"><button className="sky-button icon-button" onClick={exportBackup}><Icon name="backup" size={15} /> Export backup</button><button className="quiet-button icon-button" onClick={() => fileInput.current?.click()}><Icon name="install" size={15} /> Restore backup</button><input ref={fileInput} type="file" accept="application/json,.json" onChange={restoreBackup} hidden /></div>
              </details>
              <details>
                <summary><span className="setting-summary-main"><i><Icon name="profile" size={17} /></i><span><strong>Profile and exports</strong><small>Customize names and image headings</small></span></span><b>›</b></summary>
                <div className="setting-content settings-form"><label>Export heading<input value={data.exportTitle || ""} onChange={(e) => setData({ ...data, exportTitle: e.target.value })} placeholder="My week" /></label><label>Name or nickname<input value={data.profile.nickname} onChange={(e) => setData({ ...data, profile: { ...data.profile, nickname: e.target.value } })} placeholder="Optional" /></label><label>Program<input value={data.profile.program} onChange={(e) => setData({ ...data, profile: { ...data.profile, program: e.target.value } })} placeholder="Optional" /></label><label>Year level<input value={data.profile.yearLevel} onChange={(e) => setData({ ...data, profile: { ...data.profile, yearLevel: e.target.value } })} placeholder="Optional" /></label><p className="autosave-note">Changes save automatically on this device.</p></div>
              </details>
              <details>
                <summary><span className="setting-summary-main"><i><Icon name="sound" size={17} /></i><span><strong>In-app sounds</strong><small>{data.soundEffects !== false ? "On for helpful confirmations" : "Off"}</small></span></span><b>›</b></summary>
                <div className="setting-content sound-setting"><div className="sound-setting-copy"><strong>AnoSked? chime</strong><p>A soft signature sound confirms saves, completed tasks, and changes. Moving around the app stays quiet.</p></div><div className="sound-setting-controls"><button className="quiet-button" onClick={() => playFeedbackTone("complete")}>Play chime</button><button className={`switch-control ${data.soundEffects !== false ? "on" : ""}`} role="switch" aria-label="In-app sounds" aria-checked={data.soundEffects !== false} onClick={() => { const enabled = data.soundEffects === false; setData({ ...data, soundEffects: enabled }); if (enabled) playFeedbackTone(); }}><span /></button></div></div>
              </details>
              <details>
                <summary><span className="setting-summary-main"><i><Icon name="calendarAdd" size={17} /></i><span><strong>Class reminders</strong><small>Use dependable Apple or Google Calendar alerts</small></span></span><b>›</b></summary>
                <div className="setting-content reminder-setting"><p>System Web Push needs a future notification service. For now, export recurring classes with 15-minute calendar alerts.</p><button className="sky-button icon-button" onClick={exportICS}><Icon name="calendarAdd" size={15} /> Add to calendar</button></div>
              </details>
              <details>
                <summary><span className="setting-summary-main"><i className="danger-setting-icon"><Icon name="trash" size={17} /></i><span><strong>Delete all local data</strong><small>Removes {data.subjects.length} subjects and every task from this device</small></span></span><b>›</b></summary>
                <div className="setting-content"><button className="danger-button icon-button" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={15} /> Review deletion</button></div>
              </details>
              <button className="settings-link" onClick={() => setView("about")}><span className="setting-summary-main"><i><Icon name="about" size={17} /></i><span><strong>About AnoSked?</strong><small>Privacy, Terms, and how local storage works</small></span></span><b>›</b></button>
            </div>
            <div className="local-disclosure"><Icon name="about" size={17} /><div><strong>Stored only on this device</strong><span>AnoSked collects nothing. Deleting the app or clearing browser data removes this schedule unless you export a backup.</span></div></div>
          </div>
        )}

        {view === "about" && (
          <div className="page about-page">
            <div className="about-hero"><img src="/assets/default.webp" alt="AnoSked carabao mascot" /><div><h1>About AnoSked?</h1><p>A friendly, independent student planner that turns enrolled subjects into a clearer week.</p></div></div>
            <div className="about-grid">
              <section><h2>Built to stay local</h2><p>Your pasted text, subjects, tasks, and optional profile stay in this browser. AnoSked has no account system, creator-accessible database, or analytics tracker.</p><button onClick={() => setPolicy("privacy")}>Read Privacy Notice</button></section>
              <section><h2>Keep your official record close</h2><p>AnoSked helps you read and remember your schedule, but your school’s official portal remains the source of truth.</p><button onClick={() => setPolicy("terms")}>Read Terms</button></section>
              <section><h2>Install when you’re ready</h2><p>Add AnoSked to your Home Screen for a full-screen, app-like experience on supported phones and tablets.</p><button onClick={requestInstall}><Icon name="install" size={15} /> Install AnoSked?</button></section>
              <section><h2>Share it with a classmate</h2><p>Send a quick introduction and the official public link through your device’s sharing menu. Supported apps can show the AnoSked? logo as the link preview.</p><button onClick={shareAnoSked}><Icon name="share" size={15} /> Share AnoSked?</button></section>
              <section><h2>Your consent</h2><p>Privacy Notice and Terms accepted {data.consent?.acceptedAt ? new Date(data.consent.acceptedAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "on this device"}.</p></section>
              <section><h2>Found something off?</h2><p>Prepare a privacy-safe bug report and share it through any app you choose. AnoSked sends nothing automatically.</p><button onClick={() => setShowReport(true)}>Prepare bug report</button></section>
            </div>
            <footer className="about-footer"><span>© 2026 Kyann Tagle. All rights reserved.</span><nav><button onClick={() => setPolicy("privacy")}>Privacy</button><button onClick={() => setPolicy("terms")}>Terms</button></nav></footer>
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
            <img src="/assets/thinking.webp" alt="" />
            <h2 id="delete-title">Delete this schedule?</h2>
            <p>Subjects and tasks will be removed from this device. A backup is the only way to restore them.</p>
            <div><button className="quiet-button" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="confirm-delete" onClick={() => { setConfirmDelete(false); setData(null); setStage("paste"); }}>Delete</button></div>
          </div>
        </div>
      )}
      {taskPendingDelete && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTaskPendingDelete(null); }}>
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-task-title">
            <img src="/assets/thinking.webp" alt="" />
            <h2 id="delete-task-title">Delete this task?</h2>
            <p>“{compactTitle(taskPendingDelete.title, 64)}” will be removed from this device.</p>
            <div><button className="quiet-button" onClick={() => setTaskPendingDelete(null)}>Keep task</button><button className="confirm-delete" onClick={deleteTask}>Delete task</button></div>
          </div>
        </div>
      )}
      {subjectPendingDelete && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSubjectPendingDelete(null); }}>
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-subject-title">
            <img src="/assets/thinking.webp" alt="" />
            <h2 id="delete-subject-title">Delete this class?</h2>
            <p>“{compactTitle(subjectPendingDelete.title, 64)}” and {(() => { const count = data.tasks.filter((task) => task.subjectId === subjectPendingDelete.id).length; return `${count} linked ${count === 1 ? "task" : "tasks"}`; })()} will be removed from this device.</p>
            <div><button className="quiet-button" onClick={() => setSubjectPendingDelete(null)}>Keep class</button><button className="confirm-delete" onClick={deleteSubject}>Delete class</button></div>
          </div>
        </div>
      )}
      {showExportSheet && <ExportDialog onClose={() => setShowExportSheet(false)} onWallpaper={() => { setShowExportSheet(false); drawSchedule("wallpaper", "save"); }} onImage={() => { setShowExportSheet(false); drawSchedule("image", "save"); }} onShare={() => { setShowExportSheet(false); drawSchedule("image", "share"); }} />}
      {showSubjectForm && <SubjectDialog onClose={() => { setShowSubjectForm(false); setEditingSubject(null); }} onSave={saveSubject} color={editingSubject?.color || COLORS[data.subjects.length % COLORS.length]} initial={editingSubject || undefined} />}
      {showDuePicker && <DueDateDialog value={taskDue} onClose={() => setShowDuePicker(false)} onSelect={(value) => { setTaskDue(value); setShowDuePicker(false); }} />}
      {showReport && <ReportDialog onClose={() => setShowReport(false)} />}
      {showInstallGuide && <InstallDialog onClose={() => setShowInstallGuide(false)} />}
      {policy && <PolicyDialog type={policy} onClose={() => setPolicy(null)} />}
      {showTour && <WelcomeTour onClose={() => { setShowTour(false); setData({ ...data, tourCompleted: true }); }} onNavigate={(nextView) => { setView(nextView); if (nextView === "today") goToToday(); }} />}
      {!data.consent && <ConsentDialog onAccept={() => setData({ ...data, consent: { acceptedAt: new Date().toISOString(), version: "2026-07-29" } })} onPolicy={setPolicy} />}
      {notice && <BrandedToast message={notice} />}
    </main>
  );
}

function WeeklyTimetable({ subjects }: { subjects: Subject[] }) {
  const timetableRef = useRef<HTMLDivElement>(null);
  const [jumpVisible, setJumpVisible] = useState(false);
  const firstHour = 7;
  const lastHour = 22;
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
  const totalMinutes = (lastHour - firstHour) * 60;
  const events = subjects.flatMap((subject) => subjectMeetings(subject).flatMap((meeting, meetingIndex) => meeting.days.map((day) => ({ subject, meeting, meetingIndex, day }))));
  const earliest = [...events].sort((a, b) => a.meeting.start.localeCompare(b.meeting.start))[0];
  const jumpKey = earliest ? `${earliest.subject.id}-${earliest.meetingIndex}-${earliest.day}` : "";
  const earliestHour = earliest ? Number(earliest.meeting.start.split(":")[0]) : 0;
  const shouldShowJump = earliestHour >= 12;

  useEffect(() => {
    const target = timetableRef.current?.querySelector(".jump-target");
    if (!target || !shouldShowJump) {
      setJumpVisible(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setJumpVisible(!entry.isIntersecting), { threshold: .25 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [jumpKey, shouldShowJump]);

  function jumpToClasses() {
    timetableRef.current?.querySelector(".jump-target")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="weekly-view">
      <div className="timetable-intro"><div><strong>Your weekly timetable</strong><span>{earliest ? `First class begins at ${formatTime(earliest.meeting.start).replace(":00", "")}.` : "No classes scheduled."}</span></div>{jumpVisible && <button className="jump-to-classes" onClick={jumpToClasses}><Icon name="jump" size={16} /> Jump to {formatTime(earliest.meeting.start).replace(":00", "")}</button>}</div>
      <div className="timetable-shell" ref={timetableRef}>
      <div className="timetable" aria-label="Weekly class timetable">
        <div className="timetable-header">
          <div className="time-corner" />
          {DAY_META.map((day) => <div key={day.code}><strong>{day.short}</strong></div>)}
        </div>
        <div className="timetable-content">
          <div className="time-axis">
            {hours.slice(0, -1).map((hour) => <span key={hour} style={{ top: `${((hour - firstHour) / (lastHour - firstHour)) * 100}%` }}>{formatTime(`${String(hour).padStart(2, "0")}:00`).replace(":00", "")}</span>)}
          </div>
          <div className="schedule-grid">
            <div className="day-columns">{DAY_META.map((day) => <i key={day.code} />)}</div>
            <div className="hour-lines">{hours.map((hour) => <i key={hour} style={{ top: `${((hour - firstHour) / (lastHour - firstHour)) * 100}%` }} />)}</div>
            {events.map(({ subject, meeting, meetingIndex, day }) => {
              const dayIndex = DAY_META.findIndex((item) => item.code === day);
              const [startHour, startMinute] = meeting.start.split(":").map(Number);
              const [endHour, endMinute] = meeting.end.split(":").map(Number);
              const start = Math.max(0, startHour * 60 + startMinute - firstHour * 60);
              const end = Math.min(totalMinutes, endHour * 60 + endMinute - firstHour * 60);
              if (end <= 0 || start >= totalMinutes || end <= start) return null;
              return (
                <div
                  className={`schedule-block ${`${subject.id}-${meetingIndex}-${day}` === jumpKey ? "jump-target" : ""}`}
                  key={`${subject.id}-${meetingIndex}-${day}`}
                  style={{
                    left: `calc(${dayIndex * (100 / 7)}% + 4px)`,
                    width: `calc(${100 / 7}% - 8px)`,
                    top: `calc(${(start / totalMinutes) * 100}% + 3px)`,
                    height: `calc(${((end - start) / totalMinutes) * 100}% - 6px)`,
                    background: subject.color,
                  }}
                >
                  <strong>{subject.title}</strong>
                  <span>{subject.code} · {meeting.room}</span>
                  <small>{formatTime(meeting.start).replace(":00", "")}–{formatTime(meeting.end).replace(":00", "")}</small>
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
  const moveWeek = (amount: number) => { const next = new Date(selectedDate); next.setDate(next.getDate() + amount * 7); onSelect(next); };
  return <div className="week-picker"><button className="week-arrow" onClick={() => moveWeek(-1)} aria-label="Previous week" title="Previous week">‹</button><div className="day-strip" aria-label="Choose a day">{days.map((date) => { const selected = dateKey(date) === dateKey(selectedDate); const today = dateKey(date) === dateKey(new Date()); return <button key={dateKey(date)} className={`${selected ? "selected" : ""} ${today ? "is-today" : ""}`} onClick={() => onSelect(date)}><span>{date.toLocaleDateString("en-PH", { weekday: "short" })}</span><strong>{date.getDate()}</strong><i /></button>; })}</div><button className="week-arrow" onClick={() => moveWeek(1)} aria-label="Next week" title="Next week">›</button></div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><img src="/assets/noclass.webp" alt="" /><h3>{title}</h3><p>{detail}</p></div>;
}

function ReviewTimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const options = REVIEW_TIME_OPTIONS.includes(value) ? REVIEW_TIME_OPTIONS : [...REVIEW_TIME_OPTIONS, value].sort();
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} time`}>{options.map((time) => <option value={time} key={time}>{formatTime(time)}</option>)}</select></label>;
}

function IconPicker({ value, onChange, compact = false }: { value: IconName; onChange: (icon: IconName) => void; compact?: boolean }) {
  return <div className={`icon-picker ${compact ? "compact" : ""}`}><span>{compact ? "Icon" : "Choose an icon"}</span><div>{SUBJECT_ICONS.map(({ icon, label }) => <button type="button" key={icon} className={value === icon ? "selected" : ""} onClick={() => onChange(icon)} aria-label={label} title={label}><Icon name={icon} size={compact ? 14 : 18} /></button>)}</div></div>;
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return <div className="color-picker"><span>Color</span><div>{COLORS.map((color) => <button type="button" key={color} className={value === color ? "selected" : ""} style={{ background: color }} onClick={() => onChange(color)} aria-label={`Use color ${color}`}><i /></button>)}</div></div>;
}

function DueDateDialog({ value, onClose, onSelect }: { value: string; onClose: () => void; onSelect: (value: string) => void }) {
  const initial = value ? new Date(value) : new Date();
  if (!value) initial.setDate(initial.getDate() + 1);
  const [selected, setSelected] = useState(dateKey(initial));
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [time, setTime] = useState(value.slice(11, 16) || "17:00");
  const today = dateKey(new Date());
  const leading = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const slots = Array.from({ length: 42 }, (_, index) => {
    const day = index - leading + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const timeOptions = [
    { value: "08:00", label: "8 AM" },
    { value: "12:00", label: "12 PM" },
    { value: "15:00", label: "3 PM" },
    { value: "17:00", label: "5 PM" },
    { value: "20:00", label: "8 PM" },
    { value: "23:59", label: "End of day" },
  ];
  const hour24 = Number(time.slice(0, 2));
  const minuteValue = time.slice(3, 5);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  function updateTime(nextHour: number, nextMinute: string, nextPeriod: string) {
    const normalizedHour = nextPeriod === "PM" ? (nextHour % 12) + 12 : nextHour % 12;
    setTime(`${String(normalizedHour).padStart(2, "0")}:${nextMinute}`);
  }

  function moveMonth(offset: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1));
  }

  return <div className="dialog-backdrop policy-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="brand-dialog due-date-dialog" role="dialog" aria-modal="true" aria-labelledby="due-date-title"><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><div className="due-dialog-heading"><span><Icon name="calendar" size={20} /></span><div><h2 id="due-date-title">Choose a due date</h2><p>Pick a day, then choose a useful time.</p></div></div><div className="month-switcher"><button onClick={() => moveMonth(-1)} aria-label="Previous month">‹</button><strong>{month.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}</strong><button onClick={() => moveMonth(1)} aria-label="Next month">›</button></div><div className="due-weekdays">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="due-calendar-grid">{slots.map((day, index) => {
    if (!day) return <span key={`blank-${index}`} />;
    const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const disabled = key < today;
    return <button key={key} className={selected === key ? "selected" : ""} disabled={disabled} onClick={() => setSelected(key)}>{day}</button>;
  })}</div><span className="field-label due-time-label">Due time</span><div className="due-time-options">{timeOptions.map((option) => <button key={option.value} className={time === option.value ? "selected" : ""} onClick={() => setTime(option.value)}>{option.label}</button>)}</div><div className="custom-time-row"><span>Or set any time</span><div><select aria-label="Due hour" value={hour12} onChange={(event) => updateTime(Number(event.target.value), minuteValue, period)}>{Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => <option key={hour}>{hour}</option>)}</select><span>:</span><select aria-label="Due minute" value={minuteValue} onChange={(event) => updateTime(hour12, event.target.value, period)}>{Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((minute) => <option key={minute}>{minute}</option>)}</select><select aria-label="AM or PM" value={period} onChange={(event) => updateTime(hour12, minuteValue, event.target.value)}><option>AM</option><option>PM</option></select></div></div><button className="sky-button wide-dialog" onClick={() => onSelect(`${selected}T${time}`)}>Use this due date</button></div></div>;
}

function WelcomeTour({ onClose, onNavigate }: { onClose: () => void; onNavigate: (view: View) => void }) {
  const [step, setStep] = useState(0);
  const steps: Array<{ title: string; detail: string; image: string }> = [
    { title: "Today, without the guessing", detail: "See your first class, room, and full timeline at a glance. Swipe the dates to check another day.", image: "/assets/thinking.webp" },
    { title: "Your whole week, clearly", detail: "Switch between day and week views. Save the timetable as an image or iPhone wallpaper anytime.", image: "/assets/studying.webp" },
    { title: "Deadlines stay with the subject", detail: "Add a task, choose its subject, then use Next class or any custom due time.", image: "/assets/checklist.webp" },
  ];
  const current = steps[step];
  function finish() {
    onNavigate("today");
    onClose();
  }
  return <div className="dialog-backdrop tour-layer" role="presentation"><div className="brand-dialog welcome-tour" role="dialog" aria-modal="true" aria-labelledby="tour-title"><span className="tour-step-label">{step + 1} of {steps.length}</span><button className="tour-skip" onClick={onClose}>Skip</button><div className="tour-art"><img src={current.image} alt="" /></div><h2 id="tour-title">{current.title}</h2><p>{current.detail}</p><div className="tour-dots" aria-label={`Step ${step + 1} of ${steps.length}`}>{steps.map((item, index) => <i key={item.title} className={index === step ? "active" : ""} />)}</div><div className={`tour-actions ${step === 0 ? "single" : ""}`}>{step > 0 && <button className="quiet-button" onClick={() => setStep(step - 1)}>Back</button>}{step < steps.length - 1 ? <button className="sky-button" onClick={() => setStep(step + 1)}>Next</button> : <button className="sky-button" onClick={finish}>Start my week</button>}</div></div></div>;
}

function SubjectDialog({ onClose, onSave, color, initial }: { onClose: () => void; onSave: (subject: Subject) => void; color: string; initial?: Subject }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [code, setCode] = useState(initial?.code || "");
  const [units, setUnits] = useState(String(initial?.units || 0));
  const [icon, setIcon] = useState<IconName>(initial?.icon || (initial ? subjectIcon(initial) : "book"));
  const [selectedColor, setSelectedColor] = useState(initial?.color || color);
  const [meetings, setMeetings] = useState<Meeting[]>(initial ? subjectMeetings(initial).map((meeting) => ({ ...meeting, days: [...meeting.days] })) : [{ days: ["MO"], start: "08:00", end: "09:00", room: "TBA" }]);
  const [error, setError] = useState("");

  function updateMeeting(index: number, field: "start" | "end" | "room", value: string) {
    setMeetings((current) => current.map((meeting, meetingIndex) => meetingIndex === index ? { ...meeting, [field]: value } : meeting));
  }

  function toggleDay(meetingIndex: number, day: DayCode) {
    setMeetings((current) => current.map((meeting, index) => index === meetingIndex ? { ...meeting, days: meeting.days.includes(day) ? meeting.days.filter((item) => item !== day) : [...meeting.days, day] } : meeting));
  }

  function submit() {
    if (!title.trim()) { setError("Add a name for this class or activity."); return; }
    if (meetings.some((meeting) => !meeting.days.length)) { setError("Choose at least one day for every meeting."); return; }
    if (meetings.some((meeting) => !meeting.start || !meeting.end || meeting.end <= meeting.start)) { setError("Every meeting must end after it starts."); return; }
    const normalizedMeetings = meetings.map((meeting) => ({ ...meeting, room: meeting.room.trim() || "TBA" }));
    onSave({ ...initial, id: initial?.id || uid("sub"), code: code.trim().toUpperCase() || "ACTIVITY", title: title.trim(), units: Math.max(0, Number(units) || 0), color: selectedColor, icon, meeting: normalizedMeetings[0], meetings: normalizedMeetings });
  }

  return <div className="dialog-backdrop policy-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="brand-dialog subject-dialog" role="dialog" aria-modal="true" aria-labelledby="subject-dialog-title"><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><img src="/assets/studying.webp" alt="" /><h2 id="subject-dialog-title">{initial ? "Edit class or activity" : "Add a class or activity"}</h2><p>Keep the essentials together. You can add another meeting when the time changes on a different day.</p><div className="subject-form"><label className="wide-field">Name<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Robotics Club meeting" /></label><label>Code <small>Optional</small><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. ORG" /></label><label>Units <small>Optional</small><input type="number" min="0" step="1" value={units} onChange={(event) => setUnits(event.target.value)} /></label><div className="wide-field subject-look-editor"><IconPicker value={icon} onChange={setIcon} /><ColorPicker value={selectedColor} onChange={setSelectedColor} /></div><div className="wide-field meeting-editors">{meetings.map((meeting, meetingIndex) => <section className="meeting-editor" key={meetingIndex}><header><strong>Meeting {meetingIndex + 1}</strong>{meetings.length > 1 && <button type="button" onClick={() => setMeetings((current) => current.filter((_, index) => index !== meetingIndex))}>Remove</button>}</header><div className="day-picker"><span>Days</span><div>{DAY_META.map((day) => <button type="button" key={day.code} className={meeting.days.includes(day.code) ? "selected" : ""} onClick={() => toggleDay(meetingIndex, day.code)}>{day.short}</button>)}</div></div><div className="meeting-fields"><label>Starts<input type="time" value={meeting.start} onChange={(event) => updateMeeting(meetingIndex, "start", event.target.value)} /></label><label>Ends<input type="time" value={meeting.end} onChange={(event) => updateMeeting(meetingIndex, "end", event.target.value)} /></label><label>Room or place <small>Optional</small><input value={meeting.room === "TBA" ? "" : meeting.room} onChange={(event) => updateMeeting(meetingIndex, "room", event.target.value)} placeholder="e.g. Library" /></label></div></section>)}<button type="button" className="add-meeting-button" onClick={() => setMeetings((current) => [...current, { days: ["MO"], start: "08:00", end: "09:00", room: "TBA" }])}>+ Add another meeting</button></div></div>{error && <p className="form-error">{error}</p>}<button className="sky-button wide-dialog" onClick={submit}>{initial ? "Save changes" : "Add to my schedule"}</button></div></div>;
}

function ReportDialog({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState("Something looks wrong");
  const [detail, setDetail] = useState("");
  const [feedback, setFeedback] = useState("");

  function prepareReport() {
    if (!detail.trim()) { setFeedback("Describe what happened first."); return; }
    const text = `AnoSked? bug report\nCategory: ${category}\nApp version: 1.0\n\n${detail.trim()}`;
    const subject = `[AnoSked? ${category}] Bug report`;
    window.location.href = `mailto:info.keyno@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    setFeedback("Your email app should open with the report addressed to info.keyno@gmail.com.");
  }

  return <div className="dialog-backdrop policy-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="brand-dialog report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title"><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><img src="/assets/thinking.png" alt="" /><h2 id="report-title">Report a problem</h2><p>Describe the issue and AnoSked will prepare an email to info.keyno@gmail.com. Nothing is sent until you review and send it.</p><label>What kind of problem?<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Something looks wrong</option><option>Schedule parsed incorrectly</option><option>A button does not work</option><option>Accessibility problem</option><option>Suggestion</option></select></label><label>What happened?<textarea value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="What did you expect, and what happened instead?" /></label>{feedback && <p className="report-feedback">{feedback}</p>}<button className="sky-button wide-dialog" onClick={prepareReport}>Open email report</button></div></div>;
}

function BrandedToast({ message }: { message: string }) {
  return <div className="toast" role="status"><span className="toast-mascot"><img src="/assets/default.webp" alt="" /></span><span>{message}</span></div>;
}

function InstallDialog({ onClose }: { onClose: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="brand-dialog install-dialog" role="dialog" aria-modal="true" aria-labelledby="install-title"><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><img src="/assets/default.png" alt="" /><h2 id="install-title">Add AnoSked? to your Home Screen</h2><div className="install-steps"><div><b>iPhone or iPad</b><span>Open the Share menu, choose “Add to Home Screen,” then tap Add.</span></div><div><b>Android</b><span>Open your browser menu and choose “Install app” or “Add to Home screen.”</span></div></div><button className="sky-button wide-dialog" onClick={onClose}>Got it</button></div></div>;
}

function ExportDialog({ onClose, onWallpaper, onImage, onShare }: { onClose: () => void; onWallpaper: () => void; onImage: () => void; onShare: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="brand-dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title"><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><img src="/assets/default.png" alt="" /><h2 id="export-title">Save your weekly timetable</h2><p>Save a file directly to your device, or open the separate sharing option.</p><div className="export-choices"><button onClick={onWallpaper}><Icon name="today" /><span><strong>Save iPhone wallpaper</strong><small>Leaves room for the Lock Screen clock and widgets</small></span></button><button onClick={onImage}><Icon name="image" /><span><strong>Save PNG image</strong><small>Downloads the weekly timetable to your device</small></span></button><button className="share-export-choice" onClick={onShare}><Icon name="share" /><span><strong>Share PNG image</strong><small>Opens your device’s sharing menu</small></span></button></div></div></div>;
}

function PolicyDialog({ type, onClose }: { type: "privacy" | "terms"; onClose: () => void }) {
  const privacy = type === "privacy";
  return <div className="dialog-backdrop policy-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="brand-dialog policy-dialog" role="dialog" aria-modal="true" aria-labelledby="policy-title"><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><h2 id="policy-title">{privacy ? "Privacy Notice" : "Terms of Use"}</h2><p className="policy-date">Effective July 29, 2026</p>{privacy ? <div className="policy-copy"><h3>What stays on your device</h3><p>Enrollment text, selected timetable photos, and PDFs are processed inside your browser. Parsed subjects, tasks, optional profile labels, and your consent record are stored locally in this browser. AnoSked currently has no accounts, creator-accessible database, advertising tracker, or analytics tracker.</p><h3>What is ignored</h3><p>Student numbers, fees, balances, and payment details are not intentionally saved. Original pasted text and selected files are discarded after processing; AnoSked stores only the schedule you confirm.</p><h3>Deletion and exports</h3><p>Clearing browser data or deleting the installed app can remove everything. Backup, image, wallpaper, and calendar files leave AnoSked only when you choose to export them; the destination app then applies its own privacy practices.</p></div> : <div className="policy-copy"><h3>Use of AnoSked</h3><p>AnoSked is a convenience tool for organizing class information. Check important dates, rooms, and schedule changes against your school’s official records.</p><h3>Your responsibility</h3><p>You are responsible for reviewing parsed information, maintaining backups, and deciding what to export. AnoSked is provided as-is and may not recognize every enrollment format.</p><h3>Independence</h3><p>AnoSked is not affiliated with, endorsed by, or an official service of any university.</p></div>}<button className="sky-button wide-dialog" onClick={onClose}>Close</button></div></div>;
}

function ConsentDialog({ onAccept, onPolicy }: { onAccept: () => void; onPolicy: (policy: "privacy" | "terms") => void }) {
  const [checked, setChecked] = useState(false);
  return <div className="dialog-backdrop consent-layer"><div className="brand-dialog consent-dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title"><img src="/assets/default.png" alt="" /><h2 id="consent-title">Before you continue</h2><p>AnoSked stores your schedule on this device. Please review how it works and agree before using this saved schedule.</p><label className="consent-row"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /><span>I agree to the <button type="button" onClick={() => onPolicy("terms")}>Terms</button> and acknowledge the <button type="button" onClick={() => onPolicy("privacy")}>Privacy Notice</button>.</span></label><button className="sky-button wide-dialog" disabled={!checked} onClick={onAccept}>Accept and continue</button></div></div>;
}
