import { describe, expect, it } from "vitest";
import { parseCsv, parseSamsungSteps } from "./samsung";

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
