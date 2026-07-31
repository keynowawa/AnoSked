/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, dateKey, DAY_META, formatTime, subjectMeetings, type DayCode, type IconName, type Subject } from "../lib/schedule";
import { AccessibleDialog } from "./AccessibleDialog";
import { Icon } from "./Icon";

const REVIEW_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
const SUBJECT_ICONS: Array<{ icon: IconName; label: string }> = [
  { icon: "book", label: "Book" }, { icon: "flask", label: "Research" },
  { icon: "cpu", label: "Technology" }, { icon: "key", label: "Security" },
  { icon: "balance", label: "Humanities" }, { icon: "calculator", label: "Mathematics" },
  { icon: "globe", label: "Language or social studies" },
];

export function WeeklyTimetable({ subjects }: { subjects: Subject[] }) {
  const timetableRef = useRef<HTMLDivElement>(null);
  const [jumpVisible, setJumpVisible] = useState(false);
  const firstHour = 7;
  const lastHour = 22;
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
  const totalMinutes = (lastHour - firstHour) * 60;
  const events = subjects.flatMap((subject) => subjectMeetings(subject).flatMap((meeting, meetingIndex) => meeting.days.map((day) => ({ subject, meeting, meetingIndex, day }))));
  const earliest = [...events].sort((a, b) => a.meeting.start.localeCompare(b.meeting.start))[0];
  const jumpKey = earliest ? `${earliest.subject.id}-${earliest.meetingIndex}-${earliest.day}` : "";
  const shouldShowJump = earliest ? Number(earliest.meeting.start.split(":")[0]) >= 12 : false;

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

  return (
    <div className="weekly-view">
      <div className="timetable-intro"><div><strong>Your weekly timetable</strong><span>{earliest ? `First class begins at ${formatTime(earliest.meeting.start).replace(":00", "")}.` : "No classes scheduled."}</span></div>{jumpVisible && <button className="jump-to-classes" onClick={() => timetableRef.current?.querySelector(".jump-target")?.scrollIntoView({ behavior: "smooth", block: "center" })}><Icon name="jump" size={16} /> Jump to {formatTime(earliest.meeting.start).replace(":00", "")}</button>}</div>
      <div className="timetable-shell" ref={timetableRef}>
        <div className="timetable" aria-label="Weekly class timetable">
          <div className="timetable-header"><div className="time-corner" />{DAY_META.map((day) => <div key={day.code}><strong>{day.short}</strong></div>)}</div>
          <div className="timetable-content">
            <div className="time-axis">{hours.slice(0, -1).map((hour) => <span key={hour} style={{ top: `${((hour - firstHour) / (lastHour - firstHour)) * 100}%` }}>{formatTime(`${String(hour).padStart(2, "0")}:00`).replace(":00", "")}</span>)}</div>
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
                return <div className={`schedule-block ${`${subject.id}-${meetingIndex}-${day}` === jumpKey ? "jump-target" : ""}`} key={`${subject.id}-${meetingIndex}-${day}`} style={{ left: `calc(${dayIndex * (100 / 7)}% + 4px)`, width: `calc(${100 / 7}% - 8px)`, top: `calc(${(start / totalMinutes) * 100}% + 3px)`, height: `calc(${((end - start) / totalMinutes) * 100}% - 6px)`, background: subject.color }}><strong>{subject.title}</strong><span>{subject.code} · {meeting.room}</span><small>{formatTime(meeting.start).replace(":00", "")}–{formatTime(meeting.end).replace(":00", "")}</small></div>;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DayStrip({ selectedDate, onSelect }: { selectedDate: Date; onSelect: (date: Date) => void }) {
  const start = new Date(selectedDate);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  const moveWeek = (amount: number) => { const next = new Date(selectedDate); next.setDate(next.getDate() + amount * 7); onSelect(next); };
  return <div className="week-picker"><button className="week-arrow" onClick={() => moveWeek(-1)} aria-label="Previous week" title="Previous week">‹</button><div className="day-strip" role="group" aria-label="Choose a day">{days.map((date) => { const selected = dateKey(date) === dateKey(selectedDate); const today = dateKey(date) === dateKey(new Date()); const fullDate = date.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); return <button key={dateKey(date)} className={`${selected ? "selected" : ""} ${today ? "is-today" : ""}`} aria-label={`${fullDate}${today ? ", today" : ""}`} aria-pressed={selected} onClick={() => onSelect(date)}><span>{date.toLocaleDateString("en-PH", { weekday: "short" })}</span><strong>{date.getDate()}</strong><i aria-hidden="true" /></button>; })}</div><button className="week-arrow" onClick={() => moveWeek(1)} aria-label="Next week" title="Next week">›</button></div>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><img src="/assets/noclass.webp" alt="" /><h3>{title}</h3><p>{detail}</p></div>;
}

export function ReviewTimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const options = REVIEW_TIME_OPTIONS.includes(value) ? REVIEW_TIME_OPTIONS : [...REVIEW_TIME_OPTIONS, value].sort();
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} time`}>{options.map((time) => <option value={time} key={time}>{formatTime(time)}</option>)}</select></label>;
}

export function ReviewDaysDialog({ days, onToggle, onClose }: { days: DayCode[]; onToggle: (day: DayCode) => void; onClose: () => void }) {
  return <AccessibleDialog className="brand-dialog review-days-dialog" backdropClassName="policy-layer" labelledBy="review-days-title" describedBy="review-days-description" onClose={onClose}><button className="dialog-close" onClick={onClose} aria-label="Close">×</button><div className="due-dialog-heading"><span><Icon name="calendar" size={19} /></span><div><h2 id="review-days-title">Choose class days</h2><p id="review-days-description">Turn days on or off if the imported schedule needs a correction.</p></div></div><div className="day-picker modal-day-picker"><span>Class days</span><div>{DAY_META.map((day) => <button type="button" key={day.code} className={days.includes(day.code) ? "selected" : ""} aria-pressed={days.includes(day.code)} onClick={() => onToggle(day.code)}>{day.short}</button>)}</div></div><button className="sky-button wide-dialog" onClick={onClose}>Done</button></AccessibleDialog>;
}

export function IconPicker({ value, onChange, compact = false }: { value: IconName; onChange: (icon: IconName) => void; compact?: boolean }) {
  return <div className={`icon-picker ${compact ? "compact" : ""}`}><span>{compact ? "Icon" : "Choose an icon"}</span><div>{SUBJECT_ICONS.map(({ icon, label }) => <button type="button" key={icon} className={value === icon ? "selected" : ""} onClick={() => onChange(icon)} aria-label={label} aria-pressed={value === icon} title={label}><Icon name={icon} size={compact ? 14 : 18} /></button>)}</div></div>;
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return <div className="color-picker"><span>Color</span><div>{COLORS.map((color) => <button type="button" key={color} className={value === color ? "selected" : ""} style={{ background: color }} onClick={() => onChange(color)} aria-label={`Use color ${color}`} aria-pressed={value === color}><i /></button>)}</div></div>;
}
