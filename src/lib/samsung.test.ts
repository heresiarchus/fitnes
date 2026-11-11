import { describe, expect, it } from "vitest";
import { applySamsung, emptySamsung, localTime, parseCsv, parseSamsungFile, parseSamsungSteps } from "./samsung";

const day = (iso: string) => String(Date.parse(iso + "T00:00:00Z"));

describe("Samsung Health step export", () => {
  it("prefers merged rows (source_type -2) and skips the metadata line", () => {
    const csv = [
      "com.samsung.shealth.step_daily_trend,6302002,13",
      "binning_data,update_time,create_time,source_pkg_name,count,speed,distance,calorie,deviceuuid,pkg_name,day_time,datauuid,source_type",
      `"[{""a"":1,""b"":2}]",2026-11-10 21:00:00.000,2026-11-10 08:00:00.000,com.sec.android.app.shealth,4200,1.2,3000,150,phone,com.sec.android.app.shealth,${day("2026-11-10")},u1,0`,
      `,2026-11-10 21:00:00.000,2026-11-10 08:00:00.000,com.sec.android.app.shealth,5100,1.2,3600,180,watch,com.sec.android.app.shealth,${day("2026-11-10")},u2,0`,
      `,2026-11-10 21:00:00.000,2026-11-10 08:00:00.000,com.sec.android.app.shealth,5300,1.2,3700,190,all,com.sec.android.app.shealth,${day("2026-11-10")},u3,-2`,
      `,2026-11-11 21:00:00.000,2026-11-11 08:00:00.000,com.sec.android.app.shealth,6100,1.2,4300,200,phone,com.sec.android.app.shealth,${day("2026-11-11")},u4,0`,
      `,2026-11-11 21:00:00.000,2026-11-11 08:00:00.000,com.sec.android.app.shealth,6900,1.2,4900,220,watch,com.sec.android.app.shealth,${day("2026-11-11")},u5,0`,
    ].join("\r\n");
    expect(parseSamsungSteps("﻿" + csv)).toEqual({ "2026-11-10": 5300, "2026-11-11": 6900 });
  });
  it("accepts prefixed column names and date strings", () => {
    const csv = "com.samsung.health.step_daily_trend.count,com.samsung.health.step_daily_trend.day_time\n7000,2026-11-12 00:00:00.000\n";
    expect(parseSamsungSteps(csv)).toEqual({ "2026-11-12": 7000 });
  });
  it("rejects files without step columns", () => {
    expect(() => parseSamsungSteps("a,b\n1,2\n")).toThrow();
  });
  it("parses quoted CSV cells", () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3')).toEqual([["a", "b,c", 'd "e"'], ["1", "2", "3"]]);
  });
});

describe("Samsung Health other export files", () => {
  const P = "com.samsung.health.";
  const exercise = [
    "com.samsung.shealth.exercise,6302002,5",
    `${P}exercise.start_time,${P}exercise.duration,${P}exercise.exercise_type,${P}exercise.time_offset,total_calorie`,
    "2026-11-10 06:30:00.000,1200000,1001,UTC+0200,80",
    "2026-11-10 16:00:00.000,900000,1001,UTC+0200,60",
    "2026-11-10 17:00:00.000,1800000,15003,UTC+0200,200",
    "2026-11-10 22:30:00.000,600000,1001,UTC+0200,40", // 00:30 local next day
  ].join("\n");
  const weight = `${P}weight.start_time,${P}weight.weight,${P}weight.time_offset\n2026-11-10 05:10:00.000,130.46,UTC+0200\n2026-11-10 18:00:00.000,131.2,UTC+0200\n`;
  const bp = `${P}blood_pressure.start_time,${P}blood_pressure.systolic,${P}blood_pressure.diastolic,${P}blood_pressure.pulse,${P}blood_pressure.time_offset\n` +
    "2026-11-10 05:00:00.000,132.0,84.0,70,UTC+0200\n2026-11-10 05:02:00.000,130.0,82.0,,UTC+0200\n2026-11-10 19:00:00.000,128.0,80.0,66,UTC+0200\n";

  it("converts UTC timestamps to the local day", () => {
    expect(localTime("2026-11-10 22:30:00.000", "UTC+0200")).toMatchObject({ date: "2026-11-11", hour: 0 });
    expect(localTime("2026-11-10 01:00:00.000", "UTC-0500")).toMatchObject({ date: "2026-11-09", hour: 20 });
    expect(localTime("nope", "")).toBeNull();
  });

  it("detects file kinds and applies only enabled sources", () => {
    const data = emptySamsung();
    expect(parseSamsungFile(exercise, data)).toBe("exercise");
    expect(parseSamsungFile(weight, data)).toBe("weight");
    expect(parseSamsungFile(bp, data)).toBe("bp");
    expect(() => parseSamsungFile("a,b\n1,2", data)).toThrow();

    const existing = { "2026-11-10": { date: "2026-11-10", updatedAt: "old", note: "keep", walkIntensity: "moderate" as const, noWeight: true as const } };
    const all = { steps: true, exercise: true, weight: true, bp: true, sleep: true };
    const r = applySamsung(existing, data, all, (k) => "name:" + k, new Date("2026-11-12T00:00:00Z"));
    const d10 = r.changes.find((d) => d.date === "2026-11-10")!;
    expect(d10).toMatchObject({
      note: "keep", walkMin: 35, walkIntensity: "moderate", cardioMin: 30, cardioWhat: "name:bike",
      weight: 130.5, weightCond: "morning",
      bp: { m1: { sys: 132, dia: 84, pulse: 70 }, m2: { sys: 130, dia: 82, pulse: null }, e1: { sys: 128, dia: 80, pulse: 66 } },
      updatedAt: "2026-11-12T00:00:00.000Z",
    });
    expect(d10.noWeight).toBeUndefined();
    expect(r.changes.find((d) => d.date === "2026-11-11")).toMatchObject({ walkMin: 10, walkIntensity: "light" });
    expect(r.counts).toEqual({ steps: 0, exercise: 2, weight: 1, bp: 1 });

    const onlyWalk = applySamsung(existing, data, { steps: true, exercise: true, weight: false, bp: false, sleep: false }, (k) => k);
    expect(onlyWalk.changes.find((d) => d.date === "2026-11-10")!.weight).toBeUndefined();
    expect(onlyWalk.counts.bp).toBe(0);

    // Re-import of the same data changes nothing.
    const map = Object.fromEntries(r.changes.map((d) => [d.date, d]));
    expect(applySamsung(map, data, all, (k) => "name:" + k).changes).toEqual([]);
  });
});
