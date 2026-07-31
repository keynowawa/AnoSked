import assert from "node:assert/strict";
import test from "node:test";
import {
  buildICS,
  decodeDays,
  isValidStoredData,
  nextClassDate,
  parseEnrollment,
  parseFlexibleMeeting,
} from "../app/lib/schedule.ts";

const ADAMSON_SAMPLE = `Welcome to Adamson University
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

const COMPACT_ADAMSON_SAMPLE = `Welcome to Adamson University
Subject Enlistment
2nd Semester 2024-2025
DUAL DEGREE OF BACHELOR OF SCIENCE IN COMPUTER
SCIENCE AND BS COMPUTER SCIENCE AND INFORMATION
ENGINEERING
Second Year - 2nd Semester
Enrolled Subjects
Block No. : DCS 201
Section Subject Units
08092 HU311 : ART APPRECIATION (4505)
TTh 07:00-08:30 SV203 3
25089 CS220 : DISCRETE STRUCTURES 2 (250018)
MWF 09:00-10:00 SV214 3
06004 NS211 : ENVIRONMENTAL SCIENCE (6913)
MWF 15:00-16:00 SV202 3
25088 CS228AL : INFORMATION MANAGEMENT LAB (250020)
Fri 10:30-13:30 CL5 1
25087 CS228A : INFORMATION MANAGEMENT LEC (250019)
TTh 09:00-10:00 SV203 2
04045 MH425B : NUMERICAL ANALYSIS (6572)
MWF 14:00-15:00 CT505 3
04046 MH428 : OPERATIONS RESEARCH (6672)
MWF 08:00-09:00 SV214 3
09048 PE221C : PATHFIT4:SPORTS (090005)
Mon 11:00-13:00 PEDEPT 2
08093
PS221B : POLITICS & GOVERNANCE WITH PHILIPPINE
CONSTITUTION(4910)
TTh 12:00-13:30 SV203
3
25090 CS227 : PROGRAMMING LANGUAGES (250021)
TTh 10:30-12:00 SV203 3
08094 HI311 : RIZAL'S LIFE & WORKS (4403)
MWF 07:00-08:00 SV214 3
60047 TH221E : TRANSFORMING THE WORLD WITH VINCENT DE PAUL (600004)
TTh 14:00-15:30 SV302 3
Assessment of Fees
TUITION FEE (LEC SUBJECT/S) 51,925.00
Total Due : 62,832.00`;

const FLEXIBLE_SAMPLE = `CS 26114
THESIS II
T - 2-5pm Room 1911

CS 26115
GRAPHICS COMPUTING AND MULTIMEDIA TECHNOLOGY
W 10:30 to 1:30 Room 1911
TH 7-9 Room 1909

CS 26117
COMPUTER SECURITY AND INFORMATION ASSURANCE
M 10:30 to 12:30 Room 1904

CS ELEC 3C
Data Analysis & Visualization (SPECIALIZATION)
W 10:30 to 1:30 Room 1911
TH 9:30 to 11:30 Room 1909

CONTEM_W
THE CONTEMPORARY WORLD
MW 8:30-10 Room 1909

LIWORIZ
LIFE AND WORKS OF RIZAL
MW 7-8:30 Room 1909`;

const FIXED_WIDTH_SAMPLE = `Block No. : CS 405
Section: 4-1
================================================================================
Code    Subject Description                           Days   Time          Room
================================================================================
CS420   CS RESEARCH PROJECT 2                         Wed    14:00-17:00   SV217
CS467   PE - CODING THEORY AND CRYPTOLOGY             MTh    10:30-12:00   SV213
CS468   PE - PARALLEL AND DISTRIBUTED COMPUTING       MTh    13:00-14:30   SV215
CS472   PE - INTRODUCTION TO BLOCKCHAIN TECHNOLOGIES  TF     09:00-10:30   SV214
CS342   PROFESSIONAL ETHICS                           TF     14:30-16:00   SV213
================================================================================
Total Units: 15`;

const GROUPED_DAY_SAMPLE = `📌 4th Year Schedule (1st Sem)

MONDAY & THURSDAY
• 10:30 AM - 12:00 PM | Coding Theory & Cryptology (SV213)
• 1:00 PM - 2:30 PM | Parallel & Distributed Computing (SV215)
*Lunch gap: 12:00 PM - 1:00 PM*

TUESDAY & FRIDAY
• 9:00 AM - 10:30 AM | Intro to Blockchain (SV214)
• 2:30 PM - 4:00 PM | Professional Ethics (SV213)
*Long gap: 10:30 AM - 2:30 PM*

WEDNESDAY
• 2:00 PM - 5:00 PM | CS Research Project 2 (SV217)
*Consultation day / Thesis grind*`;

function makeStoredData() {
  return {
    semester: "1st Semester 2026-2027",
    block: "CS 402",
    totalUnits: 3,
    termStart: "2026-08-03",
    termEnd: "2026-12-05",
    profile: { nickname: "", program: "", yearLevel: "" },
    subjects: [{
      id: "subject-1",
      code: "CS420",
      title: "Research Project",
      units: 3,
      color: "#2F8FC4",
      meeting: { days: ["MO", "WE"], start: "09:00", end: "10:30", room: "SV217" },
    }],
    tasks: [{ id: "task-1", subjectId: "subject-1", title: "Draft chapter", dueAt: "2026-08-05T17:00:00", done: false }],
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

test("decodes compact university day formats without duplicates", () => {
  assert.deepEqual(decodeDays("MTh"), ["MO", "TH"]);
  assert.deepEqual(decodeDays("TF"), ["TU", "FR"]);
  assert.deepEqual(decodeDays("Wed"), ["WE"]);
  assert.deepEqual(decodeDays("MWM"), ["MO", "WE"]);
  assert.deepEqual(decodeDays("Monday & Thursday"), ["MO", "TH"]);
});

test("parses an Adamson enrolled-subjects table and ignores surrounding profile text", () => {
  const parsed = parseEnrollment(ADAMSON_SAMPLE);
  assert.equal(parsed.issue, undefined);
  assert.equal(parsed.result?.subjects.length, 4);
  assert.equal(parsed.result?.block, "CS 402");
  assert.equal(parsed.result?.totalUnits, 12);
  assert.equal(parsed.result?.program, "B.S. COMPUTER SCIENCE");
  assert.equal(parsed.result?.yearLevel, "Fourth Year");
  assert.deepEqual(parsed.result?.subjects[1].meeting.days, ["MO", "TH"]);
  assert.equal(parsed.result?.subjects[0].meeting.room, "SV217");
});

test("parses compact and wrapped Adamson enrollment rows before the fees section", () => {
  const parsed = parseEnrollment(COMPACT_ADAMSON_SAMPLE);
  assert.equal(parsed.issue, undefined);
  assert.equal(parsed.result?.subjects.length, 12);
  assert.equal(parsed.result?.block, "DCS 201");
  assert.equal(parsed.result?.totalUnits, 32);
  assert.equal(parsed.result?.program, "DUAL DEGREE OF BACHELOR OF SCIENCE IN COMPUTER SCIENCE AND BS COMPUTER SCIENCE AND INFORMATION ENGINEERING");
  assert.equal(parsed.result?.yearLevel, "Second Year");
  assert.equal(parsed.result?.subjects[3].code, "CS228AL");
  assert.equal(parsed.result?.subjects[3].units, 1);
  assert.equal(parsed.result?.subjects[8].title, "POLITICS & GOVERNANCE WITH PHILIPPINE CONSTITUTION");
  assert.equal(parsed.result?.subjects[8].internalId, "4910");
  assert.equal(parsed.result?.subjects[8].meeting.room, "SV203");
  assert.equal(parsed.result?.subjects[11].title, "TRANSFORMING THE WORLD WITH VINCENT DE PAUL");
});

test("parses a school-neutral line-by-line schedule with multiple meetings", () => {
  const parsed = parseEnrollment(FLEXIBLE_SAMPLE);
  assert.equal(parsed.issue, undefined);
  assert.equal(parsed.result?.subjects.length, 6);
  assert.equal(parsed.result?.subjects[0].meeting.start, "14:00");
  assert.equal(parsed.result?.subjects[0].meeting.end, "17:00");
  assert.equal(parsed.result?.subjects[1].meetings?.length, 2);
  assert.equal(parsed.result?.subjects[1].meetings?.[0].end, "13:30");
  assert.deepEqual(parsed.result?.subjects[1].meetings?.[1].days, ["TH"]);
  assert.equal(parsed.result?.subjects[3].code, "CS ELEC 3C");
});

test("parses a fixed-width subject table with 24-hour times", () => {
  const parsed = parseEnrollment(FIXED_WIDTH_SAMPLE);
  assert.equal(parsed.issue, undefined);
  assert.equal(parsed.result?.subjects.length, 5);
  assert.equal(parsed.result?.block, "CS 405");
  assert.equal(parsed.result?.totalUnits, 15);
  assert.equal(parsed.result?.subjects[0].title, "CS RESEARCH PROJECT 2");
  assert.deepEqual(parsed.result?.subjects[1].meeting.days, ["MO", "TH"]);
  assert.equal(parsed.result?.subjects[2].meeting.start, "13:00");
  assert.equal(parsed.result?.subjects[4].meeting.end, "16:00");
  assert.equal(parsed.result?.subjects[4].meeting.room, "SV213");
  assert.match(parsed.result?.warnings.join(" ") || "", /units were not listed/i);
});

test("parses day-grouped bullet schedules without requiring codes or units", () => {
  const parsed = parseEnrollment(GROUPED_DAY_SAMPLE);
  assert.equal(parsed.issue, undefined);
  assert.equal(parsed.result?.subjects.length, 5);
  assert.equal(parsed.result?.semester, "1st Sem");
  assert.equal(parsed.result?.subjects[0].code, "CTC");
  assert.deepEqual(parsed.result?.subjects[0].meeting.days, ["MO", "TH"]);
  assert.equal(parsed.result?.subjects[0].meeting.start, "10:30");
  assert.equal(parsed.result?.subjects[1].meeting.end, "14:30");
  assert.deepEqual(parsed.result?.subjects[2].meeting.days, ["TU", "FR"]);
  assert.equal(parsed.result?.subjects[4].title, "CS Research Project 2");
  assert.equal(parsed.result?.subjects[4].meeting.room, "SV217");
  assert.match(parsed.result?.warnings.join(" ") || "", /editable codes/i);
});

test("normalizes common twelve-hour meeting formats", () => {
  assert.deepEqual(parseFlexibleMeeting("T - 2-5pm Room 1911"), { days: ["TU"], start: "14:00", end: "17:00", room: "1911" });
  assert.deepEqual(parseFlexibleMeeting("W 10:30 to 1:30 Room 1911"), { days: ["WE"], start: "10:30", end: "13:30", room: "1911" });
});

test("rejects flattened timetable grids and fee-only text with explicit guidance", () => {
  const grid = parseEnrollment("CLASS SCHEDULE TIME 7:00 AM 7:30 AM MONDAY TUESDAY WEDNESDAY THURSDAY FRIDAY RM 1909 RM 1904 4CSD");
  assert.equal(grid.issue?.kind, "timetable-grid");
  assert.match(grid.issue?.detail || "", /original timetable/i);
  const fees = parseEnrollment("Assessment of Fees\nTUITION FEE 20,520.00\nTotal Due 25,095.00\nSchedule of Payment");
  assert.equal(fees.issue?.kind, "fees-only");
});

test("validates safe backups and rejects broken relationships or duplicate IDs", () => {
  const valid = makeStoredData();
  assert.equal(isValidStoredData(valid), true);
  assert.equal(isValidStoredData({ ...valid, tasks: [{ ...valid.tasks[0], subjectId: "missing" }] }), false);
  assert.equal(isValidStoredData({ ...valid, subjects: [valid.subjects[0], { ...valid.subjects[0] }] }), false);
  assert.equal(isValidStoredData({ ...valid, subjects: [{ ...valid.subjects[0], meeting: { ...valid.subjects[0].meeting, days: ["MO", "MO"] } }] }), false);
});

test("calculates the next class and produces recurring calendar events with alerts", () => {
  const data = makeStoredData();
  const next = nextClassDate(data.subjects[0], new Date(2026, 7, 3, 8, 0));
  assert.equal(next?.getHours(), 9);
  assert.equal(next?.getDate(), 3);
  const calendar = buildICS(data, new Date("2026-08-01T00:00:00.000Z"));
  assert.match(calendar, /BEGIN:VCALENDAR/);
  assert.match(calendar, /RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261205T235959/);
  assert.match(calendar, /TRIGGER:-PT15M/);
  assert.match(calendar, /SUMMARY:Research Project · CS420/);
});
