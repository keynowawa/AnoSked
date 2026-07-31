/* eslint-disable @next/next/no-img-element */
"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AccessibleDialog } from "./components/AccessibleDialog";
import { Icon } from "./components/Icon";
import { ColorPicker, DayStrip, EmptyState, IconPicker, ReviewDaysDialog, ReviewTimeSelect, WeeklyTimetable } from "./components/SchedulePieces";
import { extractScheduleFile } from "./lib/importScheduleFile";
import { renderScheduleCanvas, SCHEDULE_IMAGE_THEMES, type ScheduleImageMode, type ScheduleImageTheme } from "./lib/scheduleImage";
import {
  buildICS, COLORS, compactTitle, dateKey, DAY_META, formatTime, getSelectedDay,
  isRecord, isValidStoredData, nextClassDate, parseEnrollment, subjectIcon,
  subjectMeetings, uid,
  type DayCode, type IconName, type Meeting, type ParseIssue, type ParseResult,
  type Profile, type SkedData, type Subject, type Task, type View,
} from "./lib/schedule";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const STORAGE_KEY = "anosked.local.v1";
const APPEARANCE_KEY = "anosked.appearance.v1";
const SHARE_URL = "https://anosked.site";
const SHARE_MESSAGE = `Meet AnoSked? 📅

Paste your enrolled subjects and turn them into a clear daily timeline and weekly schedule in seconds. Save your timetable as a phone wallpaper, add tasks under each subject, and install AnoSked? on your Home Screen for quick access.

No account needed. Your schedule stays on your device.

Your classes, rooms, and deadlines, all one tap away.`;
const MASCOT_ASSETS = ["/assets/default.webp", "/assets/thinking.webp", "/assets/studying.webp", "/assets/checklist.webp", "/assets/noclass.webp"];
const PRIMARY_NAV: Array<{ key: View; label: string; icon: IconName }> = [
  { key: "today", label: "Today", icon: "today" },
  { key: "calendar", label: "Calendar", icon: "calendar" },
  { key: "tasks", label: "Tasks", icon: "tasks" },
  { key: "subjects", label: "Subjects", icon: "subjects" },
];

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

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatTermDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
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
  if ("vibrate" in navigator) navigator.vibrate(kind === "complete" ? [22, 35, 28] : kind === "delete" ? [32, 38, 20] : 24);
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
    gain.gain.exponentialRampToValueAtTime(0.085, start + .018);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    shimmerGain.gain.setValueAtTime(0.0001, start);
    shimmerGain.gain.exponentialRampToValueAtTime(0.014, start + .014);
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
  const [reviewDayPicker, setReviewDayPicker] = useState<{ subjectId: string; meetingIndex: number } | null>(null);
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
  const [appearance, setAppearance] = useState<"system" | "light" | "dark">("system");
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
        const savedAppearance = localStorage.getItem(APPEARANCE_KEY);
        if (savedAppearance === "system" || savedAppearance === "light" || savedAppearance === "dark") setAppearance(savedAppearance);
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
    if (!hydrated) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyAppearance = () => {
      const resolved = appearance === "system" ? (media.matches ? "dark" : "light") : appearance;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", resolved === "dark" ? "#10191E" : "#89D0EF"));
    };
    applyAppearance();
    localStorage.setItem(APPEARANCE_KEY, appearance);
    if (appearance !== "system") return;
    media.addEventListener("change", applyAppearance);
    return () => media.removeEventListener("change", applyAppearance);
  }, [appearance, hydrated]);

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
  const selectedWeekStart = new Date(selectedDate);
  selectedWeekStart.setHours(0, 0, 0, 0);
  selectedWeekStart.setDate(selectedWeekStart.getDate() - ((selectedWeekStart.getDay() + 6) % 7));
  const selectedWeekEnd = new Date(selectedWeekStart);
  selectedWeekEnd.setDate(selectedWeekEnd.getDate() + 6);
  const currentWeekStart = new Date(clock);
  currentWeekStart.setHours(0, 0, 0, 0);
  currentWeekStart.setDate(currentWeekStart.getDate() - ((currentWeekStart.getDay() + 6) % 7));
  const selectedWeekIsCurrent = dateKey(selectedWeekStart) === dateKey(currentWeekStart);
  const selectedWeekTasks = openTasks.filter((task) => {
    const dueKey = task.dueAt.slice(0, 10);
    return dueKey >= dateKey(selectedWeekStart) && dueKey <= dateKey(selectedWeekEnd);
  });
  const dashboardTasks = (selectedWeekIsCurrent
    ? [...overdueTasks, ...selectedWeekTasks.filter((task) => !overdueTasks.some((overdue) => overdue.id === task.id))]
    : selectedWeekTasks
  ).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const weekRangeLabel = selectedWeekStart.getMonth() === selectedWeekEnd.getMonth()
    ? `${selectedWeekStart.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}–${selectedWeekEnd.getDate()}`
    : `${selectedWeekStart.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}–${selectedWeekEnd.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`;
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

  function toggleParsedMeetingDay(id: string, meetingIndex: number, day: DayCode) {
    if (!parsed) return;
    const subject = parsed.subjects.find((item) => item.id === id);
    const meeting = subject ? subjectMeetings(subject)[meetingIndex] : undefined;
    if (!meeting) return;
    if (meeting.days.includes(day) && meeting.days.length === 1) {
      setNotice("Keep at least one class day selected.");
      return;
    }
    const days = meeting.days.includes(day) ? meeting.days.filter((item) => item !== day) : [...meeting.days, day];
    days.sort((a, b) => DAY_META.findIndex((item) => item.code === a) - DAY_META.findIndex((item) => item.code === b));
    setParsed({ ...parsed, subjects: parsed.subjects.map((item) => {
      if (item.id !== id) return item;
      const meetings = subjectMeetings(item).map((current, index) => index === meetingIndex ? { ...current, days } : current);
      return { ...item, meeting: meetings[0], meetings };
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
    const ics = buildICS(data);
    const filename = `AnoSked-${data.semester.replace(/\s+/g, "-")}.ics`;
    const result = await shareOrDownload(new Blob([ics], { type: "text/calendar;charset=utf-8" }), filename, "Add AnoSked? to your calendar");
    if (result !== "cancelled") {
      if (data.soundEffects !== false) playFeedbackTone();
      setNotice(result === "shared" ? "Choose Calendar from your device’s sharing menu." : "Calendar file downloaded.");
    }
  }

  function exportScheduleImage(mode: ScheduleImageMode, theme: ScheduleImageTheme, action: "save" | "share" = "save") {
    if (!data) return;
    const canvas = renderScheduleCanvas(data, mode, theme);
    const filename = `AnoSked-${mode}-${theme}-${dateKey(new Date())}.png`;
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

  if (!hydrated) return <main className="loading-screen" aria-live="polite"><img className="brand-mark" src="/assets/AnoSkedicon.png" alt="" /><p>Preparing AnoSked…</p></main>;

  if (!data) {
    return (
      <main className="onboarding-shell">
        <a className="skip-link" href="#import">Skip to schedule setup</a>
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
                {parsed.warnings.map((warning) => <div className="warning-strip" role="status" key={warning}>{warning}</div>)}
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
                          <div className="inline-fields"><label className="subject-code-input">Subject code<span><input value={subject.code} onChange={(e) => updateParsedSubject(subject.id, "code", e.target.value)} aria-label="Subject code" /><i style={{ background: subject.color }} /></span></label><label>Subject name<input value={subject.title} onChange={(e) => updateParsedSubject(subject.id, "title", e.target.value)} aria-label="Subject name" /></label></div>
                          <div className="review-meetings">{subjectMeetings(subject).map((meeting, meetingIndex) => <div className="schedule-edit" key={`${meeting.days.join("")}-${meeting.start}-${meetingIndex}`}><div className="meeting-day-field"><span>Days</span><button type="button" className="meeting-days-button" onClick={() => setReviewDayPicker({ subjectId: subject.id, meetingIndex })} aria-label={`Edit class days for ${subject.code}`}><strong>{meeting.days.map((day) => DAY_META.find((item) => item.code === day)?.short).join(" · ")}</strong><i aria-hidden="true" /></button></div><div className="meeting-time-range"><ReviewTimeSelect label="Starts" value={meeting.start} onChange={(value) => updateParsedMeeting(subject.id, meetingIndex, "start", value)} /><ReviewTimeSelect label="Ends" value={meeting.end} onChange={(value) => updateParsedMeeting(subject.id, meetingIndex, "end", value)} /></div><label className="meeting-room-field">Room<input value={meeting.room} onChange={(e) => updateParsedMeeting(subject.id, meetingIndex, "room", e.target.value)} aria-label={`Class time ${meetingIndex + 1} room`} /></label></div>)}</div>
                          <details className="review-customize"><summary><span>Icon and color</span><span className="review-look-preview"><Icon name={subject.icon || subjectIcon(subject)} size={14} /><i style={{ background: subject.color }} /><b>›</b></span></summary><div className="review-customize-panel"><IconPicker value={subject.icon || subjectIcon(subject)} onChange={(icon) => updateParsedSubjectIcon(subject.id, icon)} compact /><ColorPicker value={subject.color} onChange={(color) => updateParsedSubjectColor(subject.id, color)} /></div></details>
                        </div>}
                      </article>
                    );
                  })}
                </div>
                <div className="review-section">
                  <h3>Confirm the semester</h3><p>Add anything the imported schedule did not include.</p>
                  <div className="term-fields single-field"><label>Term or semester<input value={parsed.semester} onChange={(event) => setParsed({ ...parsed, semester: event.target.value })} placeholder="e.g. 1st Term 2026–2027" /></label></div>
                  <div className="date-fields"><label>Classes start<span className="date-input-shell"><input type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} /><i aria-hidden="true" /></span></label><label>Classes end<span className="date-input-shell"><input type="date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} /><i aria-hidden="true" /></span></label></div>
                </div>
                <details className="optional-profile">
                  <summary><span><Icon name="settings" size={15} /> Optional details</span><b>›</b></summary>
                  <div className="profile-fields"><label>Section or block<input value={parsed.block} onChange={(event) => setParsed({ ...parsed, block: event.target.value })} placeholder="e.g. 4CSD" /></label><label>Name or nickname<input value={profile.nickname} onChange={(e) => setProfile({ ...profile, nickname: e.target.value })} placeholder="Optional" /></label><label>Program<input value={profile.program} onChange={(e) => setProfile({ ...profile, program: e.target.value })} placeholder="Optional" /></label><label>Year level<input value={profile.yearLevel} onChange={(e) => setProfile({ ...profile, yearLevel: e.target.value })} placeholder="Optional" /></label></div>
                </details>
                <div className="review-save-dock"><label className="consent-row"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /><span>I agree to the <button type="button" onClick={() => setPolicy("terms")}>Terms</button> and acknowledge the <button type="button" onClick={() => setPolicy("privacy")}>Privacy Notice</button>.</span></label><button className="primary-button" disabled={!parsed.subjects.length || !acceptedTerms} onClick={saveSchedule}>Save schedule</button></div>
              </>
            ) : null}
          </div>
        </section>
        <footer className="public-footer"><span>© 2026 AnoSked? · Created by mmmkay studios</span><nav><button onClick={() => setPolicy("privacy")}>Privacy</button><button onClick={() => setPolicy("terms")}>Terms</button><button onClick={() => setShowInstallGuide(true)}>Install help</button></nav></footer>
        {showInstallGuide && <InstallDialog onClose={() => setShowInstallGuide(false)} />}
        {showSubjectForm && <SubjectDialog onClose={() => setShowSubjectForm(false)} onSave={addParsedSubject} color={COLORS[(parsed?.subjects.length || 0) % COLORS.length]} />}
        {reviewDayPicker && parsed && (() => {
          const subject = parsed.subjects.find((item) => item.id === reviewDayPicker.subjectId);
          const meeting = subject ? subjectMeetings(subject)[reviewDayPicker.meetingIndex] : undefined;
          return meeting ? <ReviewDaysDialog days={meeting.days} onToggle={(day) => toggleParsedMeetingDay(reviewDayPicker.subjectId, reviewDayPicker.meetingIndex, day)} onClose={() => setReviewDayPicker(null)} /> : null;
        })()}
        {policy && <PolicyDialog type={policy} onClose={() => setPolicy(null)} />}
        {notice && <BrandedToast message={notice} />}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar">
        <div className="wordmark app-wordmark"><img className="brand-mark small" src="/assets/default.webp" alt="" />AnoSked?</div>
        <nav aria-label="Primary navigation">
          {PRIMARY_NAV.map(({ key, label, icon }) => (
            <button key={key} className={view === key ? "active" : ""} aria-current={view === key ? "page" : undefined} onClick={() => setView(key)}><Icon name={icon} /><span>{label}</span>{key === "tasks" && data.tasks.filter((task) => !task.done).length > 0 ? <b aria-label={`${data.tasks.filter((task) => !task.done).length} open tasks`}>{data.tasks.filter((task) => !task.done).length}</b> : null}</button>
          ))}
        </nav>
        <div className="sidebar-secondary"><button className={view === "settings" ? "active" : ""} aria-current={view === "settings" ? "page" : undefined} onClick={() => setView("settings")}><Icon name="settings" /><span>Settings</span></button><button className={view === "about" ? "active" : ""} aria-current={view === "about" ? "page" : undefined} onClick={() => setView("about")}><Icon name="about" /><span>About</span></button></div>
      </aside>

      <section className="app-main" id="main-content" tabIndex={-1}>
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
                <div className="side-card"><div className="section-heading"><h2>{selectedWeekIsCurrent ? "Due this week" : `Due ${weekRangeLabel}`}</h2><button onClick={() => setView("tasks")}>View all</button></div>{dashboardTasks.length ? dashboardTasks.map((task) => { const subject = data.subjects.find((item) => item.id === task.subjectId); const overdue = !task.done && new Date(task.dueAt).getTime() < clock.getTime(); return <button className={`side-task ${task.done ? "done" : ""} ${overdue ? "overdue" : ""}`} key={task.id} onClick={() => toggleTask(task.id)}><span>{task.done ? "✓" : ""}</span><div><strong>{task.title}</strong><p>{overdue ? "Overdue · " : ""}{subject?.title} · {new Date(task.dueAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div></button>; }) : <EmptyState title="All clear" detail={selectedWeekIsCurrent ? "No open tasks are due this week." : `No open tasks are due ${weekRangeLabel}.`} />}</div>
              </aside>
            </div>
          </div>
        )}

        {view === "calendar" && (
          <div className="page calendar-page">
            <div className="calendar-toolbar">
              <div><h1>Calendar</h1><p>See one day up close or your whole week at once.</p></div>
              <div className="calendar-actions">
                <div className="view-switch" role="group" aria-label="Calendar view">
                  <button className={calendarMode === "day" ? "active" : ""} aria-pressed={calendarMode === "day"} onClick={() => setCalendarMode("day")}>Day</button>
                  <button className={calendarMode === "week" ? "active" : ""} aria-pressed={calendarMode === "week"} onClick={() => setCalendarMode("week")}>Week</button>
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
              <div className="task-composer"><div className="composer-heading"><h2>{editingTaskId ? "Edit task" : "New task"}</h2><p>{editingTaskId ? "Update what changed, then save." : "Three quick choices, then you’re done."}</p></div><label className="task-title-field">Task title<input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="e.g. Finish the research introduction" /></label><div className="task-field-group"><span className="field-label" id="task-subject-label">Subject</span><div className="task-subject-choices" role="group" aria-labelledby="task-subject-label">{data.subjects.map((subject) => <button key={subject.id} className={taskSubject === subject.id ? "selected" : ""} aria-pressed={taskSubject === subject.id} onClick={() => setTaskSubject(subject.id)}><span style={{ background: subject.color }}><Icon name={subjectIcon(subject)} size={15} /></span><b>{subject.title}</b><small>{subject.code}</small></button>)}</div></div><div className="task-field-group"><span className="field-label">When is it due?</span><div className="quick-dates"><button onClick={setDueNextClass}>Next class</button><button onClick={() => { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(23, 59, 0, 0); setTaskDue(new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); }}>Tomorrow</button><button onClick={() => { const date = new Date(); date.setDate(date.getDate() + 7); date.setHours(23, 59, 0, 0); setTaskDue(new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); }}>In 7 days</button></div><button className={`due-date-button ${taskDue ? "has-value" : ""}`} onClick={() => setShowDuePicker(true)} aria-haspopup="dialog"><Icon name="calendar" size={17} /><span><small>Choose a date and time</small><strong>{taskDue ? new Date(taskDue).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not selected"}</strong></span><b aria-hidden="true">›</b></button></div><div className="task-submit-row">{editingTaskId && <button className="quiet-button" onClick={cancelTaskEdit}>Cancel</button>}<button className="primary-button" onClick={createTask}>{editingTaskId ? "Save changes" : "Add task"}</button></div></div>
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
                <summary><span className="setting-summary-main"><i><Icon name="calendar" size={17} /></i><span><strong>Semester dates</strong><small>{formatTermDate(data.termStart)} to {formatTermDate(data.termEnd)}</small></span></span><b>›</b></summary>
                <div className="setting-content settings-form term-date-settings"><label>Classes start<span className="date-input-shell"><input type="date" value={data.termStart} max={data.termEnd} onChange={(event) => setData({ ...data, termStart: event.target.value })} /><i aria-hidden="true" /></span></label><label>Classes end<span className="date-input-shell"><input type="date" value={data.termEnd} min={data.termStart} onChange={(event) => setData({ ...data, termEnd: event.target.value })} /><i aria-hidden="true" /></span></label><p className="autosave-note">The dashboard and recurring calendar export use this date range. Changes save automatically.</p></div>
              </details>
              <details>
                <summary><span className="setting-summary-main"><i><Icon name="sound" size={17} /></i><span><strong>In-app sounds</strong><small>{data.soundEffects !== false ? "On for helpful confirmations" : "Off"}</small></span></span><b>›</b></summary>
                <div className="setting-content sound-setting"><div className="sound-setting-copy"><strong>AnoSked? chime</strong><p>A clear signature chime and a quick haptic tap on supported devices. Moving around the app stays quiet.</p></div><div className="sound-setting-controls"><button className="quiet-button" onClick={() => playFeedbackTone("complete")}>Play chime</button><button className={`switch-control ${data.soundEffects !== false ? "on" : ""}`} role="switch" aria-label="In-app sounds" aria-checked={data.soundEffects !== false} onClick={() => { const enabled = data.soundEffects === false; setData({ ...data, soundEffects: enabled }); if (enabled) playFeedbackTone(); }}><span /></button></div></div>
              </details>
              <details>
                <summary><span className="setting-summary-main"><i><Icon name="appearance" size={17} /></i><span><strong>Appearance</strong><small>{appearance === "system" ? "Matches your device" : appearance === "dark" ? "Dark" : "Light"}</small></span></span><b>›</b></summary>
                <div className="setting-content appearance-setting"><p>Choose what feels comfortable.</p><div className="appearance-options" role="group" aria-label="Appearance"><button aria-pressed={appearance === "system"} className={appearance === "system" ? "selected" : ""} onClick={() => setAppearance("system")}>System</button><button aria-pressed={appearance === "light"} className={appearance === "light" ? "selected" : ""} onClick={() => setAppearance("light")}>Light</button><button aria-pressed={appearance === "dark"} className={appearance === "dark" ? "selected" : ""} onClick={() => setAppearance("dark")}>Dark</button></div></div>
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
              <section><h2>Share it with a classmate</h2><p>Share AnoSked? through your device’s menu. It sends a quick introduction and the official link, while supported apps may show the AnoSked? logo in the preview.</p><button onClick={shareAnoSked}><Icon name="share" size={15} /> Share AnoSked?</button></section>
              <section><h2>Your consent</h2><p>Privacy Notice and Terms accepted {data.consent?.acceptedAt ? new Date(data.consent.acceptedAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "on this device"}.</p></section>
              <section><h2>Found something off?</h2><p>Prepare a privacy-safe bug report and share it through any app you choose. AnoSked sends nothing automatically.</p><button onClick={() => setShowReport(true)}>Prepare bug report</button></section>
            </div>
            <footer className="about-footer"><span>© 2026 mmmkay studios. All rights reserved.</span><nav><button onClick={() => setPolicy("privacy")}>Privacy</button><button onClick={() => setPolicy("terms")}>Terms</button></nav></footer>
          </div>
        )}
      </section>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {PRIMARY_NAV.map(({ key, label, icon }) => <button key={key} className={view === key ? "active" : ""} aria-current={view === key ? "page" : undefined} onClick={() => setView(key)}><Icon name={icon} size={18} /><span>{label}</span></button>)}
        <button className={view === "settings" || view === "about" ? "active" : ""} aria-current={view === "settings" || view === "about" ? "page" : undefined} onClick={() => setView("settings")}><Icon name="settings" size={18} /><span>Settings</span></button>
      </nav>
      {confirmDelete && (
        <AccessibleDialog className="confirm-dialog" labelledBy="delete-title" describedBy="delete-description" onClose={() => setConfirmDelete(false)}>
            <img src="/assets/thinking.webp" alt="" />
            <h2 id="delete-title">Delete this schedule?</h2>
            <p id="delete-description">Subjects and tasks will be removed from this device. A backup is the only way to restore them.</p>
            <div><button className="quiet-button" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="confirm-delete" onClick={() => { setConfirmDelete(false); setData(null); setStage("paste"); }}>Delete</button></div>
        </AccessibleDialog>
      )}
      {taskPendingDelete && (
        <AccessibleDialog className="confirm-dialog" labelledBy="delete-task-title" describedBy="delete-task-description" onClose={() => setTaskPendingDelete(null)}>
            <img src="/assets/thinking.webp" alt="" />
            <h2 id="delete-task-title">Delete this task?</h2>
            <p id="delete-task-description">“{compactTitle(taskPendingDelete.title, 64)}” will be removed from this device.</p>
            <div><button className="quiet-button" onClick={() => setTaskPendingDelete(null)}>Keep task</button><button className="confirm-delete" onClick={deleteTask}>Delete task</button></div>
        </AccessibleDialog>
      )}
      {subjectPendingDelete && (
        <AccessibleDialog className="confirm-dialog" labelledBy="delete-subject-title" describedBy="delete-subject-description" onClose={() => setSubjectPendingDelete(null)}>
            <img src="/assets/thinking.webp" alt="" />
            <h2 id="delete-subject-title">Delete this class?</h2>
            <p id="delete-subject-description">“{compactTitle(subjectPendingDelete.title, 64)}” and {(() => { const count = data.tasks.filter((task) => task.subjectId === subjectPendingDelete.id).length; return `${count} linked ${count === 1 ? "task" : "tasks"}`; })()} will be removed from this device.</p>
            <div><button className="quiet-button" onClick={() => setSubjectPendingDelete(null)}>Keep class</button><button className="confirm-delete" onClick={deleteSubject}>Delete class</button></div>
        </AccessibleDialog>
      )}
      {showExportSheet && <ExportDialog data={data} onClose={() => setShowExportSheet(false)} onExport={(mode, theme, action) => { setShowExportSheet(false); exportScheduleImage(mode, theme, action); }} />}
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

  return <AccessibleDialog className="brand-dialog due-date-dialog" backdropClassName="policy-layer" labelledBy="due-date-title" describedBy="due-date-description" onClose={onClose}><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><div className="due-dialog-heading"><span><Icon name="calendar" size={20} /></span><div><h2 id="due-date-title">Choose a due date</h2><p id="due-date-description">Pick a day, then choose a useful time.</p></div></div><div className="month-switcher"><button onClick={() => moveMonth(-1)} aria-label="Previous month">‹</button><strong aria-live="polite">{month.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}</strong><button onClick={() => moveMonth(1)} aria-label="Next month">›</button></div><div className="due-weekdays" aria-hidden="true">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="due-calendar-grid">{slots.map((day, index) => {
    if (!day) return <span key={`blank-${index}`} />;
    const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const disabled = key < today;
    return <button key={key} className={selected === key ? "selected" : ""} disabled={disabled} aria-label={new Date(`${key}T12:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })} aria-pressed={selected === key} onClick={() => setSelected(key)}>{day}</button>;
  })}</div><span className="field-label due-time-label">Due time</span><div className="due-time-options">{timeOptions.map((option) => <button key={option.value} className={time === option.value ? "selected" : ""} aria-pressed={time === option.value} onClick={() => setTime(option.value)}>{option.label}</button>)}</div><div className="custom-time-row"><span>Or set any time</span><div><select aria-label="Due hour" value={hour12} onChange={(event) => updateTime(Number(event.target.value), minuteValue, period)}>{Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => <option key={hour}>{hour}</option>)}</select><span aria-hidden="true">:</span><select aria-label="Due minute" value={minuteValue} onChange={(event) => updateTime(hour12, event.target.value, period)}>{Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((minute) => <option key={minute}>{minute}</option>)}</select><select aria-label="AM or PM" value={period} onChange={(event) => updateTime(hour12, minuteValue, event.target.value)}><option>AM</option><option>PM</option></select></div></div><button className="sky-button wide-dialog" onClick={() => onSelect(`${selected}T${time}`)}>Use this due date</button></AccessibleDialog>;
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
  return <AccessibleDialog className="brand-dialog welcome-tour" backdropClassName="tour-layer" labelledBy="tour-title" describedBy="tour-description" onClose={onClose} closeOnBackdrop={false}><span className="tour-step-label" aria-live="polite">{step + 1} of {steps.length}</span><button className="tour-skip" onClick={onClose}>Skip</button><div className="tour-art">{steps.map((item, index) => <img src={item.image} alt="" key={item.image} className={index === step ? "active" : ""} aria-hidden={index !== step} />)}</div><h2 id="tour-title">{current.title}</h2><p id="tour-description">{current.detail}</p><div className="tour-dots" role="progressbar" aria-label="Welcome tour progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1}>{steps.map((item, index) => <i key={item.title} className={index === step ? "active" : ""} />)}</div><div className={`tour-actions ${step === 0 ? "single" : ""}`}>{step > 0 && <button className="quiet-button" onClick={() => setStep(step - 1)}>Back</button>}{step < steps.length - 1 ? <button className="sky-button" onClick={() => setStep(step + 1)}>Next</button> : <button className="sky-button" onClick={finish}>Start my week</button>}</div></AccessibleDialog>;
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
    if (meetings.some((meeting) => !meeting.days.length)) { setError("Choose at least one day for each class time."); return; }
    if (meetings.some((meeting) => !meeting.start || !meeting.end || meeting.end <= meeting.start)) { setError("Each class time must end after it starts."); return; }
    const normalizedMeetings = meetings.map((meeting) => ({ ...meeting, room: meeting.room.trim() || "TBA" }));
    onSave({ ...initial, id: initial?.id || uid("sub"), code: code.trim().toUpperCase() || "ACTIVITY", title: title.trim(), units: Math.max(0, Number(units) || 0), color: selectedColor, icon, meeting: normalizedMeetings[0], meetings: normalizedMeetings });
  }

  return <AccessibleDialog className="brand-dialog subject-dialog" backdropClassName="policy-layer" labelledBy="subject-dialog-title" describedBy="subject-dialog-description" onClose={onClose}><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><img src="/assets/studying.webp" alt="" /><h2 id="subject-dialog-title">{initial ? "Edit class or activity" : "Add a class or activity"}</h2><p id="subject-dialog-description">Keep the essentials together. Add another class time only when the schedule changes on a different day.</p><div className="subject-form"><label className="wide-field">Name<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Robotics Club meeting" required /></label><label>Code <small>Optional</small><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. ORG" /></label><label>Units <small>Optional</small><input type="number" min="0" max="20" step="1" value={units} onChange={(event) => setUnits(event.target.value)} /></label><div className="wide-field subject-look-editor"><IconPicker value={icon} onChange={setIcon} /><ColorPicker value={selectedColor} onChange={setSelectedColor} /></div><div className="wide-field meeting-editors">{meetings.map((meeting, meetingIndex) => { const classTimeLabel = meetings.length > 1 ? `Class time ${meetingIndex + 1}` : "Class time"; return <section className="meeting-editor" key={meetingIndex} aria-label={classTimeLabel}><header><strong>{classTimeLabel}</strong>{meetings.length > 1 && <button type="button" onClick={() => setMeetings((current) => current.filter((_, index) => index !== meetingIndex))}>Remove</button>}</header><div className="day-picker"><span>Days</span><div>{DAY_META.map((day) => <button type="button" key={day.code} className={meeting.days.includes(day.code) ? "selected" : ""} aria-pressed={meeting.days.includes(day.code)} onClick={() => toggleDay(meetingIndex, day.code)}>{day.short}</button>)}</div></div><div className="meeting-fields"><label>Starts<input type="time" value={meeting.start} onChange={(event) => updateMeeting(meetingIndex, "start", event.target.value)} /></label><label>Ends<input type="time" value={meeting.end} onChange={(event) => updateMeeting(meetingIndex, "end", event.target.value)} /></label><label>Room or place <small>Optional</small><input value={meeting.room === "TBA" ? "" : meeting.room} onChange={(event) => updateMeeting(meetingIndex, "room", event.target.value)} placeholder="e.g. Library" /></label></div></section>; })}<button type="button" className="add-meeting-button" onClick={() => setMeetings((current) => [...current, { days: ["MO"], start: "08:00", end: "09:00", room: "TBA" }])}>+ Add another class time</button></div></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="sky-button wide-dialog" onClick={submit}>{initial ? "Save changes" : "Add to my schedule"}</button></AccessibleDialog>;
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

  return <AccessibleDialog className="brand-dialog report-dialog" backdropClassName="policy-layer" labelledBy="report-title" describedBy="report-description" onClose={onClose}><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><img src="/assets/thinking.webp" alt="" /><h2 id="report-title">Report a problem</h2><p id="report-description">Describe the issue and AnoSked will prepare an email to info.keyno@gmail.com. Nothing is sent until you review and send it.</p><label>What kind of problem?<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Something looks wrong</option><option>Schedule parsed incorrectly</option><option>A button does not work</option><option>Accessibility problem</option><option>Suggestion</option></select></label><label>What happened?<textarea value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="What did you expect, and what happened instead?" /></label>{feedback && <p className="report-feedback" role="status">{feedback}</p>}<button className="sky-button wide-dialog" onClick={prepareReport}>Open email report</button></AccessibleDialog>;
}

function BrandedToast({ message }: { message: string }) {
  return <div className="toast" role="status" aria-live="polite" aria-atomic="true"><span className="toast-mascot"><img src="/assets/default.webp" alt="" /></span><span>{message}</span></div>;
}

function InstallDialog({ onClose }: { onClose: () => void }) {
  return <AccessibleDialog className="brand-dialog install-dialog" labelledBy="install-title" onClose={onClose}><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><img src="/assets/default.webp" alt="" /><h2 id="install-title">Add AnoSked? to your Home Screen</h2><div className="install-steps"><div><b>iPhone or iPad</b><span>Open the Share menu, choose “Add to Home Screen,” then tap Add.</span></div><div><b>Android</b><span>Open your browser menu and choose “Install app” or “Add to Home screen.”</span></div></div><button className="sky-button wide-dialog" onClick={onClose}>Got it</button></AccessibleDialog>;
}

function ExportDialog({ data, onClose, onExport }: { data: SkedData; onClose: () => void; onExport: (mode: ScheduleImageMode, theme: ScheduleImageTheme, action: "save" | "share") => void }) {
  const [mode, setMode] = useState<ScheduleImageMode>("wallpaper");
  const [theme, setTheme] = useState<ScheduleImageTheme>("sky");
  const preview = useMemo(() => renderScheduleCanvas(data, mode, theme).toDataURL("image/png"), [data, mode, theme]);

  return <AccessibleDialog className="brand-dialog export-dialog" labelledBy="export-title" describedBy="export-description" onClose={onClose}>
    <button className="dialog-close" onClick={onClose} aria-label="Close">×</button>
    <div className="export-heading"><img src="/assets/default.webp" alt="" /><div><h2 id="export-title">Preview your schedule</h2><p id="export-description">Choose a size and color, then save exactly what you see.</p></div></div>
    <div className="export-workspace">
      <div className={`schedule-preview ${mode}`}><img src={preview} alt={`${SCHEDULE_IMAGE_THEMES.find((item) => item.id === theme)?.label} ${mode === "wallpaper" ? "phone wallpaper" : "weekly timetable"} preview`} /></div>
      <div className="export-controls">
        <fieldset><legend>Format</legend><div className="export-segmented"><button className={mode === "wallpaper" ? "selected" : ""} aria-pressed={mode === "wallpaper"} onClick={() => setMode("wallpaper")}><Icon name="today" size={16} /> Wallpaper</button><button className={mode === "image" ? "selected" : ""} aria-pressed={mode === "image"} onClick={() => setMode("image")}><Icon name="image" size={16} /> Timetable</button></div></fieldset>
        <fieldset><legend>Color</legend><div className="export-themes">{SCHEDULE_IMAGE_THEMES.map((item) => <button key={item.id} className={theme === item.id ? "selected" : ""} aria-pressed={theme === item.id} onClick={() => setTheme(item.id)}><i style={{ background: "backgroundEnd" in item ? `linear-gradient(135deg, ${item.background}, ${item.backgroundEnd})` : item.background }} /><span>{item.label}</span></button>)}</div></fieldset>
        <p className="export-size-note">{mode === "wallpaper" ? "Tall layout with clear space for your Lock Screen clock and widgets." : "Wide layout for sharing, printing, or keeping in Photos."}</p>
        <div className="export-actions"><button className="sky-button icon-button" onClick={() => onExport(mode, theme, "save")}><Icon name="install" size={16} /> Save to device</button><button className="quiet-button icon-button" onClick={() => onExport(mode, theme, "share")}><Icon name="share" size={16} /> Share</button></div>
      </div>
    </div>
  </AccessibleDialog>;
}

function PolicyDialog({ type, onClose }: { type: "privacy" | "terms"; onClose: () => void }) {
  const privacy = type === "privacy";
  return <AccessibleDialog className="brand-dialog policy-dialog" backdropClassName="policy-layer" labelledBy="policy-title" onClose={onClose}><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><h2 id="policy-title">{privacy ? "Privacy Notice" : "Terms of Use"}</h2><p className="policy-date">Effective July 29, 2026</p>{privacy ? <div className="policy-copy"><h3>What stays on your device</h3><p>Enrollment text, selected timetable photos, and PDFs are processed inside your browser. Parsed subjects, tasks, optional profile labels, and your consent record are stored locally in this browser. AnoSked currently has no accounts, creator-accessible database, advertising tracker, or analytics tracker.</p><h3>What is ignored</h3><p>Student numbers, fees, balances, and payment details are not intentionally saved. Original pasted text and selected files are discarded after processing; AnoSked stores only the schedule you confirm.</p><h3>Deletion and exports</h3><p>Clearing browser data or deleting the installed app can remove everything. Backup, image, wallpaper, and calendar files leave AnoSked only when you choose to export them; the destination app then applies its own privacy practices.</p></div> : <div className="policy-copy"><h3>Use of AnoSked</h3><p>AnoSked is a convenience tool for organizing class information. Check important dates, rooms, and schedule changes against your school’s official records.</p><h3>Your responsibility</h3><p>You are responsible for reviewing parsed information, maintaining backups, and deciding what to export. AnoSked is provided as-is and may not recognize every enrollment format.</p><h3>Independence</h3><p>AnoSked is not affiliated with, endorsed by, or an official service of any university.</p></div>}<button className="sky-button wide-dialog" onClick={onClose}>Close</button></AccessibleDialog>;
}

function ConsentDialog({ onAccept, onPolicy }: { onAccept: () => void; onPolicy: (policy: "privacy" | "terms") => void }) {
  const [checked, setChecked] = useState(false);
  return <AccessibleDialog className="brand-dialog consent-dialog" backdropClassName="consent-layer" labelledBy="consent-title" describedBy="consent-description" closeOnBackdrop={false}><img src="/assets/default.webp" alt="" /><h2 id="consent-title">Before you continue</h2><p id="consent-description">AnoSked stores your schedule on this device. Please review how it works and agree before using this saved schedule.</p><label className="consent-row"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /><span>I agree to the <button type="button" onClick={() => onPolicy("terms")}>Terms</button> and acknowledge the <button type="button" onClick={() => onPolicy("privacy")}>Privacy Notice</button>.</span></label><button className="sky-button wide-dialog" disabled={!checked} onClick={onAccept}>Accept and continue</button></AccessibleDialog>;
}
