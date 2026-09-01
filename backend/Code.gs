/**
 * Storage Base — backend. Apps Script bound to a Google Sheet.
 * Full data model + full CRUD, server-side access-code check, JSONP.
 * Built on the mechanism proven in the feasibility prototype (see
 * ../_prd/technical-spec-backend_and_scanning.md) — same JSONP pattern,
 * "Anyone" deployment access, atomic ID generation.
 *
 * One-time setup after pasting this in: Project Settings (gear icon) →
 * Script Properties → add a property named ACCESS_CODE with the shared
 * code as its value. Never hardcode the code in this file.
 */

const SHEET_NAME = 'Items';
const HEADERS = ['id', 'name', 'category', 'amount', 'unit', 'expiryDate', 'notes', 'removedAt'];

function doGet(e) {
  const action = e.parameter.action;
  let result;
  try {
    if (action === 'check-code') {
      result = { ok: checkCode_(e.parameter.code) };
    } else if (!checkCode_(e.parameter.code)) {
      result = { ok: false, error: 'invalid_code' };
    } else {
      switch (action) {
        case 'list':
          result = { ok: true, items: listItems_() };
          break;
        case 'history':
          result = { ok: true, items: listHistory_() };
          break;
        case 'get':
          result = withItemOrError_(getItem_(e.parameter.id));
          break;
        case 'create':
          result = createItem_(e.parameter);
          break;
        case 'update':
          result = updateItem_(e.parameter.id, e.parameter);
          break;
        case 'remove':
          result = removeItem_(e.parameter.id);
          break;
        case 'restore':
          result = restoreItem_(e.parameter.id);
          break;
        case 'delete':
          result = deleteItem_(e.parameter.id);
          break;
        default:
          result = { ok: false, error: 'unknown_action' };
      }
    }
  } catch (err) {
    result = { ok: false, error: String(err) };
  }
  return respond_(result, e.parameter.callback);
}

// The shared access code, validated server-side only — never checkable
// by reading client source, since GitHub Pages source is public.
function checkCode_(code) {
  const expected = PropertiesService.getScriptProperties().getProperty('ACCESS_CODE');
  return !!code && !!expected && code === expected;
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

// Atomic-ish ID generator: a script-level lock + a counter in Script
// Properties, so two near-simultaneous creates (from the two devices)
// can't collide. Server-generated on purpose — a client-side counter
// can't be trusted across two devices.
function generateId_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    let counter = parseInt(props.getProperty('ITEM_COUNTER') || '0', 10);
    counter += 1;
    props.setProperty('ITEM_COUNTER', String(counter));
    return 'ITEM-' + ('0000' + counter).slice(-4);
  } finally {
    lock.releaseLock();
  }
}

function rowToObj_(row) {
  const obj = {};
  HEADERS.forEach((h, i) => obj[h] = row[i]);
  // Sheets auto-detects a "looks like a date" string written into a cell
  // and silently converts the cell to a real Date value; getValues() then
  // hands back a JS Date instead of the plain YYYY-MM-DD string the
  // frontend expects (it does expiryDate.split('-')). Normalize back to
  // that shape using the spreadsheet's own timezone — the same timezone
  // Sheets used to interpret the string in the first place — so the
  // calendar date round-trips exactly.
  if (obj.expiryDate instanceof Date) {
    obj.expiryDate = Utilities.formatDate(
      obj.expiryDate,
      SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(),
      'yyyy-MM-dd'
    );
  }
  return obj;
}

function allItems_() {
  const data = getSheet_().getDataRange().getValues();
  data.shift(); // drop header row
  return data.filter(row => row[0]).map(rowToObj_);
}

function listItems_() {
  return allItems_().filter(item => !item.removedAt);
}

function listHistory_() {
  return allItems_()
    .filter(item => item.removedAt)
    .sort((a, b) => (a.removedAt < b.removedAt ? 1 : -1)); // reverse-chronological
}

function getItem_(id) {
  return allItems_().find(item => item.id === id) || null;
}

function withItemOrError_(item) {
  return item ? { ok: true, item } : { ok: false, error: 'not_found' };
}

function createItem_(p) {
  const name = (p.name || '').trim();
  if (!name) return { ok: false, error: 'name_required' };

  const amount = Number(p.amount);
  if (!p.amount || !isFinite(amount) || amount <= 0) return { ok: false, error: 'amount_invalid' };

  const unit = (p.unit || '').trim();
  if (!unit) return { ok: false, error: 'unit_required' };

  const id = generateId_();
  getSheet_().appendRow([
    id,
    name,
    (p.category || '').trim(),
    amount,
    unit,
    p.expiryDate || '',
    p.notes || '',
    ''
  ]);
  return { ok: true, item: getItem_(id) };
}

// Edits an existing item's fields in place — same validation as create,
// but id and removedAt are untouched (desktop-only per planning5, same
// as delete).
function updateItem_(id, p) {
  const name = (p.name || '').trim();
  if (!name) return { ok: false, error: 'name_required' };

  const amount = Number(p.amount);
  if (!p.amount || !isFinite(amount) || amount <= 0) return { ok: false, error: 'amount_invalid' };

  const unit = (p.unit || '').trim();
  if (!unit) return { ok: false, error: 'unit_required' };

  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, 2, 1, 6).setValues([[
        name,
        (p.category || '').trim(),
        amount,
        unit,
        p.expiryDate || '',
        p.notes || ''
      ]]);
      return { ok: true, item: getItem_(id) };
    }
  }
  return { ok: false, error: 'not_found' };
}

// Soft-remove: sets removedAt, keeps the row — what powers History.
function removeItem_(id) {
  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      if (data[i][7]) return { ok: false, error: 'already_removed' };
      sheet.getRange(i + 1, 8).setValue(new Date().toISOString()); // removedAt
      return { ok: true, item: getItem_(id) };
    }
  }
  return { ok: false, error: 'not_found' };
}

// Undo an accidental Remove — clears removedAt, item returns to active.
function restoreItem_(id) {
  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      if (!data[i][7]) return { ok: false, error: 'not_removed' };
      sheet.getRange(i + 1, 8).setValue('');
      return { ok: true, item: getItem_(id) };
    }
  }
  return { ok: false, error: 'not_found' };
}

// Hard delete: erases the row entirely, no History trace. For
// correcting mistaken entries only — never called from the mobile flow.
function deleteItem_(id) {
  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'not_found' };
}

// JSONP: fetch() from a page hosted outside script.google.com is
// unreliable against Apps Script's CORS behavior (see prototype log
// §3.4) — a <script> tag load sidesteps that. Calling the URL directly
// with no callback param still returns plain JSON for manual checks.
function respond_(result, callback) {
  const json = JSON.stringify(result);
  // Only allow safe identifier-shaped callback names, since this gets
  // echoed directly into the response's function-call syntax.
  if (callback && !/^[a-zA-Z0-9_]+$/.test(callback)) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'invalid_callback' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
