/**
 * Fitnes → Google Таблиця.
 *
 * Що робить: приймає дані від застосунку й повністю переписує аркуші з
 * тими самими назвами («Дні», «Звички», «Тиск» …). Інші аркуші, зокрема
 * «Питання», не чіпає.
 *
 * Як поставити (один раз):
 *   1. Відкрий свою таблицю → Розширення → Apps Script.
 *   2. Видали все в редакторі, встав цей файл, натисни «Зберегти».
 *   3. Розгорнути → Нове розгортання → тип «Веб-застосунок».
 *      Виконувати як: «Я». Доступ: «Усі».
 *   4. Дозволь доступ, скопіюй адресу, що закінчується на /exec.
 *   5. Встав її в застосунку: Ще → Google Таблиця.
 *
 * Адреса /exec — це ключ: хто її знає, може писати в ці аркуші.
 * Нікому її не показуй. Щоб відкликати — видали розгортання.
 */

function doGet() {
  return json_({ ok: true, app: "fitnes", hint: "POST data here" });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse(e.postData.contents);
    if (!data || data.format !== "fitnes-sheets" || !data.sheets) {
      return json_({ ok: false, error: "bad payload" });
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var written = 0;
    Object.keys(data.sheets).forEach(function (name) {
      var t = data.sheets[name];
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
      written += 1;
    });
    return json_({ ok: true, sheets: written, at: new Date().toISOString() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
