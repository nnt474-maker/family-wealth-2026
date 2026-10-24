/**
 * ============================================================================
 * ☁️ GOOGLE APPS SCRIPT V2 — ĐỒNG BỘ 2 VỢ CHỒNG & GOOGLE SHEET (TỰ ĐỘNG NHẬN SHEET)
 * ============================================================================
 * Ưu điểm bản V2:
 *   ✔ Tự động nhận diện đúng file Google Sheet hiện tại (`getActiveSpreadsheet()`)
 *     -> Không cần điền SHEET_ID thủ công, không bao giờ lỗi lệch ID!
 *   ✔ Nếu chạy độc lập, tự động tạo file Google Sheet mới trong Google Drive của bạn.
 *   ✔ Lưu trạng thái Cloud bằng PropertiesService siêu tốc (không bị giới hạn 50,000 ký tự/ô).
 *   ✔ Hỗ trợ cả Fetch lẫn JSONP (Vượt mọi rào cản CORS trên trình duyệt & điện thoại).
 * ============================================================================
 */

const CAT_MAP = {
  "Ăn uống": "Ăn uống", "Vui chơi": "vui chơi", "Công việc": "Công việc",
  "Học tập": "học tập", "Đồ dùng GĐ": "đồ dùng GĐ", "Phí tiện ích": "phí tiện ích",
  "Làm đẹp": "Làm đẹp", "Y tế": "Y tế", "Event": "event", "Nợ": "Nợ"
};

const PERSON_MAP = {
  "Chung": "Chung", "Chồng": "chồng", "Vợ": "vợ", "Subo": "SUBO", "Sugi": "SUGI"
};

function getTargetSpreadsheet() {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  try {
    const props = PropertiesService.getScriptProperties();
    const savedId = props.getProperty("AUTO_SHEET_ID");
    if (savedId) {
      return SpreadsheetApp.openById(savedId);
    }
    const created = SpreadsheetApp.create("2026 - FAMILY NOTE BOOK (Cloud Sync)");
    props.setProperty("AUTO_SHEET_ID", created.getId());
    return created;
  } catch (e) {
    return null;
  }
}

function saveCloudStateToProps(stateObj) {
  if (!stateObj) return;
  const props = PropertiesService.getScriptProperties();
  const raw = JSON.stringify(stateObj);
  const chunkSize = 8000;
  const totalChunks = Math.ceil(raw.length / chunkSize);
  const toSet = {
    "CLOUD_UPDATED_AT": new Date().toISOString(),
    "CLOUD_CHUNK_COUNT": String(totalChunks)
  };
  for (let i = 0; i < totalChunks; i++) {
    toSet["CLOUD_CHUNK_" + i] = raw.slice(i * chunkSize, (i + 1) * chunkSize);
  }
  props.setProperties(toSet, false);
}

function loadCloudStateFromProps() {
  const props = PropertiesService.getScriptProperties();
  const count = Number(props.getProperty("CLOUD_CHUNK_COUNT") || 0);
  if (!count) return { updated_at: null, cloud_state: null };
  let raw = "";
  for (let i = 0; i < count; i++) {
    raw += (props.getProperty("CLOUD_CHUNK_" + i) || "");
  }
  try {
    return {
      updated_at: props.getProperty("CLOUD_UPDATED_AT"),
      cloud_state: JSON.parse(raw)
    };
  } catch (e) {
    return { updated_at: null, cloud_state: null };
  }
}

function appendTxRow(ss, tx) {
  if (!ss || !tx || !tx.content) return null;
  try {
    const m = Number(tx.month || 10);
    const sheetName = "T" + m + " - DETAIL";
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange("B3:G3").setValues([["Ngày", "Nội dung chi tiêu", "Hạng mục", "Phân loại", "Số tiền", "Nguồn tiền"]]);
    }
    const colC = sheet.getRange("C4:C830").getValues();
    const colF = sheet.getRange("F4:F830").getValues();
    let targetRow = 4;
    for (let i = 0; i < colC.length; i++) {
      const cVal = colC[i][0];
      const fVal = colF[i][0];
      const cEmpty = cVal === null || cVal === undefined || String(cVal).trim() === "";
      const fEmpty = fVal === null || fVal === undefined || String(fVal).trim() === "";
      if (cEmpty && fEmpty) {
        targetRow = i + 4;
        break;
      }
    }
    sheet.getRange(targetRow, 2, 1, 6).setValues([[
      tx.date || new Date(),
      tx.content || "",
      CAT_MAP[tx.category] || tx.category || "Ăn uống",
      PERSON_MAP[tx.person] || tx.person || "Chung",
      Number(tx.amount || 0),
      tx.source || "Tiền mặt / Chuyển khoản"
    ]]);
    return targetRow;
  } catch (e) {
    return null;
  }
}

function updateTxRow(ss, tx) {
  if (!ss || !tx || !tx.row || Number(tx.row) < 4) return null;
  try {
    const m = Number(tx.month || 10);
    const sheet = ss.getSheetByName("T" + m + " - DETAIL");
    if (!sheet) return null;
    sheet.getRange(Number(tx.row), 2, 1, 6).setValues([[
      tx.date || new Date(),
      tx.content || "",
      CAT_MAP[tx.category] || tx.category || "Ăn uống",
      PERSON_MAP[tx.person] || tx.person || "Chung",
      Number(tx.amount || 0),
      tx.source || "Tiền mặt / Chuyển khoản"
    ]]);
    return Number(tx.row);
  } catch (e) {
    return null;
  }
}

function scanBankGmail() {
  try {
    // Lọc biến động số dư ngân hàng bắt đầu từ 01/11/2026 theo yêu cầu
    const q = '(from:vpbank OR from:bidv OR from:ncb OR from:uob OR "VPBank" OR "BIDV" OR "NCB" OR "Quoc Dan" OR "biến động số dư") after:2026/10/31';
    const threads = GmailApp.search(q, 0, 30);
    const blocks = [];
    const minTime = new Date("2026-11-01T00:00:00+07:00").getTime();
    for (let i = 0; i < threads.length; i++) {
      const msgs = threads[i].getMessages();
      for (let j = 0; j < msgs.length; j++) {
        const msg = msgs[j];
        if (msg.getDate().getTime() < minTime) continue;
        const dt = Utilities.formatDate(msg.getDate(), "GMT+7", "dd/MM/yyyy HH:mm");
        const body = msg.getPlainBody() || msg.getBody().replace(/<[^>]+>/g, " ");
        blocks.push("From: " + msg.getFrom() + "\nSubject: " + msg.getSubject() + "\nDate: " + dt + "\n" + body.substring(0, 1000));
      }
    }
    return blocks.join("\n---\n");
  } catch (e) {
    return "";
  }
}

function sendResponse(obj, e) {
  const json = JSON.stringify(obj);
  const cb = e && e.parameter && e.parameter.callback;
  if (cb) {
    return ContentService.createTextOutput(cb + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "pull";
    if (action === "scan_gmail") {
      return sendResponse({ ok: true, raw_text: scanBankGmail() }, e);
    }
    const stored = loadCloudStateFromProps();
    const ss = getTargetSpreadsheet();
    return sendResponse({
      ok: true,
      sheet_url: ss ? ss.getUrl() : null,
      updated_at: stored.updated_at,
      cloud_state: stored.cloud_state
    }, e);
  } catch (err) {
    return sendResponse({ ok: false, error: String(err) }, e);
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) ? e.postData.contents : "{}");
    const ss = getTargetSpreadsheet();
    if (payload.action === "edit_tx" && payload.transaction) {
      updateTxRow(ss, payload.transaction);
    } else if (payload.transaction) {
      appendTxRow(ss, payload.transaction);
    } else if (payload.content && payload.amount) {
      appendTxRow(ss, payload);
    }
    if (payload.transactions && Array.isArray(payload.transactions)) {
      payload.transactions.forEach(function(t) { appendTxRow(ss, t); });
    }
    if (payload.cloud_state) {
      saveCloudStateToProps(payload.cloud_state);
    }
    return sendResponse({
      ok: true,
      sheet_url: ss ? ss.getUrl() : null,
      updated_at: new Date().toISOString()
    }, e);
  } catch (err) {
    return sendResponse({ ok: false, error: String(err) }, e);
  }
}
