/**
 * Fitnes → Google Таблиця. Версія 2.
 *
 * Що робить:
 *  • приймає дані від застосунку й повністю переписує аркуші з тими самими назвами
 *    («Дні», «Звички», «Тиск» …). Рядки — від нових до старих;
 *  • веде аркуш «Питання»: Claude дописує туди питання, застосунок їх показує,
 *    а відповідь записує в стовпці answer / answeredAt;
 *  • прибирає порожній аркуш за замовчуванням («Аркуш1» / «Sheet1»).
 *
 * Як поставити або оновити:
 *  1. Таблиця → Розширення → Apps Script. Видали все, встав цей файл, «Зберегти».
 *  2. Вперше: Розгорнути → Нове розгортання → «Веб-застосунок»,
 *     виконувати як «Я», доступ «Усі». Скопіюй адресу …/exec у застосунок.
 *  3. Оновлення: Розгорнути → Керування розгортаннями → олівець →
 *     Версія: «Нова версія» → Розгорнути. Адреса лишається та сама.
 *
 * Адреса /exec — це ключ: хто її знає, може писати в ці аркуші й читати питання.
 */

var QUESTIONS = "Питання";
var Q_HEADER = ["id", "date", "question", "answer", "answeredAt"];

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === "questions") return json_({ ok: true, questions: openQuestions_() });
  return json_({ ok: true, app: "fitnes", version: 2 });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (data && data.format === "fitnes-answers") return json_({ ok: true, answered: saveAnswers_(data.answers || []) });
    if (!data || data.format !== "fitnes-sheets" || !data.sheets) return json_({ ok: false, error: "bad payload" });
    var written = 0;
    Object.keys(data.sheets).forEach(function (name) {
      writeSheet_(ss, name, data.sheets[name]);
      written += 1;
    });
    questionsSheet_();
    removeEmptyDefaultSheet_(ss);
    return json_({ ok: true, sheets: written, at: new Date().toISOString() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function writeSheet_(ss, name, t) {
  var width = t.header.length;
  var rows = [t.header].concat(t.rows || []);
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clearContents();
  if (sheet.getMaxRows() < rows.length) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length - sheet.getMaxRows());
  if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  // Dates, times and ids stay text so Sheets does not reformat them.
  (t.textCols || []).forEach(function (col) {
    sheet.getRange(1, col, sheet.getMaxRows(), 1).setNumberFormat("@");
  });
  sheet.getRange(1, 1, rows.length, width).setValues(rows);
  sheet.setFrozenRows(1);
}

function questionsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(QUESTIONS);
  if (!sheet) {
    sheet = ss.insertSheet(QUESTIONS);
    sheet.getRange(1, 1, 1, Q_HEADER.length).setValues([Q_HEADER]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Questions without an answer yet. A row without an id gets its row number as id. */
function openQuestions_() {
  var sheet = questionsSheet_();
  var values = sheet.getDataRange().getDisplayValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[2] || r[3]) continue;
    out.push({ id: r[0] || "row-" + (i + 1), date: r[1], question: r[2] });
  }
  return out;
}

function saveAnswers_(answers) {
  var sheet = questionsSheet_();
  var values = sheet.getDataRange().getDisplayValues();
  var n = 0;
  answers.forEach(function (a) {
    for (var i = 1; i < values.length; i++) {
      var id = values[i][0] || "row-" + (i + 1);
      if (id === a.id) {
        sheet.getRange(i + 1, 4, 1, 2).setValues([[a.answer, new Date().toISOString()]]);
        n += 1;
        break;
      }
    }
  });
  return n;
}

function removeEmptyDefaultSheet_(ss) {
  ["Аркуш1", "Sheet1", "Лист1"].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (sh && ss.getSheets().length > 1 && sh.getLastRow() === 0) ss.deleteSheet(sh);
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
