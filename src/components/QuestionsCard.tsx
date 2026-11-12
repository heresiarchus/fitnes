import { useEffect, useState } from "react";
import { useSheetsConfig } from "../db";
import { useI18n } from "../i18n";
import { fetchQuestions, type Question, sendAnswer } from "../sync/sheets";
import { Card } from "./Card";

/** Questions Claude left in the Google Sheet, answered right here. */
export function QuestionsCard() {
  const { t } = useI18n();
  const sheets = useSheetsConfig();
  const [qs, setQs] = useState<Question[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!sheets) return;
    const load = () => void fetchQuestions().then((q) => q && setQs(q));
    load();
    document.addEventListener("visibilitychange", load);
    return () => document.removeEventListener("visibilitychange", load);
  }, [sheets]);
  if (!qs.length) return null;

  async function answer(q: Question) {
    const a = (draft[q.id] ?? "").trim();
    if (!a) return;
    if (await sendAnswer(q.id, a)) setQs((list) => list.filter((x) => x.id !== q.id));
  }

  return (
    <Card icon="diary" title={t("q.title")} status={{ text: String(qs.length), tone: "todo" }}>
      {qs.map((q) => (
        <div className="ctx" key={q.id}>
          <b>{q.question}</b>
          <textarea className="short" maxLength={1000} placeholder={t("q.answerPh")} value={draft[q.id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value }))} />
          <div className="pill-row"><button type="button" className="primary compact" disabled={!(draft[q.id] ?? "").trim()} onClick={() => void answer(q)}>{t("q.send")}</button></div>
        </div>
      ))}
    </Card>
  );
}
