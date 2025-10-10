/* eslint-disable no-restricted-globals */
var __root = this;
var __previousDoGet = typeof __root.doGet === 'function' ? __root.doGet : null;
var TZ = 'Asia/Tokyo';

function doGet(e) {
  var params = (e && e.parameter) || {};
  var path = String(params.path || '').trim();

  if (path === 'made-summary') {
    var start = params.start || '';
    var end = params.end || '';
    var factory = params.factory || '';
    try {
      var payload = readMadeSummary_(start, end, factory ? String(factory) : '');
      return jsonResponse_(payload);
    } catch (error) {
      return jsonResponse_({ error: String(error && error.message ? error.message : error) });
    }
  }

  if (__previousDoGet) {
    return __previousDoGet(e);
  }

  return jsonResponse_({ error: 'Unsupported path: ' + path });
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body || {}))
    .setMimeType(ContentService.MimeType.JSON);
}

function readMadeSummary_(start, end, factory) {
  if (!start || !end) {
    throw new Error('start and end are required');
  }
  var startDate = parseDate_(start);
  var endDate = parseDate_(end);
  if (!startDate || !endDate) {
    throw new Error('invalid date range');
  }
  startDate = normalizeStartOfDay_(startDate);
  endDate = normalizeEndOfDay_(endDate);
  var factoryFilter = factory ? String(factory) : '';

  var ss = SpreadsheetApp.getActive();
  var actions = readSheetObjects_(ss, 'ACTIONS');
  var orders = readSheetObjects_(ss, 'ORDERS');
  var flavors = readSheetObjects_(ss, 'M_FLAVORS');
  var uses = readSheetObjects_(ss, 'M_USES');
  var factories = readSheetObjects_(ss, 'M_FACTORIES');

  var flavorMap = {};
  for (var i = 0; i < flavors.length; i++) {
    var fl = flavors[i];
    var flavorId = String(fl.flavor_id || '').trim();
    if (!flavorId) continue;
    flavorMap[flavorId] = fl;
  }

  var useMap = {};
  for (var j = 0; j < uses.length; j++) {
    var use = uses[j];
    var useCode = String(use.use_code || '').trim();
    if (!useCode) continue;
    useMap[useCode] = use;
  }

  var factoryMap = {};
  for (var k = 0; k < factories.length; k++) {
    var factoryRow = factories[k];
    var fCode = String(factoryRow.factory_code || '').trim();
    if (!fCode) continue;
    factoryMap[fCode] = factoryRow;
  }

  var orderIndex = {};
  var onsiteOrders = [];
  for (var n = 0; n < orders.length; n++) {
    var order = orders[n];
    var orderId = String(order.order_id || '').trim();
    var lotId = String(order.lot_id || '').trim();
    var flavorIdForOrder = String(order.flavor_id || '').trim();
    var orderKey = lotId ? lotId + '::' + flavorIdForOrder : '';
    if (orderKey) {
      orderIndex[orderKey] = order;
    }
    if (lotId && !flavorIdForOrder && !orderIndex[lotId + '::']) {
      orderIndex[lotId + '::'] = order;
    }
    if (orderId && orderId.indexOf('OS-') === 0) {
      onsiteOrders.push(order);
    }
  }

  var flatMap = {};
  var factoryAgg = {};

  function ensureFactoryEntry(factoryCode) {
    var key = factoryCode || '_';
    if (!factoryAgg[key]) {
      var factoryRow = factoryMap[factoryCode] || {};
      factoryAgg[key] = {
        factory_code: factoryCode,
        factory_name: factoryRow.factory_name || factoryCode || '',
        total_grams: 0,
        total_packs_equiv: 0,
        uses: {},
      };
    }
    return factoryAgg[key];
  }

  function ensureUseEntry(factoryEntry, useCode, useType) {
    var key = useCode || '_';
    if (!factoryEntry.uses[key]) {
      var useRow = useMap[useCode] || {};
      factoryEntry.uses[key] = {
        use_code: useCode,
        use_name: useRow.use_name || useCode || '',
        use_type: useType || useRow.use_type || '',
        total_grams: 0,
        total_packs_equiv: 0,
        items: {},
      };
    }
    return factoryEntry.uses[key];
  }

  function ensureFlavorEntry(useEntry, flavorId) {
    var key = flavorId || '_';
    if (!useEntry.items[key]) {
      var flavorRow = flavorMap[flavorId] || {};
      useEntry.items[key] = {
        flavor_id: flavorId,
        flavor_name: flavorRow.flavor_name || flavorId || '',
        grams: 0,
        packs_equiv: 0,
      };
    }
    return useEntry.items[key];
  }

  function accumulate(factoryCode, useCode, useType, flavorId, grams) {
    if (!grams) return;
    var flavorRow = flavorMap[flavorId] || {};
    var packToGram = toNumber_(flavorRow.pack_to_gram);
    var packsEquiv = packToGram ? grams / packToGram : 0;

    var flatKey = [factoryCode || '', useCode || '', flavorId || ''].join('::');
    if (!flatMap[flatKey]) {
      var useRow = useMap[useCode] || {};
      flatMap[flatKey] = {
        factory_code: factoryCode,
        factory_name: (factoryMap[factoryCode] && factoryMap[factoryCode].factory_name) || factoryCode || '',
        use_code: useCode,
        use_name: useRow.use_name || useCode || '',
        use_type: useType || useRow.use_type || '',
        flavor_id: flavorId,
        flavor_name: flavorRow.flavor_name || flavorId || '',
        grams: 0,
        packs_equiv: 0,
      };
    }
    var flatEntry = flatMap[flatKey];
    flatEntry.grams += grams;
    flatEntry.packs_equiv += packsEquiv;

    var factoryEntry = ensureFactoryEntry(factoryCode);
    factoryEntry.total_grams += grams;
    factoryEntry.total_packs_equiv += packsEquiv;

    var useEntry = ensureUseEntry(factoryEntry, useCode, useType || flatEntry.use_type);
    useEntry.total_grams += grams;
    useEntry.total_packs_equiv += packsEquiv;

    var flavorEntry = ensureFlavorEntry(useEntry, flavorId);
    flavorEntry.grams += grams;
    flavorEntry.packs_equiv += packsEquiv;
  }

  for (var a = 0; a < actions.length; a++) {
    var action = actions[a];
    if (String(action.type || '').trim() !== 'MADE_SPLIT') {
      continue;
    }
    var actionFactory = String(action.factory_code || '').trim();
    if (factoryFilter && actionFactory !== factoryFilter) {
      continue;
    }
    var flavorId = String(action.flavor_id || '').trim();
    if (!flavorId) continue;
    var lotId = String(action.lot_id || '').trim();
    var payload = parsePayload_(action.payload_json || action.payload);
    var manufacturedAt = payload && payload.manufactured_at ? parseDate_(payload.manufactured_at) : null;
    if (!manufacturedAt) {
      manufacturedAt = action.manufactured_at ? parseDate_(action.manufactured_at) : null;
    }
    if (!manufacturedAt) {
      manufacturedAt = parseDate_(action.ts);
    }
    if (!manufacturedAt || !isWithinRange_(manufacturedAt, startDate, endDate)) {
      continue;
    }
    var grams = payload ? toNumber_(payload.grams) : 0;
    if (!grams) {
      var packs = payload ? toNumber_(payload.packs) : 0;
      var packToGram = payload ? toNumber_(payload.pack_to_gram) : 0;
      if (!packToGram) {
        packToGram = toNumber_(action.pack_to_gram);
      }
      if (!packToGram && flavorMap[flavorId]) {
        packToGram = toNumber_(flavorMap[flavorId].pack_to_gram);
      }
      if (packs && packToGram) {
        grams = packs * packToGram;
      }
    }
    if (!grams) {
      grams = toNumber_(action.grams);
    }
    if (!grams) continue;
    var orderInfo = lotId ? (orderIndex[lotId + '::' + flavorId] || orderIndex[lotId + '::']) : null;
    var useCode = orderInfo ? String(orderInfo.use_code || '').trim() : '';
    var useType = orderInfo ? String(orderInfo.use_type || '').trim() : '';
    accumulate(actionFactory, useCode, useType, flavorId, grams);
  }

  for (var o = 0; o < onsiteOrders.length; o++) {
    var onsite = onsiteOrders[o];
    var onsiteFactory = String(onsite.factory_code || '').trim();
    if (factoryFilter && onsiteFactory !== factoryFilter) {
      continue;
    }
    var onsiteDate = parseDate_(onsite.ordered_at);
    if (!onsiteDate || !isWithinRange_(onsiteDate, startDate, endDate)) {
      continue;
    }
    var onsiteFlavor = String(onsite.flavor_id || '').trim();
    if (!onsiteFlavor) continue;
    var onsiteGrams = toNumber_(onsite.required_grams);
    if (!onsiteGrams) continue;
    var onsiteUseCode = String(onsite.use_code || '').trim();
    var onsiteUseType = String(onsite.use_type || '').trim();
    accumulate(onsiteFactory, onsiteUseCode, onsiteUseType, onsiteFlavor, onsiteGrams);
  }

  var rows = [];
  for (var key in flatMap) {
    if (Object.prototype.hasOwnProperty.call(flatMap, key)) {
      rows.push(flatMap[key]);
    }
  }
  rows.sort(function(a, b) {
    if (a.factory_code === b.factory_code) {
      if (a.use_code === b.use_code) {
        return a.flavor_name.localeCompare(b.flavor_name);
      }
      return a.use_code.localeCompare(b.use_code);
    }
    return a.factory_code.localeCompare(b.factory_code);
  });

  var factoriesResult = [];
  for (var fKey in factoryAgg) {
    if (!Object.prototype.hasOwnProperty.call(factoryAgg, fKey)) continue;
    var facEntry = factoryAgg[fKey];
    var usesResult = [];
    for (var uKey in facEntry.uses) {
      if (!Object.prototype.hasOwnProperty.call(facEntry.uses, uKey)) continue;
      var useEntry = facEntry.uses[uKey];
      var itemsResult = [];
      for (var flKey in useEntry.items) {
        if (!Object.prototype.hasOwnProperty.call(useEntry.items, flKey)) continue;
        itemsResult.push(useEntry.items[flKey]);
      }
      itemsResult.sort(function(a, b) {
        return b.grams - a.grams;
      });
      usesResult.push({
        use_code: useEntry.use_code,
        use_name: useEntry.use_name,
        use_type: useEntry.use_type,
        total_grams: useEntry.total_grams,
        total_packs_equiv: useEntry.total_packs_equiv,
        items: itemsResult,
      });
    }
    usesResult.sort(function(a, b) {
      if (a.use_code && b.use_code) {
        return a.use_code.localeCompare(b.use_code);
      }
      return b.total_grams - a.total_grams;
    });
    factoriesResult.push({
      factory_code: facEntry.factory_code,
      factory_name: facEntry.factory_name,
      total_grams: facEntry.total_grams,
      total_packs_equiv: facEntry.total_packs_equiv,
      uses: usesResult,
    });
  }
  factoriesResult.sort(function(a, b) {
    return a.factory_name.localeCompare(b.factory_name);
  });

  return {
    start: formatDate_(startDate),
    end: formatDate_(endDate),
    rows: rows,
    factories: factoriesResult,
  };
}

function readSheetObjects_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  var range = sheet.getDataRange();
  var values = range.getValues();
  if (!values.length) return [];
  var headers = values.shift();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var empty = true;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var header = headers[j];
      if (!header) continue;
      var value = row[j];
      if (value !== '' && value !== null && value !== undefined) {
        empty = false;
      }
      obj[String(header).trim()] = value;
    }
    if (!empty) {
      rows.push(obj);
    }
  }
  return rows;
}

function parsePayload_(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch (error) {
      return null;
    }
  }
  if (typeof payload === 'object') {
    return payload;
  }
  return null;
}

function parseDate_(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (typeof value === 'number' && !isNaN(value)) {
    if (value > 100000000000) {
      var fromMillis = new Date(value);
      if (!isNaN(fromMillis.getTime())) {
        return fromMillis;
      }
    }
    var serialBase = new Date(Date.UTC(1899, 11, 30));
    var fromSerial = new Date(serialBase.getTime() + Math.round(value * 86400000));
    if (!isNaN(fromSerial.getTime())) {
      return fromSerial;
    }
  }
  var text = String(value).trim();
  if (!text) return null;
  if (!isNaN(Number(text))) {
    return parseDate_(Number(text));
  }
  var parsed = new Date(text);
  if (isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function toNumber_(value) {
  if (typeof value === 'number') {
    if (isNaN(value)) return 0;
    return value;
  }
  if (typeof value === 'string') {
    var trimmed = value.trim();
    if (!trimmed) return 0;
    var parsed = Number(trimmed);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function normalizeStartOfDay_(date) {
  var d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

function normalizeEndOfDay_(date) {
  var d = new Date(date.getTime());
  d.setHours(23, 59, 59, 999);
  return d;
}

function isWithinRange_(date, start, end) {
  var time = date.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

function formatDate_(date) {
  return Utilities.formatDate(date, TZ, 'yyyy-MM-dd');
}
