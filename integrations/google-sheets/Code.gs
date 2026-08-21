/* YIL Golden Jubilee Master Sheet connector.
 * Bind this script to no workbook. Set Script Properties YIL_SPREADSHEET_ID and
 * YIL_SYNC_SECRET, deploy as a web app executing as the owner, and keep access
 * restricted to the deployment account/domain where available.
 */

const FIRST_DATA_ROW = 5;
const RECORD_ID = "Permanent record ID — do not edit";

function doPost(event) {
  try {
    const request = JSON.parse((event && event.postData && event.postData.contents) || "{}");
    const properties = PropertiesService.getScriptProperties();
    if (!request.secret || request.secret !== properties.getProperty("YIL_SYNC_SECRET")) return json_({ ok: false, error: "Not authorised." });
    const book = SpreadsheetApp.openById(properties.getProperty("YIL_SPREADSHEET_ID"));
    if (request.action === "export") return withLock_(function () { return json_({ ok: true, master: exportMaster_(book) }); });
    if (request.action === "write" && Array.isArray(request.writes)) return withLock_(function () {
      request.writes.forEach(function (write) { applyWrite_(book, write); });
      SpreadsheetApp.flush();
      return json_({ ok: true, accepted: request.writes.length });
    });
    return json_({ ok: false, error: "Unsupported action." });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function withLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return json_({ ok: false, error: "The Master Sheet is busy. Try again." });
  try { return callback(); } finally { lock.releaseLock(); }
}

function exportMaster_(book) {
  const people = rows_(book, "1 People").map(function (r) { return { recordId: text_(r[RECORD_ID]), initials: text_(r["Short letters"]), fullName: text_(r["Full name"]), responsibility: text_(r["What they look after"]), employeeNumber: text_(r["Number they sign in with"]), phone: text_(r.Phone) || undefined, isCore: yes_(r["On the core committee"]), removed: yes_(r["Remove this person?"]) }; });
  const sections = rows_(book, "2 Sections").map(function (r) { return { recordId: text_(r[RECORD_ID]), number: Number(r["No."]), heading: text_(r.Heading), removed: yes_(r["Remove this heading?"]) }; });
  const jobs = rows_(book, "3 Jobs").map(function (r) { return { recordId: text_(r[RECORD_ID]), title: text_(r["The job"]), sectionHeading: text_(r["Under which heading"]), responsibleInitials: list_(r["Who is responsible"]), location: text_(r.Where), finishBy: text_(r["FINISH BY"]) || undefined, notes: text_(r.Notes) || undefined, removed: yes_(r["Remove this job?"]) }; });
  const categories = rows_(book, "4 Guest Categories").map(function (r) { return { recordId: text_(r[RECORD_ID]), name: text_(r.Category), removed: yes_(r["Remove this category?"]) }; });
  const groups = rows_(book, "5 Guest Groups").map(function (r) { return { recordId: text_(r[RECORD_ID]), name: text_(r.Group), primaryInitials: text_(r["Primary coordinator"]) || undefined, secondaryInitials: text_(r["Secondary coordinator"]) || undefined, removed: yes_(r["Remove this group?"]) }; });
  const guests = rows_(book, "6 Guests").map(function (r) { return { recordId: text_(r[RECORD_ID]), name: text_(r["Guest name"]), company: text_(r.Company) || undefined, categoryName: text_(r.Category), groupName: text_(r["Guest group"]) || undefined, country: text_(r["Country or origin"]) || undefined, preferredLanguage: text_(r["Preferred language"]), phone: text_(r["WhatsApp number"]) || undefined, email: text_(r.Email) || undefined, malur: yes_(r["Malur 15 Nov"]), taj: yes_(r["Taj 18 Nov"]), removed: yes_(r["Remove this guest?"]) }; });
  const agenda = rows_(book, "7 Group Agenda").map(function (r) { return { recordId: text_(r[RECORD_ID]), groupName: text_(r.Group), date: text_(r["Date YYYY-MM-DD"]), time: text_(r["Time HH:MM"]), title: text_(r["Agenda title"]), details: text_(r.Details) || undefined, removed: yes_(r["Remove this line?"]) }; });
  const travelPlans = rows_(book, "8 Travel Plans").map(function (r) { return { recordId: text_(r[RECORD_ID]), name: text_(r["Plan name"]), event: text_(r.Event), date: text_(r["Date YYYY-MM-DD"]), categoryNames: list_(r["Guest categories"]), mode: text_(r.Mode), routeName: text_(r["Route name"]), vehicleNumber: text_(r["Vehicle number"]) || undefined, driverName: text_(r["Driver name"]) || undefined, driverPhone: text_(r["Driver phone"]) || undefined, removed: yes_(r["Remove this plan?"]) }; });
  const travelStops = rows_(book, "9 Travel Stops").map(function (r) { return { recordId: text_(r[RECORD_ID]), travelPlanName: text_(r["Travel plan"]), order: Number(r["Stop order"]), time: text_(r["Time HH:MM"]), place: text_(r.Place), removed: yes_(r["Remove this stop?"]) }; });
  const hotels = rows_(book, "10 Hotels").map(function (r) { return { recordId: text_(r[RECORD_ID]), name: text_(r.Hotel), address: text_(r.Address) || undefined, roomsHeld: Number(r["Rooms held"] || 0), removed: yes_(r["Remove this hotel?"]) }; });
  const guest = { categories: categories, groups: groups, guests: guests, agenda: agenda, travelPlans: travelPlans, travelStops: travelStops, hotels: hotels };
  const content = JSON.stringify({ people: people, sections: sections, jobs: jobs, guest: guest });
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, content).map(function (b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, "0"); }).join("");
  return { source: "google-sheets", sourceVersion: "sheets-" + digest, people: people, sections: sections, jobs: jobs, guest: guest };
}

function applyWrite_(book, write) {
  const payload = write.payload || {};
  if (write.entityType === "guest") {
    if (write.operation === "archive") return archive_(book, "6 Guests", write.entityId, "Remove this guest?");
    return upsert_(book, "6 Guests", write.entityId, {
      "Guest name": payload.name, Company: payload.company, Category: payload.categoryName, "Guest group": payload.groupName,
      "Country or origin": payload.country, "Preferred language": title_(payload.preferredLanguage), "WhatsApp number": payload.phone,
      Email: payload.email, "Malur 15 Nov": yn_(payload.malur), "Taj 18 Nov": yn_(payload.taj), "Remove this guest?": "No"
    });
  }
  if (write.entityType === "group_agenda") {
    const ids = new Set((payload.items || []).map(function (item) { return String(item.recordId); }));
    archiveScope_(book, "7 Group Agenda", function (row) { return text_(row.Group) === text_(payload.groupName) && text_(row["Date YYYY-MM-DD"]) === text_(payload.date); }, ids, "Remove this line?");
    (payload.items || []).forEach(function (item) { upsert_(book, "7 Group Agenda", item.recordId, { Group: item.groupName, "Date YYYY-MM-DD": item.date, "Time HH:MM": item.time, "Agenda title": item.title, Details: item.details, "Remove this line?": "No" }); });
    return;
  }
  if (write.entityType === "travel_plan") {
    const plan = payload.plan || {};
    upsert_(book, "8 Travel Plans", plan.recordId, { "Plan name": plan.name, Event: title_(plan.event), "Date YYYY-MM-DD": plan.date, "Guest categories": (plan.categoryNames || []).join(", "), Mode: plan.mode, "Route name": plan.routeName, "Vehicle number": plan.vehicleNumber, "Driver name": plan.driverName, "Driver phone": plan.driverPhone, "Remove this plan?": "No" });
    const stopIds = new Set((payload.stops || []).map(function (stop) { return String(stop.recordId); }));
    archiveScope_(book, "9 Travel Stops", function (row) { return text_(row["Travel plan"]) === text_(plan.name); }, stopIds, "Remove this stop?");
    (payload.stops || []).forEach(function (stop) { upsert_(book, "9 Travel Stops", stop.recordId, { "Travel plan": stop.travelPlanName, "Stop order": stop.order, "Time HH:MM": stop.time, Place: stop.place, "Remove this stop?": "No" }); });
    return;
  }
  throw new Error("Unsupported write entity: " + write.entityType);
}

function rows_(book, sheetName) {
  const sheet = requireSheet_(book, sheetName);
  const lastColumn = sheet.getLastColumn();
  if (!lastColumn || sheet.getLastRow() < FIRST_DATA_ROW) return [];
  const headers = sheet.getRange(4, 1, 1, lastColumn).getDisplayValues()[0];
  const values = sheet.getRange(FIRST_DATA_ROW, 1, sheet.getLastRow() - FIRST_DATA_ROW + 1, lastColumn).getDisplayValues();
  return values.filter(function (row) { return row.some(function (cell) { return text_(cell); }); }).map(function (row) { const object = {}; headers.forEach(function (header, index) { object[header] = row[index]; }); return object; });
}

function upsert_(book, sheetName, recordId, values) {
  if (!recordId) throw new Error(sheetName + " write has no permanent record ID.");
  const sheet = requireSheet_(book, sheetName), headers = sheet.getRange(4, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const idColumn = headers.indexOf(RECORD_ID) + 1;
  if (!idColumn) throw new Error(sheetName + " has no permanent record ID column.");
  let rowNumber = findRow_(sheet, idColumn, recordId);
  if (!rowNumber) rowNumber = Math.max(FIRST_DATA_ROW, sheet.getLastRow() + 1);
  const row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  headers.forEach(function (header, index) { if (Object.prototype.hasOwnProperty.call(values, header)) row[index] = values[header] == null ? "" : values[header]; });
  row[idColumn - 1] = recordId;
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

function archive_(book, sheetName, recordId, removeHeader) {
  const sheet = requireSheet_(book, sheetName), headers = sheet.getRange(4, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const idColumn = headers.indexOf(RECORD_ID) + 1, removeColumn = headers.indexOf(removeHeader) + 1;
  const row = findRow_(sheet, idColumn, recordId);
  if (row && removeColumn) sheet.getRange(row, removeColumn).setValue("Yes");
}

function archiveScope_(book, sheetName, predicate, keepIds, removeHeader) {
  const sheet = requireSheet_(book, sheetName), headers = sheet.getRange(4, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const removeColumn = headers.indexOf(removeHeader) + 1;
  if (sheet.getLastRow() < FIRST_DATA_ROW) return;
  const values = sheet.getRange(FIRST_DATA_ROW, 1, sheet.getLastRow() - FIRST_DATA_ROW + 1, headers.length).getDisplayValues();
  values.forEach(function (cells, index) {
    const row = {}; headers.forEach(function (header, column) { row[header] = cells[column]; });
    if (cells.some(function (cell) { return text_(cell); }) && predicate(row) && !keepIds.has(text_(row[RECORD_ID]))) sheet.getRange(FIRST_DATA_ROW + index, removeColumn).setValue("Yes");
  });
}

function findRow_(sheet, idColumn, recordId) {
  if (!idColumn || sheet.getLastRow() < FIRST_DATA_ROW) return 0;
  const match = sheet.getRange(FIRST_DATA_ROW, idColumn, sheet.getLastRow() - FIRST_DATA_ROW + 1, 1).createTextFinder(String(recordId)).matchEntireCell(true).findNext();
  return match ? match.getRow() : 0;
}

function requireSheet_(book, name) { const sheet = book.getSheetByName(name); if (!sheet) throw new Error("Missing sheet: " + name); return sheet; }
function text_(value) { return value == null ? "" : String(value).trim(); }
function yes_(value) { return /^(yes|y|true|1)$/i.test(text_(value)); }
function yn_(value) { return value ? "Yes" : "No"; }
function title_(value) { const text = text_(value); return text ? text.charAt(0).toUpperCase() + text.slice(1) : ""; }
function list_(value) { return text_(value).split(",").map(function (part) { return part.trim(); }).filter(Boolean); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
