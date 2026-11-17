# Analytics plan (agreed 2026-11-17, not built yet)

Source: the owner's answers on the checklist page "Аналітика Fitnes"
(https://claude.ai/artifact/7L5hFvy2FfBkKjvW47xsfJ, collection `choices`).
Build only when the owner says so.

## Principle: main factors first, the rest on demand
- The home screen stays lean: today card, goals, habits, tasks. No secondary statistics there.
- Tapping a home card opens that metric's screen: headline number, chart with a period
  choice and 3–4 main statistics.
- Secondary statistics and links between metrics live behind buttons:
  "Детальніше про рух", "Детальніше про вагу", "Детальніше про сон",
  "Детальніше про здоров'я" (pulse, pressure, feeling, link table).
- Reports for the doctor and exports sit in Settings → Reports, never on the main screens.

## Metric screen (all metrics)
- A1 period: 7 d / 30 d / 90 d / 6 m / year / all / custom; arrows step to the previous or next
  period of the same length (year view: 2026 ← 2025).
- A2 change vs the previous period; A3 7-day moving average; A4 group by day/week/month;
  A5 goal line and % of days with the goal met; A8 by weekday; A9 missing days grey, not zero.
- A6 tap a point: a small popup with the value and a button to open that day (or that month
  in the year view), not an immediate jump.
- A7 events as stars per month, no text boxes: 1–2 episodes ★, 3–4 ★★, 5+ ★★★.

## Main vs secondary
| Area | Main (metric screen) | Secondary ("Детальніше …") |
|---|---|---|
| Steps | B1 average/median/sum, B3 streaks (goal and ≥7 000), B5 trend, B6 drop signal | B2 records, B4 step zones, B7 weekdays vs weekend/day type, B10 brisk-walk minutes (only if Samsung gives per-minute steps reliably; otherwise drop) |
| Activity | C1 minutes vs WHO 150–300 with a daily and a weekly goal | C2 active kcal, C3 distance with place-to-place equivalents (small fixed table, < 1 KB), C4 watch workouts (automatic), C5 walking efficiency, C6 active-day streak |
| Strength | D1 days/week vs WHO ≥2 | D3 personal records, D4 pain during exercises |
| Weight | E1 trend weight, E2 pace kg and %/week (0.5–1 kg green), E3 milestones −3/−5/−10 %, E4/N1 forecast date | E5 plateau (includes E6 weekend rhythm), E8 BMI, E9 best/worst week, N3 calorie-deficit estimate, N4 "+2 000 steps ≈ X kcal/week" |
| Sleep | F1 average and % nights ≥7 h, F3 regularity | F2 best sleep, F4 social jet lag, F5 sleep debt, F8 streaks |
| Resting pulse | G1 trend | G3 what moves it; G2 goes into the weekly summary |
| Pressure | H1 weekly summary by home protocol, H2 categories (ESC 2024) | H4 trend, H5 vs weight (≈ −1 mmHg/kg), H7 after a bad night, H8 episodes |
| Feeling | I1 feeling | I2 energy AM/PM, I3 pain and flags, I4 what precedes good days |
| Diary | — | K1 ratings, K2 vs sleep and steps |
| Links | — | in the matching "Детальніше" section: L1 steps→sleep, L3 sleep→weight, L4 steps→weight, L5 strength→weight/pulse, L7 sleep→feeling, L8 steps→feeling, L10 day type→all; L11 link table in "Детальніше про здоров'я" (≥21 days of data, rank correlation, "link ≠ cause") |

## Text conclusions
- M1 weekly summary on **Monday**, including M2 signals (steps −20 %, sleep < 6 h three nights,
  weight trend +1 kg/week, resting pulse +7, weekly pressure ≥135/85), M3 milestones and
  N2 (suggest +500 steps when the goal is met on 80 %+ of days for two weeks).
- M4 weight jump: point it out and give a possible cause (weekend, late sleep, normal spread);
  never an excuse.
- M6 30-day report for the doctor: in Settings → Reports only. M7: the same summaries to the Google Sheet.

## Also needed
- Height (for BMI): a field in Settings and a one-time prompt on first start when it is missing;
  it travels with the account, so it never asks again after an update or on another device.

## Rejected
B8, B9, B11, C7, D2, D5, E7, E10, F6, F7, H3, H6, J1, J2, J3, L2, L6, L9, M5.
