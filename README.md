# AnoSked?

AnoSked? is a local-first student planner that turns copied enrollment details into a readable weekly schedule. It keeps class times, rooms, subjects, and schoolwork together without requiring an account.

## What it does

- Parses subject names, codes, rooms, days, and class times from enrollment text
- Shows a daily timeline and a Monday-to-Sunday timetable
- Highlights the current or next class
- Keeps tasks connected to their subjects
- Suggests useful due dates, including the next class meeting
- Exports the weekly timetable as a PNG or iPhone wallpaper
- Creates a recurring `.ics` calendar file with 15-minute reminders
- Works offline after the app has been loaded
- Can be installed on a supported phone or tablet as a Progressive Web App

## Privacy and local storage

AnoSked? has no account system and does not upload pasted enrollment text. Subjects, tasks, optional profile details, and preferences are stored in the browser on the current device.

Deleting the installed app or clearing browser data may permanently remove that information. Users can export a backup from Settings before changing devices or clearing data.

Student numbers, assessment details, balances, and payment information are not intentionally stored.

## Enrollment formats

The parser is designed around common subject-enlistment text containing:

- a subject code and title
- meeting days
- start and end times
- a room or location

The included sample uses an Adamson University-style Computer Science schedule, but the planner itself is not limited to one school. Every parsed subject can be reviewed and corrected before saving.

## Run locally

AnoSked? requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local address printed in the terminal.

## Checks

```bash
npm run lint
npm test
npm run vercel-build
```

## Important limitations

- The school portal remains the official source for schedules and room changes.
- Browser storage is device-specific and is not a replacement for a backup.
- Background push notifications are not currently provided. Calendar exports offer the most dependable system reminders.
- Enrollment layouts vary, so users should review parsed subjects before saving.

## Creator

Created by mmmkay studios.

© 2026 mmmkay studios. All rights reserved.
