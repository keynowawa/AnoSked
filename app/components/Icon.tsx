import type { IconName } from "../lib/schedule";

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
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
