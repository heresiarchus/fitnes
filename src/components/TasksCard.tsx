import { useState } from "react";
import { deleteItem, newId, saveItem, useItems } from "../db";
import { useI18n } from "../i18n";
import { ddmm, iso } from "../lib/date";
import { Head } from "./Head";

/** One-off tasks with a date the user sets (tests, doctor visits). */
export function TasksCard() {
  const { t } = useI18n();
  const tasks = useItems("task") ?? [];
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [showDone, setShowDone] = useState(false);
  const today = iso(new Date());
  const open = tasks.filter((x) => !x.doneDate).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const done = tasks.filter((x) => x.doneDate).sort((a, b) => (b.doneDate ?? "").localeCompare(a.doneDate ?? ""));
  const full = (d: string) => `${ddmm(d)}.${d.slice(0, 4)}`;

  async function add() {
    const v = title.trim();
    if (!v) return;
    await saveItem({ id: newId("task"), kind: "task", title: v, ...(due ? { dueDate: due } : {}), updatedAt: "" });
    setTitle(""); setDue("");
  }

  return (
    <section className="block">
      <Head title={t("task.title")} />
      {!open.length && !done.length && <p className="status" style={{ margin: 0 }}>{t("task.empty")}</p>}
      {open.length > 0 && (
        <ul className="tasks">
          {open.map((x) => (
            <li key={x.id}>
              <button type="button" className="task-check" aria-label={`${t("task.done")}: ${x.title}`} onClick={() => saveItem({ ...x, doneDate: today })} />
              <span className="task-text">
                <b>{x.title}</b>
                <small className={x.dueDate && x.dueDate < today ? "due late" : "due"}>{x.dueDate ? t("task.due", { d: full(x.dueDate) }) : t("task.noDue")}</small>
              </span>
              <label className="due-edit">
                <span>{x.dueDate ? ddmm(x.dueDate) : "+"}</span>
                <input type="date" aria-label={`${x.title}: ${t("form.date")}`} value={x.dueDate ?? ""} onChange={(e) => saveItem({ ...x, dueDate: e.target.value || undefined })} />
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="task-add">
        <input type="text" maxLength={120} placeholder={t("task.new")} aria-label={t("task.new")} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <input type="date" aria-label={t("form.date")} value={due} onChange={(e) => setDue(e.target.value)} />
        <button type="button" className="primary" onClick={add} disabled={!title.trim()}>{t("task.add")}</button>
      </div>
      {done.length > 0 && (
        <>
          <button type="button" className="link" onClick={() => setShowDone(!showDone)}>{t("task.showDone", { n: done.length })}</button>
          {showDone && (
            <ul className="tasks done">
              {done.map((x) => (
                <li key={x.id}>
                  <button type="button" className="task-check on" aria-label={x.title} onClick={() => saveItem({ ...x, doneDate: undefined })}>✓</button>
                  <span className="task-text"><b>{x.title}</b><small className="due">{t("task.doneOn", { d: full(x.doneDate!) })}</small></span>
                  <button type="button" className="link" onClick={() => deleteItem(x)}>{t("common.delete")}</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
