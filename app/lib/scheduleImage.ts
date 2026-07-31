import { DAY_META, formatTime, subjectMeetings, type SkedData } from "./schedule";

export type ScheduleImageMode = "image" | "wallpaper";
export type ScheduleImageTheme = "sky" | "rose" | "meadow" | "sunshine" | "midnight" | "electric";

type ScheduleImageThemeDefinition = {
  id: ScheduleImageTheme;
  label: string;
  background: string;
  backgroundEnd?: string;
  card: string;
  ink: string;
  muted: string;
  grid: string;
};

export const SCHEDULE_IMAGE_THEMES = [
  { id: "sky", label: "Sky", background: "#EAF6FC", card: "rgba(255,255,255,.88)", ink: "#153A52", muted: "#56788D", grid: "rgba(71,128,158,.16)" },
  { id: "rose", label: "Rose", background: "#FBEFF3", card: "rgba(255,255,255,.88)", ink: "#55343F", muted: "#8A6571", grid: "rgba(142,92,109,.16)" },
  { id: "meadow", label: "Meadow", background: "#EDF7F0", card: "rgba(255,255,255,.88)", ink: "#274B3B", muted: "#628171", grid: "rgba(70,123,95,.16)" },
  { id: "sunshine", label: "Sunshine", background: "#FFF7DD", card: "rgba(255,255,255,.88)", ink: "#594920", muted: "#8B7745", grid: "rgba(145,116,49,.16)" },
  { id: "midnight", label: "Midnight", background: "#101B2D", backgroundEnd: "#172D46", card: "rgba(28,43,64,.94)", ink: "#F3F7FF", muted: "#AFC3E2", grid: "rgba(190,210,240,.16)" },
  { id: "electric", label: "Electric", background: "#281B46", backgroundEnd: "#183F55", card: "rgba(45,35,75,.93)", ink: "#FAF7FF", muted: "#C8BEEA", grid: "rgba(214,202,244,.17)" },
] as const satisfies ReadonlyArray<ScheduleImageThemeDefinition>;

export function renderScheduleCanvas(data: SkedData, mode: ScheduleImageMode, themeId: ScheduleImageTheme) {
  const canvas = document.createElement("canvas");
  canvas.width = mode === "wallpaper" ? 1290 : 1800;
  canvas.height = mode === "wallpaper" ? 2796 : 1500;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const theme = SCHEDULE_IMAGE_THEMES.find((item) => item.id === themeId) ?? SCHEDULE_IMAGE_THEMES[0];
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
  const firstHour = starts.length ? Math.floor(Math.min(...starts) / 60) : 8;
  const lastHour = ends.length ? Math.ceil(Math.max(...ends) / 60) : 17;
  const hourSpan = Math.max(1, lastHour - firstHour);
  const gridLeft = margin + timeWidth;
  const gridWidth = width - gridLeft - margin;
  const headerHeight = mode === "wallpaper" ? 70 : 76;
  const gridTop = top + headerHeight;
  const gridHeight = height - gridTop - bottom;
  const hourHeight = gridHeight / hourSpan;
  const dayWidth = gridWidth / Math.max(1, days.length);

  if ("backgroundEnd" in theme && theme.backgroundEnd) {
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, theme.background);
    background.addColorStop(1, theme.backgroundEnd);
    ctx.fillStyle = background;
  } else ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.fillStyle = theme.ink;
  ctx.font = `700 ${mode === "wallpaper" ? 52 : 62}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillText(data.exportTitle?.trim() || (data.profile.nickname ? `${data.profile.nickname}’s week` : "My week"), width / 2, top - 112);
  ctx.fillStyle = theme.muted;
  ctx.font = `500 ${mode === "wallpaper" ? 24 : 27}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillText(`${data.semester}${data.block ? `  •  ${data.block}` : ""}`, width / 2, top - 62);

  ctx.fillStyle = theme.card;
  ctx.beginPath();
  ctx.roundRect(margin, top, width - margin * 2, height - top - bottom + 16, mode === "wallpaper" ? 30 : 36);
  ctx.fill();

  days.forEach((day, dayIndex) => {
    const x = gridLeft + dayIndex * dayWidth;
    ctx.fillStyle = theme.muted;
    ctx.font = `700 ${mode === "wallpaper" ? 16 : 20}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(day.short.toUpperCase(), x + dayWidth / 2, top + headerHeight * .62);
  });

  for (let index = 0; index <= days.length; index += 1) {
    const x = gridLeft + index * dayWidth;
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, top + 14); ctx.lineTo(x, gridTop + gridHeight); ctx.stroke();
  }

  for (let hour = firstHour; hour <= lastHour; hour += 1) {
    const y = gridTop + (hour - firstHour) * hourHeight;
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(margin + 16, y); ctx.lineTo(width - margin - 16, y); ctx.stroke();
    if (hour < lastHour) {
      ctx.fillStyle = theme.muted;
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
    ctx.globalAlpha = .9;
    ctx.fillStyle = subject.color;
    ctx.beginPath(); ctx.roundRect(x, y, blockWidth, blockHeight, 14); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.font = `700 ${mode === "wallpaper" ? 12 : 16}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText(subject.title, x + 10, y + 22, blockWidth - 18);
    if (blockHeight > 54) {
      ctx.fillStyle = "rgba(255,255,255,.86)";
      ctx.font = `600 ${mode === "wallpaper" ? 11 : 15}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillText(`${subject.code} · ${meeting.room}`, x + 10, y + 43, blockWidth - 18);
    }
  }));

  ctx.textAlign = "center";
  ctx.fillStyle = theme.ink;
  ctx.font = `700 ${mode === "wallpaper" ? 20 : 24}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillText("Made with AnoSked?", width / 2, height - (mode === "wallpaper" ? 86 : 34));
  return canvas;
}
