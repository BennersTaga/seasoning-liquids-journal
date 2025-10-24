var SHEET_MAP_ = {
  'ORDERS': 'order',
  'ACTIONS': 'actions',
  'MATERIAL_ACTIONS': 'material-actions',
  'STORAGE_LEDGER': 'storage-ledger',
};

function getBackupSpreadsheetId_() {
  var id = PropertiesService.getScriptProperties().getProperty('BACKUP_SPREADSHEET_ID');
  if (!id) throw new Error('BACKUP_SPREADSHEET_ID is not set');
  return id;
}

function openBackupSpreadsheet_() {
  try {
    return SpreadsheetApp.openById(getBackupSpreadsheetId_());
  } catch (e) {
    throw new Error('Failed to open backup spreadsheet: ' + e);
  }
}

function ensureSheet_(ss, name, headerRow) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (headerRow && sheet.getLastRow() === 0) {
    sheet.appendRow(headerRow);
  }
  return sheet;
}

function appendObjectRow_(sheet, headers, obj) {
  var row = headers.map(function(h) {
    var key = String(h || '').trim();
    if (!key && obj.hasOwnProperty('')) {
      return obj[''];
    }
    return obj.hasOwnProperty(key) ? obj[key] : '';
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function appendToPrimaryAndBackup_(ssPrimary, ssBackup, primarySheetName, backupSheetName, headers, rowObj) {
  var headerKeys = headers.map(function(h) { return String(h || '').trim(); });
  var primarySheet = ensureSheet_(ssPrimary, primarySheetName, headerKeys);
  appendObjectRow_(primarySheet, headerKeys, rowObj);

  try {
    var backupSheet = ensureSheet_(ssBackup, backupSheetName, headerKeys);
    appendObjectRow_(backupSheet, headerKeys, rowObj);
  } catch (error) {
    logBackupError_(primarySheetName, rowObj, error);
    return { backupError: String(error && error.message ? error.message : error) };
  }
  return { backupError: null };
}

function logBackupError_(primarySheetName, rowObj, error) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ensureSheet_(ss, 'BACKUP_ERRORS', ['ts', 'sheet', 'error', 'row_json']);
  sheet.appendRow([
    new Date(),
    primarySheetName,
    String(error && error.message ? error.message : error),
    JSON.stringify(rowObj || {}),
  ]);
}

function captureSheetStates_(ss) {
  var states = {};
  for (var name in SHEET_MAP_) {
    if (!SHEET_MAP_.hasOwnProperty(name)) continue;
    var sheet = ss.getSheetByName(name);
    states[name] = {
      lastRow: sheet ? sheet.getLastRow() : 0,
    };
  }
  return states;
}

function extractResponseInfo_(result) {
  if (result && typeof result.getContent === 'function' && typeof result.setContent === 'function') {
    var text = '';
    try {
      text = result.getContent();
    } catch (error) {
      text = '';
    }
    var body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch (error) {
      body = {};
    }
    return { body: body, textOutput: result };
  }
  if (result && typeof result === 'object') {
    return { body: result, textOutput: null };
  }
  if (typeof result === 'string') {
    try {
      return { body: JSON.parse(result), textOutput: null };
    } catch (error) {
      return { body: {}, textOutput: null };
    }
  }
  return { body: {}, textOutput: null };
}

function syncNewRowsToBackup_(ssPrimary, ssBackup, statesBefore) {
  var entries = collectNewRows_(ssPrimary, statesBefore);
  if (!entries.length) {
    return null;
  }
  var errors = [];
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var headerKeys = entry.headers;
    var backupSheet;
    try {
      backupSheet = ensureSheet_(ssBackup, entry.backupName, headerKeys);
    } catch (errorEnsure) {
      errors.push(formatBackupErrorMessage_(entry.primaryName, errorEnsure));
      logEntryRows_(entry, errorEnsure);
      continue;
    }
    for (var r = 0; r < entry.rows.length; r++) {
      var pair = buildRowPair_(headerKeys, entry.rows[r]);
      try {
        appendObjectRow_(backupSheet, headerKeys, pair.row);
      } catch (errorAppend) {
        errors.push(formatBackupErrorMessage_(entry.primaryName, errorAppend));
        logBackupError_(entry.primaryName, pair.log, errorAppend);
      }
    }
  }
  if (!errors.length) {
    return null;
  }
  return uniqueStrings_(errors).join('; ');
}

function collectNewRows_(ss, statesBefore) {
  var result = [];
  for (var name in SHEET_MAP_) {
    if (!SHEET_MAP_.hasOwnProperty(name)) continue;
    var sheet = ss.getSheetByName(name);
    if (!sheet) continue;
    var prev = statesBefore && statesBefore[name] ? statesBefore[name].lastRow : 0;
    var lastRow = sheet.getLastRow();
    var lastColumn = sheet.getLastColumn();
    if (lastColumn <= 0) continue;
    var headerRange = sheet.getRange(1, 1, 1, lastColumn);
    var headers = headerRange.getValues()[0].map(function(h) { return String(h || '').trim(); });
    var startRow = Math.max(prev + 1, 2);
    var newRowCount = lastRow - startRow + 1;
    if (newRowCount <= 0) continue;
    var values = sheet.getRange(startRow, 1, newRowCount, lastColumn).getValues();
    result.push({
      primaryName: name,
      backupName: SHEET_MAP_[name],
      headers: headers,
      rows: values,
    });
  }
  return result;
}

function buildRowPair_(headers, rowValues) {
  var row = {};
  var logObj = {};
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    var value = rowValues[i];
    var key = header;
    if (!key) {
      key = '';
    }
    row[key] = value;
    logObj[header || ('col' + (i + 1))] = value;
  }
  return { row: row, log: logObj };
}

function logEntryRows_(entry, error) {
  for (var i = 0; i < entry.rows.length; i++) {
    var pair = buildRowPair_(entry.headers, entry.rows[i]);
    logBackupError_(entry.primaryName, pair.log, error);
  }
}

function formatBackupErrorMessage_(sheetName, error) {
  var message = error && error.message ? String(error.message) : String(error);
  return sheetName + ': ' + message;
}

function uniqueStrings_(list) {
  var seen = {};
  var result = [];
  for (var i = 0; i < list.length; i++) {
    var item = String(list[i]);
    if (seen[item]) continue;
    seen[item] = true;
    result.push(item);
  }
  return result;
}

function logNewRowsAsBackupError_(ss, statesBefore, path, data, error) {
  var entries = collectNewRows_(ss, statesBefore);
  if (!entries.length) {
    logBackupError_(path || 'unknown', data || {}, error);
    return;
  }
  for (var i = 0; i < entries.length; i++) {
    logEntryRows_(entries[i], error);
  }
}
