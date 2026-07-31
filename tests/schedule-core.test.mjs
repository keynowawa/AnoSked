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
