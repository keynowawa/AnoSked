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

const CLUSTERED_SECTIONS_SAMPLE = `Welcome to Adamson University
Subject Enlistment
Mid-year Term 2025-2026
TAGLE, JEL KYANN JAYME 202313899
B.S. COMPUTER SCIENCE Third Year - Mid-year Term
Enrolled Subjects Pre-Advised Subjects Online Survey
Print Enrolled Subjects Print Enrolled Subjects
Enrolled Subjects
Section Subject Units
25010 25002 25008 25005 CS341 : HUMAN COMPUTER INTERACTION (9731)
MTWThF 15:30-18:00 SV218 3
CS422 : PROJECT MANAGEMENT (9751)
MTWThF 10:00-12:30 SV217 3
CS462 : RSC4- DATA SCIENCE CAPSTONE PROJECT (250052)
MTWThF 07:00-09:30 SV217 3
CS416B : SOFTWARE QUALITY ASSURANCE (250079)
MTWThF 13:00-15:30 SV217 3
Total Units : 12
Assessment of Fees
TUITION FEE (LEC SUBJECT/S) 21,096.00`;

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

const MATRIX_SAMPLE = `TIME          | MON        | TUE        | WED        | THU        | FRI
--------------|------------|------------|------------|------------|------------
09:00 - 10:30 |            | CS472      |            |            | CS472
10:30 - 12:00 | CS467      |            |            | CS467      |
12:00 - 13:00 | [BREAK]    | [BREAK]    |            | [BREAK]    | [BREAK]
13:00 - 14:30 | CS468      |            |            | CS468      |
14:00 - 15:30 |            |            | CS420      |            |
14:30 - 16:00 |            | CS342      | CS420      |            | CS342
16:00 - 17:00 |            |            | CS420      |            |`;

const CSV_SAMPLE = `COURSE_CODE,COURSE_TITLE,UNITS,DAYS,TIME,ROOM
CS420,CS RESEARCH PROJECT 2,3,Sat,08:00-11:00,SV217
CS410,INFORMATION ASSURANCE & SECURITY LEC,2,MW,14:00-15:00,SV213
CS410L,INFORMATION ASSURANCE AND SECURITY LAB,1,MW,15:00-16:30,SV218
CS468,PE- PARALLEL AND DISTRIBUTED COMPUTING,3,TTh,09:00-10:30,SV215
CS433B,APPRENTICESHIP,6,Fri,08:00-17:00,OFFCAMPUS`;

const CLOCK_GROUP_SAMPLE = `== MY 4TH YEAR SCHEDULE ==

[ MONDAY ]
⏰ 14:00 - 15:00 | Info Assurance & Security (Lec) | Room: SV213
⏰ 15:00 - 16:30 | Info Assurance & Security (Lab) | Room: SV218

[ TUESDAY ]
⏰ 09:00 - 10:30 | Parallel & Distributed Computing | Room: SV215

[ WEDNESDAY ]
⏰ 14:00 - 15:00 | Info Assurance & Security (Lec) | Room: SV213
⏰ 15:00 - 16:30 | Info Assurance & Security (Lab) | Room: SV218

[ THURSDAY ]
⏰ 09:00 - 10:30 | Parallel & Distributed Computing | Room: SV215

[ FRIDAY ]
⏰ 08:00 - 17:00 | Apprenticeship / OJT | Off-campus

[ SATURDAY ]
⏰ 08:00 - 11:00 | CS Research Project 2 | Room: SV217`;

const PIPE_TABLE_SAMPLE = `Term 1, AY 2026-2027
Enrolled Classes

Class Nbr | Course  | Sec | Title                          | Units | Days | Time        | Room
4092      | STHESIS | X22 | Thesis / Capstone Project 2    |  3.0  | F    | 0915 - 1230 | G304
4105      | CSECURE | X22 | Information Security           |  3.0  | MH   | 1100 - 1230 | G306
4112      | CSARINT | X22 | Artificial Intelligence        |  3.0  | MH   | 1245 - 1415 | G306
4255      | CSDISTR | X22 | Distributed Systems            |  3.0  | TW   | 1430 - 1600 | G302
Total Units: 12.0`;

const LABELED_SAMPLE = `First Semester 2026-2027
Program: BS Computer Science
Total Academic Units: 12.0

Subject: CS 192 Software Engineering II
Class Code: 14023
Section: THX
Units: 3.0
Schedule: T Th 10:00 AM - 11:30 AM
Room: DCS RM 101
Instructor: GARCIA, R.

Subject: CS 199 Thesis 2
Class Code: 14055
Section: WFW
Units: 3.0
Schedule: W 01:00 PM - 04:00 PM
Room: DCS RM 204
Instructor: FLORES, L.

Subject: CS 173 Artificial Intelligence
Class Code: 14067
Section: WHX
Units: 3.0
Schedule: W F 08:30 AM - 10:00 AM
Room: AECH 211
Instructor: MENDOZA, K.

Subject: CS 153 Computer Security
Class Code: 14088
Section: THY
Units: 3.0
Schedule: T Th 01:00 PM - 02:30 PM
Room: DCS RM 102
Instructor: CRUZ, D.`;

const INLINE_SAMPLE = `Enrolled Classes - 1st Semester, SY 2026-2027

CSCI 152-A: SOFTWARE ENGINEERING II (3.00 Units). Schedule: T-TH 0900-1030 at FA 207. Instructor: CRUZ, J.

CSCI 199-B: THESIS 2 (3.00 Units). Schedule: W 1400-1700 at CTC 302. Instructor: REYES, M.

CSCI 141-A: INTRODUCTION TO ARTIFICIAL INTELLIGENCE (3.00 Units). Schedule: T-TH 1100-1230 at FA 207. Instructor: SANTOS, P.

CSCI 157-A: COMPUTER SECURITY (3.00 Units). Schedule: M-W-F 0900-1000 at SEC B201. Instructor: VILLANUEVA, A.`;

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

test("parses enrollment rows when copied section numbers collapse ahead of the subjects", () => {
  const parsed = parseEnrollment(CLUSTERED_SECTIONS_SAMPLE);
  assert.equal(parsed.issue, undefined);
  assert.equal(parsed.result?.subjects.length, 4);
  assert.equal(parsed.result?.semester, "Mid-year Term 2025-2026");
  assert.equal(parsed.result?.program, "B.S. COMPUTER SCIENCE");
  assert.equal(parsed.result?.yearLevel, "Third Year");
  assert.equal(parsed.result?.totalUnits, 12);
  assert.deepEqual(parsed.result?.subjects.map((subject) => subject.code), ["CS341", "CS422", "CS462", "CS416B"]);
  assert.deepEqual(parsed.result?.subjects.map((subject) => subject.sectionId), ["25010", "25002", "25008", "25005"]);
  assert.deepEqual(parsed.result?.subjects[0].meeting.days, ["MO", "TU", "WE", "TH", "FR"]);
  assert.equal(parsed.result?.subjects[3].meeting.room, "SV217");
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

test("parses a timetable matrix by merging adjacent cells for each code", () => {
  const parsed = parseEnrollment(MATRIX_SAMPLE);
  assert.equal(parsed.issue, undefined);
  assert.equal(parsed.result?.subjects.length, 5);
  const research = parsed.result?.subjects.find((subject) => subject.code === "CS420");
  assert.equal(research?.title, "CS420");
  assert.equal(research?.meeting.start, "14:00");
  assert.equal(research?.meeting.end, "17:00");
  assert.equal(research?.meeting.room, "TBA");
});

test("parses CSV schedules and combines a schedule pasted twice", () => {
  const parsed = parseEnrollment(`${CSV_SAMPLE}\n${CSV_SAMPLE}`);
  assert.equal(parsed.issue, undefined);
  assert.equal(parsed.result?.subjects.length, 5);
  assert.equal(parsed.result?.totalUnits, 15);
  assert.deepEqual(parsed.result?.subjects[3].meeting.days, ["TU", "TH"]);
  assert.match(parsed.result?.warnings.join(" ") || "", /repeated class entries/i);
});

test("parses bracketed day groups with 24-hour times and room labels", () => {
  const parsed = parseEnrollment(CLOCK_GROUP_SAMPLE);
  assert.equal(parsed.issue, undefined);
  assert.equal(parsed.result?.subjects.length, 5);
  const lecture = parsed.result?.subjects.find((subject) => /\(Lec\)/i.test(subject.title));
  assert.deepEqual(lecture?.meeting.days, ["MO", "WE"]);
  assert.equal(lecture?.meeting.room, "SV213");
});

test("parses pipe tables with compact 24-hour times and H as Thursday", () => {
  const parsed = parseEnrollment(PIPE_TABLE_SAMPLE);
  assert.equal(parsed.issue, undefined);
  assert.equal(parsed.result?.subjects.length, 4);
  assert.equal(parsed.result?.semester, "Term 1, AY 2026-2027");
  assert.equal(parsed.result?.block, "X22");
  assert.deepEqual(parsed.result?.subjects[1].meeting.days, ["MO", "TH"]);
  assert.equal(parsed.result?.subjects[0].meeting.start, "09:15");
});

test("parses labeled subject blocks with spaced day abbreviations", () => {
  const parsed = parseEnrollment(LABELED_SAMPLE);
  assert.equal(parsed.issue, undefined);
  assert.equal(parsed.result?.subjects.length, 4);
  assert.equal(parsed.result?.semester, "First Semester 2026-2027");
  assert.equal(parsed.result?.program, "BS Computer Science");
  assert.deepEqual(parsed.result?.subjects[0].meeting.days, ["TU", "TH"]);
  assert.equal(parsed.result?.subjects[1].meeting.end, "16:00");
});

test("parses sentence-style course schedules", () => {
  const parsed = parseEnrollment(INLINE_SAMPLE);
  assert.equal(parsed.issue, undefined);
  assert.equal(parsed.result?.subjects.length, 4);
  assert.equal(parsed.result?.totalUnits, 12);
  assert.deepEqual(parsed.result?.subjects[3].meeting.days, ["MO", "WE", "FR"]);
  assert.equal(parsed.result?.subjects[1].meeting.start, "14:00");
  assert.equal(parsed.result?.subjects[1].meeting.room, "CTC 302");
});

test("normalizes common twelve-hour meeting formats", () => {
  assert.deepEqual(parseFlexibleMeeting("T - 2-5pm Room 1911"), { days: ["TU"], start: "14:00", end: "17:00", room: "1911" });
  assert.deepEqual(parseFlexibleMeeting("W 10:30 to 1:30 Room 1911"), { days: ["WE"], start: "10:30", end: "13:30", room: "1911" });
});

test("explains a mismatch between parsed and declared units", () => {
  const parsed = parseEnrollment(ADAMSON_SAMPLE.replace("Total Units : 12", "Total Units : 13"));
  assert.match(parsed.result?.warnings.join(" ") || "", /subject or unit value may be missing/i);
  assert.match(parsed.result?.warnings.join(" ") || "", /official schedule/i);
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
