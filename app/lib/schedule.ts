export type DayCode = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export type IconName = "today" | "calendar" | "tasks" | "subjects" | "settings" | "about" | "install" | "share" | "image" | "calendarAdd" | "jump" | "book" | "flask" | "key" | "cpu" | "balance" | "calculator" | "globe" | "backup" | "profile" | "trash" | "sound" | "edit" | "appearance";

export type Meeting = {
  days: DayCode[];
  start: string;
  end: string;
  room: string;
};

export type Subject = {
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

export type Task = {
  id: string;
  subjectId: string;
  title: string;
  dueAt: string;
  done: boolean;
};

export type Profile = {
  nickname: string;
  program: string;
  yearLevel: string;
};

export type SkedData = {
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

export type ParseIssue = {
  kind: "empty" | "fees-only" | "missing-table" | "empty-table" | "incomplete" | "timetable-grid" | "file";
  title: string;
  detail: string;
};

export type ParseResult = {
  semester: string;
  block: string;
  totalUnits: number;
  program: string;
  yearLevel: string;
  subjects: Subject[];
  warnings: string[];
};

export type View = "today" | "calendar" | "tasks" | "subjects" | "settings" | "about";

export const COLORS = ["#2F8FC4", "#5279C8", "#2D9A93", "#7B73C9", "#B86B5E", "#A8628E", "#4F8668"];
export const DAY_META: Array<{ code: DayCode; short: string; label: string; js: number }> = [
  { code: "MO", short: "Mon", label: "Monday", js: 1 },
  { code: "TU", short: "Tue", label: "Tuesday", js: 2 },
  { code: "WE", short: "Wed", label: "Wednesday", js: 3 },
  { code: "TH", short: "Thu", label: "Thursday", js: 4 },
  { code: "FR", short: "Fri", label: "Friday", js: 5 },
  { code: "SA", short: "Sat", label: "Saturday", js: 6 },
  { code: "SU", short: "Sun", label: "Sunday", js: 0 },
];

export const TIMETABLE_GRID_DETAIL = "This looks like text copied from a timetable image or PDF. Its rows and columns were lost, so AnoSked can’t safely match subjects with their times and rooms. Upload the original timetable when supported, paste a line-by-line subject list, or add each class manually.";

const ICON_NAMES = new Set<IconName>(["today", "calendar", "tasks", "subjects", "settings", "about", "install", "share", "image", "calendarAdd", "jump", "book", "flask", "key", "cpu", "balance", "calculator", "globe", "backup", "profile", "trash", "sound", "edit", "appearance"]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isShortString(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.length <= max;
}

export function isValidStoredData(value: unknown): value is SkedData {
  if (!isRecord(value) || !Array.isArray(value.subjects) || !Array.isArray(value.tasks) || !isRecord(value.profile)) return false;
  if (value.subjects.length > 100 || value.tasks.length > 2000) return false;
  if (![value.semester, value.block, value.termStart, value.termEnd, value.createdAt].every((item) => isShortString(item))) return false;
  if (typeof value.totalUnits !== "number" || !Number.isFinite(value.totalUnits) || value.totalUnits < 0 || value.totalUnits > 200) return false;
  if (![value.profile.nickname, value.profile.program, value.profile.yearLevel].every((item) => isShortString(item))) return false;
  if (value.exportTitle !== undefined && !isShortString(value.exportTitle, 120)) return false;
  if (value.soundEffects !== undefined && typeof value.soundEffects !== "boolean") return false;
  if (value.tourCompleted !== undefined && typeof value.tourCompleted !== "boolean") return false;
  if (value.consent !== undefined && (!isRecord(value.consent) || !isShortString(value.consent.acceptedAt, 40) || !isShortString(value.consent.version, 40))) return false;

  const validDays = new Set(DAY_META.map((day) => day.code));
  const subjectIds = new Set<string>();
  const validSubjects = value.subjects.every((subject) => {
    if (!isRecord(subject) || !isRecord(subject.meeting)) return false;
    if (!isShortString(subject.id, 100) || !subject.id || subjectIds.has(subject.id)) return false;
    subjectIds.add(subject.id);
    const meetings = Array.isArray(subject.meetings) && subject.meetings.length ? subject.meetings : [subject.meeting];
    const validMeetings = meetings.length <= 14 && meetings.every((meeting) => isRecord(meeting) && Array.isArray(meeting.days) && meeting.days.length > 0
      && meeting.days.length <= 7 && new Set(meeting.days).size === meeting.days.length
      && meeting.days.every((day) => typeof day === "string" && validDays.has(day as DayCode))
      && isShortString(meeting.start, 5) && TIME_PATTERN.test(meeting.start) && isShortString(meeting.end, 5)
      && TIME_PATTERN.test(meeting.end) && meeting.end > meeting.start && isShortString(meeting.room, 150));
    const iconValid = subject.icon === undefined || (typeof subject.icon === "string" && ICON_NAMES.has(subject.icon as IconName));
    return isShortString(subject.code, 50) && Boolean(subject.code.trim()) && isShortString(subject.title, 300) && Boolean(subject.title.trim())
      && isShortString(subject.color, 30) && iconValid && typeof subject.units === "number" && Number.isFinite(subject.units)
      && subject.units >= 0 && subject.units <= 20 && validMeetings;
  });
  if (!validSubjects) return false;

  const taskIds = new Set<string>();
  return value.tasks.every((task) => {
    if (!isRecord(task) || !isShortString(task.id, 100) || !task.id || taskIds.has(task.id)) return false;
    taskIds.add(task.id);
    return isShortString(task.subjectId, 100) && subjectIds.has(task.subjectId) && isShortString(task.title, 500)
      && Boolean(task.title.trim()) && isShortString(task.dueAt, 40) && !Number.isNaN(new Date(task.dueAt).getTime())
      && typeof task.done === "boolean";
  });
}

export function decodeDays(raw: string): DayCode[] {
  const normalized = raw.trim().replace(/[\s,/&\-]/g, "");
  const tokens: Array<[string, DayCode]> = [
    ["Thursday", "TH"], ["Wednesday", "WE"], ["Tuesday", "TU"], ["Monday", "MO"],
    ["Friday", "FR"], ["Saturday", "SA"], ["Sunday", "SU"], ["Thu", "TH"], ["Th", "TH"],
    ["Wed", "WE"], ["Tue", "TU"], ["Mon", "MO"], ["Fri", "FR"], ["Sat", "SA"], ["Sun", "SU"],
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

export function looksLikeTimetableGrid(text: string) {
  const dayCount = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].filter((day) => new RegExp(`\\b${day}\\b`, "i").test(text)).length;
  const timeCount = text.match(/\b\d{1,2}(?::|\.)\d{2}\s*(?:AM|PM)\b/gi)?.length || 0;
  return dayCount >= 3 && (timeCount >= 4 || /\b(?:class schedule|timetable|time)\b/i.test(text));
}

export function subjectMeetings(subject: Subject) {
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

export function flexibleTimeRange(startRaw: string, endRaw: string) {
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
  if (startPart.suffix) start = toMinutes(startPart);
  else if (endPart.suffix) {
    const amCandidate = toMinutes(startPart, "am");
    const pmCandidate = toMinutes(startPart, "pm");
    start = pmCandidate < end && end - pmCandidate <= 6 * 60 ? pmCandidate : amCandidate;
  } else start = toMinutes(startPart, startPart.hour === 12 ? "pm" : "am");
  if (end <= start) end += 12 * 60;
  if (start < 0 || end > 24 * 60 || end - start < 15 || end - start > 12 * 60) return null;
  const format = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { start: format(start), end: format(end) };
}

export function parseFlexibleMeeting(line: string): Meeting | null {
  const match = line.trim().match(/^([A-Za-z/&]+)\s*(?:-|:)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)(?:\s+(?:(?:room|rm)\s*[:#-]?\s*)?(.+))?$/i);
  if (!match) return null;
  const days = decodeDays(match[1]);
  const times = flexibleTimeRange(match[2], match[3]);
  if (!days.length || !times) return null;
  const roomMatch = (match[4] || "").match(/^(?:(?:room|rm)\s*[:#-]?\s*)?(.+)$/i);
  return { days, ...times, room: roomMatch?.[1]?.trim() || "TBA" };
}

function fixedWidthTimeRange(raw: string) {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  const endHour = Number(match[3]);
  const endMinute = Number(match[4]);
  if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return null;
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  if (endTotal <= startTotal || endTotal - startTotal > 12 * 60) return null;
  return {
    start: `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}`,
    end: `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`,
  };
}

function parseEnrollmentScheduleLine(line: string) {
  const match = line.trim().match(/^([A-Za-z]+)\s+(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})(?:\s+(.+))?$/);
  if (!match) return null;
  const days = decodeDays(match[1]);
  const times = fixedWidthTimeRange(`${match[2]}-${match[3]}`);
  if (!days.length || !times) return null;
  const trailing = (match[4] || "").trim().split(/\s+/).filter(Boolean);
  const hasUnits = trailing.length > 0 && /^\d+(?:\.\d+)?$/.test(trailing.at(-1) || "");
  const units = hasUnits ? Number(trailing.pop()) : 0;
  return { meeting: { days, ...times, room: trailing.join(" ") || "TBA" }, units };
}

const ENROLLMENT_SUBJECT_HEADER = /(?:^|\s)((?:\d{4,}\s+)*)([A-Z][A-Z0-9_-]*(?:\s+[A-Z0-9_-]+){0,2})\s*:\s*(.+)$/i;

function matchEnrollmentSubjectHeader(line: string) {
  const match = line.trim().match(ENROLLMENT_SUBJECT_HEADER);
  if (!match || !/\d/.test(match[2])) return null;
  return {
    sectionIds: match[1].trim().split(/\s+/).filter((value) => /^\d{4,}$/.test(value)),
    code: match[2].trim().replace(/^([A-Z]{2,})\s+(?=\d)/i, "$1").toUpperCase(),
    title: match[3].trim(),
  };
}

function findEnrollmentTerm(lines: string[]) {
  for (const line of lines) {
    const match = line.match(/((?:\d+(?:st|nd|rd|th)\s+(?:Semester|Term)|Mid[-\s]?year\s+Term|Summer\s+Term)\s+\d{4}\s*[-–]\s*\d{4})/i);
    if (match) return match[1].replace(/(\d{4})\s*[-–]\s*(\d{4})/, "$1-$2");
  }
  return "";
}

function parseEnrollmentSubjectRows(lines: string[], start: number, end: number) {
  const subjects: Subject[] = [];
  const warnings: string[] = [];
  const pendingSectionIds: string[] = [];
  for (let index = start; index < end; index += 1) {
    if (/^(?:\d{4,}\s+)+\d{4,}$/.test(lines[index])) {
      pendingSectionIds.push(...lines[index].split(/\s+/));
      continue;
    }
    let sectionId = "";
    let headerLine = lines[index];
    if (/^\d{4,}$/.test(headerLine) && matchEnrollmentSubjectHeader(lines[index + 1] || "")) {
      sectionId = headerLine;
      index += 1;
      headerLine = lines[index];
    }
    const header = matchEnrollmentSubjectHeader(headerLine);
    if (!header) continue;
    if (header.sectionIds.length > 1) pendingSectionIds.push(...header.sectionIds);
    else if (header.sectionIds.length === 1) sectionId ||= header.sectionIds[0];
    sectionId ||= pendingSectionIds.shift() || "";
    const titleParts = [header.title];
    let cursor = index + 1;
    let schedule: ReturnType<typeof parseEnrollmentScheduleLine> = null;
    while (cursor < end && cursor <= index + 4) {
      schedule = parseEnrollmentScheduleLine(lines[cursor]);
      if (schedule) break;
      if (matchEnrollmentSubjectHeader(lines[cursor]) || /^\d{4,}$/.test(lines[cursor])) break;
      titleParts.push(lines[cursor].trim());
      cursor += 1;
    }
    if (!schedule) continue;
    let units = schedule.units;
    let consumedThrough = cursor;
    if (!units && /^\d+(?:\.\d+)?$/.test(lines[cursor + 1] || "")) {
      units = Number(lines[cursor + 1]);
      consumedThrough = cursor + 1;
    }
    const fullTitle = titleParts.join(" ").replace(/\s+/g, " ").trim();
    const internalId = fullTitle.match(/\s*\((\d+)\)\s*$/)?.[1];
    const title = fullTitle.replace(/\s*\(\d+\)\s*$/, "").trim();
    if (!units) warnings.push(`${header.code} has no units listed and was saved as 0.`);
    subjects.push({
      id: uid("sub"), sectionId: sectionId || undefined, internalId,
      code: header.code, title, units,
      color: COLORS[subjects.length % COLORS.length], meeting: schedule.meeting,
    });
    index = consumedThrough;
  }
  return { subjects, warnings };
}

export function parseFixedWidthSubjectTable(lines: string[]): ParseResult | null {
  const subjects: Subject[] = [];
  for (const line of lines) {
    const columns = line.trim().split(/(?:\t+|\s{2,})/).map((column) => column.trim()).filter(Boolean);
    if (columns.length < 5) continue;
    const [code, title, rawDays, rawTime] = columns;
    if (!/^[A-Z][A-Z0-9_]*(?:\s+[A-Z0-9_]+){0,3}$/i.test(code) || /^code$/i.test(code)) continue;
    const days = decodeDays(rawDays);
    const times = fixedWidthTimeRange(rawTime);
    if (!days.length || !times || !title) continue;
    const trailing = columns.slice(4);
    const hasUnits = trailing.length > 1 && /^\d+(?:\.\d+)?$/.test(trailing.at(-1) || "");
    const units = hasUnits ? Number(trailing.pop()) : 0;
    const room = trailing.join(" ").trim() || "TBA";
    subjects.push({
      id: uid("sub"), code: code.toUpperCase(), title: title.replace(/\s+/g, " ").trim(), units,
      color: COLORS[subjects.length % COLORS.length], meeting: { days, ...times, room },
    });
  }
  if (!subjects.length) return null;
  const semester = lines.find((line) => /(?:semester|term).*\d{4}\s*[-–]\s*\d{4}/i.test(line)) || "";
  const block = lines.find((line) => /^block\s*no\.?\s*:/i.test(line))?.split(":").slice(1).join(":").trim()
    || lines.find((line) => /^section\s*:/i.test(line))?.split(":").slice(1).join(":").trim() || "";
  const declaredUnits = Number(lines.find((line) => /^total\s+units\s*:/i.test(line))?.match(/([\d.]+)\s*$/)?.[1] || 0);
  const parsedUnits = subjects.reduce((sum, subject) => sum + subject.units, 0);
  const warnings: string[] = [];
  if (subjects.some((subject) => subject.units === 0)) warnings.push("Per-subject units were not listed and were saved as 0. Your classes and meeting times are ready to review.");
  if (!semester) warnings.push("The semester label was not found. You can add it before saving.");
  return { semester, block, totalUnits: declaredUnits || parsedUnits, program: "", yearLevel: "", subjects, warnings };
}

function generatedSubjectCode(title: string, index: number) {
  const tokens = title.toUpperCase().match(/[A-Z]+|\d+/g) || [];
  const code = tokens.map((token) => /^\d+$/.test(token) || token.length <= 2 ? token : token[0]).join("").slice(0, 12);
  return code || `CLASS${index + 1}`;
}

export function parseGroupedDaySchedule(lines: string[]): ParseResult | null {
  const subjects: Subject[] = [];
  let currentDays: DayCode[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "").trim();
    if (heading && /^[A-Za-z\s&,/-]+$/.test(heading)) {
      const decoded = decodeDays(heading);
      if (decoded.length) {
        currentDays = decoded;
        continue;
      }
    }
    if (!currentDays.length) continue;
    const match = line.match(/^[•●▪]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*\|\s*(.+)$/i);
    if (!match) continue;
    const times = flexibleTimeRange(match[1], match[2]);
    if (!times) continue;
    const detail = match[3].trim();
    const roomMatch = detail.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
    const title = (roomMatch?.[1] || detail).trim();
    const room = roomMatch?.[2]?.trim() || "TBA";
    subjects.push({
      id: uid("sub"), code: generatedSubjectCode(title, subjects.length), title, units: 0,
      color: COLORS[subjects.length % COLORS.length], meeting: { days: [...currentDays], ...times, room },
    });
  }
  if (!subjects.length) return null;
  const semesterSource = lines.find((line) => /(?:semester|\bsem\b)/i.test(line)) || "";
  const semester = semesterSource.match(/\d+(?:st|nd|rd|th)\s+(?:semester|sem)\b/i)?.[0] || "";
  return {
    semester, block: "", totalUnits: 0, program: "", yearLevel: "", subjects,
    warnings: ["Subject codes and units were not included. AnoSked created short editable codes and saved units as 0. Review them before saving."],
  };
}

export function parseFlexibleSubjectList(lines: string[]): ParseResult | null {
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
      id: uid("sub"), code: code.toUpperCase(), title, units: 0,
      color: COLORS[subjects.length % COLORS.length], meeting: meetings[0], meetings,
    });
    index = cursor - 1;
  }
  if (!subjects.length) return null;
  const semester = lines.find((line) => /(?:semester|term).*\d{4}\s*[-–]\s*\d{4}/i.test(line)) || "";
  const block = lines.find((line) => /^(?:section|block)\s*:/i.test(line))?.split(":").slice(1).join(":").trim() || "";
  return { semester, block, totalUnits: 0, program: "", yearLevel: "", subjects, warnings: ["Units were not included in this schedule and were saved as 0. Review every class before saving."] };
}

export function parseEnrollment(text: string): { result?: ParseResult; issue?: ParseIssue } {
  const cleaned = text.replace(/\r/g, "").replace(/\u00a0/g, " ").trim();
  if (!cleaned) return { issue: { kind: "empty", title: "Nothing was pasted", detail: "Copy the Enrolled Subjects section from your Subject Enlistment page, then paste it here." } };

  const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
  const lower = cleaned.toLowerCase();
  const blockIndex = lines.findIndex((line) => /^Block\s*No\.?\s*:/i.test(line));
  const totalIndex = lines.findIndex((line, index) => index > Math.max(blockIndex, -1) && /^Total\s+Units\s*:/i.test(line));
  const assessmentIndex = lines.findIndex((line, index) => index > Math.max(blockIndex, -1) && /^Assessment\s+of\s+Fees/i.test(line));
  const firstSubjectIndex = lines.findIndex((line) => Boolean(matchEnrollmentSubjectHeader(line)));

  if (firstSubjectIndex >= 0) {
    const enrolledHeadingIndex = lines.reduce((last, line, index) => index < firstSubjectIndex && /^Enrolled\s+Subjects$/i.test(line) ? index : last, -1);
    const tableStart = blockIndex >= 0 ? blockIndex + 1 : enrolledHeadingIndex >= 0 ? enrolledHeadingIndex + 1 : Math.max(0, firstSubjectIndex - 1);
    const tableEnd = [totalIndex, assessmentIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? lines.length;
    const enrolled = parseEnrollmentSubjectRows(lines, tableStart, tableEnd);
    if (enrolled.subjects.length) {
      const semester = findEnrollmentTerm(lines);
      const yearLevelIndex = lines.findIndex((line) => /(?:First|Second|Third|Fourth|Fifth)\s+Year/i.test(line));
      const yearLevelLine = yearLevelIndex >= 0 ? lines[yearLevelIndex] : "";
      const yearLevel = yearLevelLine.match(/(?:First|Second|Third|Fourth|Fifth)\s+Year/i)?.[0] || "";
      const programIndex = lines.findIndex((line) => /^(?:DUAL\s+DEGREE|B\.?S\.?|B\.?A\.?|Bachelor|Master)/i.test(line));
      const programEnd = programIndex >= 0 && yearLevelIndex > programIndex ? yearLevelIndex : programIndex + 1;
      const program = programIndex >= 0 ? lines.slice(programIndex, programEnd).join(" ").replace(/\s+(?:First|Second|Third|Fourth|Fifth)\s+Year\b.*$/i, "").replace(/\s+/g, " ").trim() : "";
      const block = blockIndex >= 0 ? lines[blockIndex].split(":").slice(1).join(":").trim() : "";
      const declaredUnits = totalIndex >= 0 ? Number(lines[totalIndex].match(/([\d.]+)\s*$/)?.[1] || 0) : 0;
      const parsedUnits = enrolled.subjects.reduce((sum, subject) => sum + subject.units, 0);
      if (declaredUnits && parsedUnits !== declaredUnits) enrolled.warnings.push(`The subjects add up to ${parsedUnits} units, but the page says ${declaredUnits}. Review the list before saving.`);
      if (!semester) enrolled.warnings.push("The semester label was not found. You can add it before saving.");
      return { result: { semester, block, totalUnits: declaredUnits || parsedUnits, program, yearLevel, subjects: enrolled.subjects, warnings: enrolled.warnings } };
    }
  }

  if (firstSubjectIndex < 0) {
    const groupedDayResult = parseGroupedDaySchedule(lines);
    if (groupedDayResult) return { result: groupedDayResult };
    const fixedWidthResult = parseFixedWidthSubjectTable(lines);
    if (fixedWidthResult) return { result: fixedWidthResult };
    const flexibleResult = parseFlexibleSubjectList(lines);
    if (flexibleResult) return { result: flexibleResult };
    if (looksLikeTimetableGrid(cleaned)) return { issue: { kind: "timetable-grid", title: "This timetable needs its original layout", detail: TIMETABLE_GRID_DETAIL } };
    if (/assessment of fees|tuition fee|total due|schedule of payment/i.test(lower)) return { issue: { kind: "fees-only", title: "This is the fees section", detail: "Copy the enrolled-subjects table instead. It should contain subject codes followed by class days, time, and room." } };
    return { issue: { kind: "missing-table", title: "No class schedule was found", detail: "Paste the part that lists each subject code, class days, start and end time, room, and units." } };
  }

  const semester = findEnrollmentTerm(lines);
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
    const schedule = scheduleLine.match(/^([A-Za-z]+)\s+(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})(?:\s+(.+))?$/);
    const days = schedule ? decodeDays(schedule[1]) : [];
    const units = /^\d+(?:\.\d+)?$/.test(unitsLine) ? Number(unitsLine) : 0;
    if (!schedule || !days.length || !units) {
      warnings.push(`${match[1].replace(/\s/g, "")} needs its days, time, or units checked.`);
      continue;
    }
    subjects.push({
      id: uid("sub"), sectionId, internalId: match[3], code: match[1].replace(/\s/g, "").toUpperCase(),
      title: match[2].replace(/\s+/g, " ").trim(), units, color: COLORS[subjects.length % COLORS.length],
      meeting: { days, start: schedule[2], end: schedule[3], room: (schedule[4] || "TBA").trim() },
    });
    index += 3;
  }

  if (!subjects.length) {
    const groupedDayResult = parseGroupedDaySchedule(lines);
    if (groupedDayResult) return { result: groupedDayResult };
    const fixedWidthResult = parseFixedWidthSubjectTable(lines);
    if (fixedWidthResult) return { result: fixedWidthResult };
    const flexibleResult = parseFlexibleSubjectList(lines);
    if (flexibleResult) return { result: flexibleResult };
    if (looksLikeTimetableGrid(cleaned)) return { issue: { kind: "timetable-grid", title: "This timetable needs its original layout", detail: TIMETABLE_GRID_DETAIL } };
    return { issue: { kind: "empty-table", title: "We found the table, but no complete subjects", detail: "Make sure each subject includes its code, class days, start and end time, room, and units." } };
  }

  const parsedUnits = subjects.reduce((sum, subject) => sum + subject.units, 0);
  if (declaredUnits && parsedUnits !== declaredUnits) warnings.push(`The subjects add up to ${parsedUnits} units, but the page says ${declaredUnits}. Review the list before saving.`);
  if (!semester) warnings.push("The semester label was not found. You can add it before saving.");
  return { result: { semester, block, totalUnits: declaredUnits || parsedUnits, program, yearLevel, subjects, warnings } };
}

export function formatTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function compactTitle(title: string, max = 42) {
  const clean = title.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function getSelectedDay(date: Date): DayCode {
  return DAY_META.find((day) => day.js === date.getDay())?.code || "MO";
}

export function nextClassDate(subject: Subject, after = new Date()) {
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

export function escapeICS(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

export function subjectIcon(subject: Subject): IconName {
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

export function buildICS(data: SkedData, generatedAt = new Date()) {
  const until = data.termEnd.replace(/-/g, "") + "T235959";
  const stamp = generatedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
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
    return [
      "BEGIN:VEVENT",
      `UID:${subject.id}-${meetingIndex}@anosked.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${compact}T${meeting.start.replace(":", "")}00`,
      `DTEND:${compact}T${meeting.end.replace(":", "")}00`,
      `RRULE:FREQ=WEEKLY;BYDAY=${meeting.days.join(",")};UNTIL=${until}`,
      `SUMMARY:${escapeICS(`${subject.title} · ${subject.code}`)}`,
      `LOCATION:${escapeICS(meeting.room)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15M", `DESCRIPTION:${escapeICS(`${subject.code} starts in 15 minutes`)}`, "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
  })).filter(Boolean).join("\r\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AnoSked//Local Student Calendar//EN", "CALSCALE:GREGORIAN", events, "END:VCALENDAR"].join("\r\n");
}
