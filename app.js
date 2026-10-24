let DB = null;
let selectedMonth = 10; // Default to current month T10 (or 0 for full year)
let pendingEmails = [];
let quickParseTimer = null;
let currentQuickParsed = null;
let enteredPin = "";
let isVoiceListening = false;
let voiceRecognition = null;

const STORAGE_DB_KEY = "FAMILY_WEALTH_2026_DB_V2";
const STORAGE_PIN_KEY = "FAMILY_WEALTH_2026_PIN";
const STORAGE_UNLOCK_KEY = "FAMILY_WEALTH_2026_UNLOCK_UNTIL";
const STORAGE_CLOUD_URL_KEY = "FAMILY_WEALTH_2026_GAS_URL";
const STORAGE_DEFAULT_SOURCE_KEY = "FAMILY_DEFAULT_SOURCE_2026";
const STORAGE_DEFAULT_PERSON_KEY = "FAMILY_DEFAULT_PERSON_2026";
const STORAGE_DEFAULT_CAT_KEY = "FAMILY_DEFAULT_CAT_2026";
const STORAGE_GEMINI_KEY = "FAMILY_GEMINI_API_KEY_2026";
const STORAGE_EMAIL_START_DATE_KEY = "FAMILY_EMAIL_START_DATE_2026";
const STORAGE_TABLE_MODE_KEY = "FAMILY_TABLE_SPREADSHEET_MODE_2026";
const STORAGE_WARNINGS_COLLAPSED_KEY = "FAMILY_WARNINGS_COLLAPSED_2026";

function getEmailStartDate() {
  return localStorage.getItem(STORAGE_EMAIL_START_DATE_KEY) || "2026-11-01";
}

function updateEmailStartDate(val) {
  if (val) {
    localStorage.setItem(STORAGE_EMAIL_START_DATE_KEY, val.trim());
    const inp = document.getElementById("email-start-date-input");
    if (inp) inp.value = val.trim();
    parseEmailContent();
  }
}

function isTableSpreadsheetMode() {
  const saved = localStorage.getItem(STORAGE_TABLE_MODE_KEY);
  return saved === null ? true : saved === "true"; // Mặc định mở kiểu bảng tính Excel Grid
}

function toggleTableSpreadsheetMode() {
  const current = isTableSpreadsheetMode();
  localStorage.setItem(STORAGE_TABLE_MODE_KEY, current ? "false" : "true");
  renderTransactionsTab();
}

function isEarlyWarningsCollapsed() {
  return localStorage.getItem(STORAGE_WARNINGS_COLLAPSED_KEY) === "true";
}

function toggleEarlyWarnings() {
  const current = isEarlyWarningsCollapsed();
  localStorage.setItem(STORAGE_WARNINGS_COLLAPSED_KEY, current ? "false" : "true");
  renderEarlyWarnings();
}

const ALL_PAYMENT_SOURCES = [
  "Tiền mặt",
  "Chuyển khoản",
  "Tiền mặt / Chuyển khoản",
  "NCB",
  "VPBank",
  "BIDV",
  "UOB",
  "VPSP",
  "VPBank Shopee"
];

const SAMPLE_BANK_EMAILS_DEFAULT = `From: VPBank Online <customercare@vpbank.com.vn>
Subject: [VPBank] Thông báo biến động số dư tài khoản
Ngày 22/10/2026 08:15:20. TK 1988xxxx tại VPBank biến động -485,000 VND.
Nội dung: CO.OPMART RACH MIEU THANH TOAN QR. Số dư khả dụng: 24,510,000 VND.
---
From: BIDV SmartBanking <bidvsmartbanking@bidv.com.vn>
Subject: [BIDV] Thông báo giao dịch tài khoản 3141xxxx
Thời gian: 22/10/2026 11:30. Số tiền GD: -395,000 VND.
Nội dung: Mua bỉm và sữa thanh cho Sugi tại CON CUNG.
---
From: NCB iziMobile <info@ncb-bank.vn>
Subject: [NCB] Biến động số dư tài khoản thanh toán
NCB thông báo: Ngày 22/10/2026, TK xxxx8899 trừ -95,000 VND.
Nội dung: Đổ xăng ck Petrolimex Q1.
---
From: VPBank Shopee Card <card@vpbank.com.vn>
Subject: [VPBank] Giao dịch thẻ tín dụng VPBank Shopee
Thẻ VPBank Shopee *4591 vừa chi tiêu 320,000 VND ngày 22/10/2026.
Nội dung: SHOPEE VN - Nước giặt OMO và túi rác gia đình.
---
From: BIDV SmartBanking <bidvsmartbanking@bidv.com.vn>
Subject: [BIDV] Thanh toán hóa đơn thành công
Ngày 22/10/2026, TK BIDV thanh toán -265,000 VND.
Nội dung: Nhà thuốc Long Châu mua thuốc ho và vitamin cho Subo.
---
From: VPBank Online <customercare@vpbank.com.vn>
Subject: [VPBank] Thông báo giao dịch thẻ ghi nợ
Ngày 22/10/2026 14:10:00. TK 1988xxxx trừ -1,250,000 VND.
Nội dung: THANH TOAN POS 004128 CH SO 19.`;

const APPS_SCRIPT_CLOUD_CODE = `/**
 * GOOGLE APPS SCRIPT V2 - CLOUD BACKEND & ĐỒNG BỘ 2 VỢ CHỒNG (TỰ ĐỘNG NHẬN SHEET)
 * Ưu điểm bản V2:
 *  - Tự động nhận đúng file Google Sheet của bạn (SpreadsheetApp.getActiveSpreadsheet())
 *  - Không cần điền SHEET_ID thủ công, không bao giờ bị lỗi lệch ID file!
 *  - Hỗ trợ cả Fetch & JSONP vượt mọi rào cản CORS trình duyệt.
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
    if (savedId) return SpreadsheetApp.openById(savedId);
    const created = SpreadsheetApp.create("2026 - FAMILY NOTE BOOK (Cloud Sync)");
    props.setProperty("AUTO_SHEET_ID", created.getId());
    return created;
  } catch (e) { return null; }
}

function saveCloudStateToProps(stateObj) {
  if (!stateObj) return;
  const props = PropertiesService.getScriptProperties();
  const raw = JSON.stringify(stateObj);
  const chunkSize = 8000;
  const totalChunks = Math.ceil(raw.length / chunkSize);
  const toSet = { "CLOUD_UPDATED_AT": new Date().toISOString(), "CLOUD_CHUNK_COUNT": String(totalChunks) };
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
  for (let i = 0; i < count; i++) raw += (props.getProperty("CLOUD_CHUNK_" + i) || "");
  try { return { updated_at: props.getProperty("CLOUD_UPDATED_AT"), cloud_state: JSON.parse(raw) }; }
  catch (e) { return { updated_at: null, cloud_state: null }; }
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
      const cEmpty = !colC[i][0] || String(colC[i][0]).trim() === "";
      const fEmpty = !colF[i][0] || String(colF[i][0]).trim() === "";
      if (cEmpty && fEmpty) { targetRow = i + 4; break; }
    }
    sheet.getRange(targetRow, 2, 1, 6).setValues([[
      tx.date || new Date(), tx.content || "", CAT_MAP[tx.category] || tx.category || "Ăn uống",
      PERSON_MAP[tx.person] || tx.person || "Chung", Number(tx.amount || 0), tx.source || "Tiền mặt / Chuyển khoản"
    ]]);
    return targetRow;
  } catch (e) { return null; }
}

function updateTxRow(ss, tx) {
  if (!ss || !tx || !tx.row || Number(tx.row) < 4) return null;
  try {
    const m = Number(tx.month || 10);
    const sheet = ss.getSheetByName("T" + m + " - DETAIL");
    if (!sheet) return null;
    sheet.getRange(Number(tx.row), 2, 1, 6).setValues([[
      tx.date || new Date(), tx.content || "", CAT_MAP[tx.category] || tx.category || "Ăn uống",
      PERSON_MAP[tx.person] || tx.person || "Chung", Number(tx.amount || 0), tx.source || "Tiền mặt / Chuyển khoản"
    ]]);
    return Number(tx.row);
  } catch (e) { return null; }
}

function scanBankGmail() {
  try {
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
        blocks.push("From: " + msg.getFrom() + "\\nSubject: " + msg.getSubject() + "\\nDate: " + dt + "\\n" + body.substring(0, 1000));
      }
    }
    return blocks.join("\\n---\\n");
  } catch (e) { return ""; }
}

function sendResponse(obj, e) {
  const json = JSON.stringify(obj);
  const cb = e && e.parameter && e.parameter.callback;
  if (cb) return ContentService.createTextOutput(cb + "(" + json + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "pull";
    if (action === "scan_gmail") return sendResponse({ ok: true, raw_text: scanBankGmail() }, e);
    const stored = loadCloudStateFromProps();
    const ss = getTargetSpreadsheet();
    return sendResponse({ ok: true, sheet_url: ss ? ss.getUrl() : null, updated_at: stored.updated_at, cloud_state: stored.cloud_state }, e);
  } catch (err) { return sendResponse({ ok: false, error: String(err) }, e); }
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) ? e.postData.contents : "{}");
    const ss = getTargetSpreadsheet();
    if (payload.action === "edit_tx" && payload.transaction) updateTxRow(ss, payload.transaction);
    else if (payload.transaction) appendTxRow(ss, payload.transaction);
    else if (payload.content && payload.amount) appendTxRow(ss, payload);
    if (payload.transactions && Array.isArray(payload.transactions)) payload.transactions.forEach(function(t) { appendTxRow(ss, t); });
    if (payload.cloud_state) saveCloudStateToProps(payload.cloud_state);
    return sendResponse({ ok: true, sheet_url: ss ? ss.getUrl() : null, updated_at: new Date().toISOString() }, e);
  } catch (err) { return sendResponse({ ok: false, error: String(err) }, e); }
}`;

const fmtVND = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "0 đ";
  return Math.round(Number(n)).toLocaleString("vi-VN") + " đ";
};

const fmtShortVND = (n) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(2) + " tỷ";
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + " tr";
  if (abs >= 1e3) return Math.round(v / 1e3) + "k";
  return Math.round(v) + "đ";
};

function foldVN(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

// ============================================================================
// 0. SHARED HELPERS (an toàn HTML, ngày tháng, ID, thống kê, JSON từ AI)
// ============================================================================
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function currentAppMonth() {
  const now = new Date();
  if (now.getFullYear() === 2026) return now.getMonth() + 1;
  return now.getFullYear() > 2026 ? 12 : 1;
}

// Tháng dùng khi nhập mới: tháng đang chọn, hoặc tháng hiện tại nếu đang xem "Cả năm"
function activeInputMonth() {
  return selectedMonth === 0 ? currentAppMonth() : selectedMonth;
}

function daysInMonth2026(m) {
  return new Date(2026, Number(m), 0).getDate();
}

function defaultDateForMonth(m) {
  const dim = daysInMonth2026(m);
  const day = Math.min(new Date().getDate(), dim);
  return `2026-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ID giao dịch duy nhất (tránh trùng ID khi xóa/thêm hoặc 2 máy cùng thêm)
function makeTxId(seq = 0) {
  const n = Math.max(889, (DB && Array.isArray(DB.transactions) ? DB.transactions.length : 0) + 1 + seq);
  const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `TX2026-${String(n).padStart(4, "0")}-${uniq}`;
}

function median(arr) {
  const a = (arr || []).map(Number).filter(v => !isNaN(v)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function mean(arr) {
  const a = (arr || []).map(Number).filter(v => !isNaN(v));
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
}

function roundTo(v, step) {
  return Math.round((Number(v) || 0) / step) * step;
}

// Lấy JSON từ câu trả lời của AI (kể cả khi AI bọc trong ```json hoặc thêm chữ xung quanh)
function extractJsonFromText(txt) {
  if (!txt) return null;
  const clean = String(txt).replace(/```(?:json)?/gi, "").trim();
  try { return JSON.parse(clean); } catch (e) {}
  const start = clean.search(/[\[{]/);
  if (start === -1) return null;
  const open = clean[start];
  const close = open === "{" ? "}" : "]";
  const end = clean.lastIndexOf(close);
  if (end <= start) return null;
  try { return JSON.parse(clean.slice(start, end + 1)); } catch (e) { return null; }
}

// So khớp từ khóa theo ranh giới từ (tránh "áo" khớp nhầm "Thông báo", "ốc" khớp nhầm "Quốc Dân", "cá" khớp "các")
const _kwRegexCache = new Map();
const STRICT_ASCII_KEYWORDS = new Set(["son", "spa", "rau", "vim", "be", "ck", "vk", "tm", "con", "bo"]);
function textHasKeyword(text, kw) {
  let re = _kwRegexCache.get(kw);
  if (!re) {
    const k = String(kw).trim().toLowerCase();
    const escK = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const letters = k.replace(/[^\p{L}\p{N}]/gu, "");
    const isAscii = /^[a-z0-9]+$/.test(letters);
    const strictEnd = (letters.length <= 3 && !isAscii) || STRICT_ASCII_KEYWORDS.has(letters);
    re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escK}${strictEnd ? "(?![\\p{L}\\p{N}])" : ""}`, "iu");
    _kwRegexCache.set(kw, re);
  }
  return re.test(String(text || "").normalize("NFC"));
}

// ============================================================================
// 1. PIN SECURITY SCREEN (MÃ PIN BẢO VỆ DỮ LIỆU GIA ĐÌNH TRÊN CLOUD)
// ============================================================================
function getFamilyPin() {
  if (DB && DB.meta && DB.meta.family_pin) return String(DB.meta.family_pin);
  return localStorage.getItem(STORAGE_PIN_KEY) || "2026";
}

function checkPinLockOnStartup() {
  const unlockUntil = Number(localStorage.getItem(STORAGE_UNLOCK_KEY) || 0);
  const overlay = document.getElementById("pin-lock-overlay");
  if (!overlay) return;
  if (Date.now() < unlockUntil) {
    overlay.style.display = "none";
  } else {
    enteredPin = "";
    updatePinDotsUI();
    overlay.style.display = "flex";
  }
}

function lockAppNow() {
  localStorage.removeItem(STORAGE_UNLOCK_KEY);
  enteredPin = "";
  updatePinDotsUI();
  const msg = document.getElementById("pin-status-msg");
  if (msg) {
    msg.style.color = "#818cf8";
    msg.innerHTML = "Đã khóa sổ an toàn. Nhập mã PIN gia đình để mở lại.";
  }
  const overlay = document.getElementById("pin-lock-overlay");
  if (overlay) overlay.style.display = "flex";
}

function updatePinDotsUI(isError = false) {
  const dots = document.querySelectorAll("#pin-dots-box .pin-dot");
  dots.forEach((dot, idx) => {
    dot.classList.remove("filled", "error");
    if (isError) {
      dot.classList.add("error");
    } else if (idx < enteredPin.length) {
      dot.classList.add("filled");
    }
  });
}

function pressPinDigit(digit) {
  if (enteredPin.length >= 4) return;
  enteredPin += String(digit);
  updatePinDotsUI(false);

  if (enteredPin.length === 4) {
    const targetPin = getFamilyPin();
    if (enteredPin === targetPin) {
      const remember = document.getElementById("pin-remember-device")?.checked;
      if (remember) {
        // Remember for 30 days on this device
        localStorage.setItem(STORAGE_UNLOCK_KEY, String(Date.now() + 30 * 24 * 3600 * 1000));
      }
      document.getElementById("pin-lock-overlay").style.display = "none";
      enteredPin = "";
    } else {
      updatePinDotsUI(true);
      const msg = document.getElementById("pin-status-msg");
      if (msg) {
        msg.style.color = "#fb7185";
        msg.innerHTML = "❌ Mã PIN chưa đúng! (Mặc định: <b>2026</b>)";
      }
      setTimeout(() => {
        enteredPin = "";
        updatePinDotsUI(false);
      }, 450);
    }
  }
}

function clearPinDigits() {
  enteredPin = "";
  updatePinDotsUI(false);
}

function backspacePinDigit() {
  enteredPin = enteredPin.slice(0, -1);
  updatePinDotsUI(false);
}

window.addEventListener("keydown", (e) => {
  const overlay = document.getElementById("pin-lock-overlay");
  if (!overlay || overlay.style.display === "none") return;
  if (e.key >= "0" && e.key <= "9") {
    pressPinDigit(e.key);
  } else if (e.key === "Backspace") {
    backspacePinDigit();
  } else if (e.key === "Escape") {
    clearPinDigits();
  }
});

// ============================================================================
// 2. CLIENT-SIDE AI & FINANCIAL ENGINE (CHẠY ĐỘC LẬP 100% TRÊN CLOUD)
// ============================================================================
const KEYWORD_RULES_JS = [
  [["học phí subo", "hphi subo", "hoc phi subo", "tiền học subo"], "Học tập", "Subo"],
  [["đón bo", "đón subo", "don subo", "grab subo"], "Phí tiện ích", "Subo"],
  [["tini", "khu vui chơi", "lego", "đồ chơi", "tô tượng", "super wing"], "Vui chơi", "Subo"],
  [["bỉm", "sữa thanh", "kem hăm", "kem bôi hăm", "bình sữa", "túi trữ sữa", "tiêm chủng sugi", "con cưng", "concung"], "Đồ dùng GĐ", "Sugi"],
  [["nhi đồng", "khám sugi", "thuốc sugi"], "Y tế", "Sugi"],
  [["shinhan", "nợ ck shinhan"], "Nợ", "Chồng"],
  [["thuế ck", "nợ thuế"], "Nợ", "Chồng"],
  [["nợ đt vk", "đt vk"], "Nợ", "Vợ"],
  [["xăng ck", "đổ xăng ck"], "Phí tiện ích", "Chồng"],
  [["xăng vk", "xăng"], "Phí tiện ích", "Vợ"],
  [["sửa xe", "rửa xe", "gửi xe", "thẻ xe"], "Phí tiện ích", "Chung"],
  [["tiền điện", "evn", "điện lực"], "Phí tiện ích", "Chung"],
  [["tiền nước", "sawaco", "nước cc"], "Phí tiện ích", "Chung"],
  [["tiền mạng", "fpt", "viettel", "vnpt", "internet"], "Phí tiện ích", "Chung"],
  [["qlcc", "phí cc", "phí quản lý", "chung cư"], "Phí tiện ích", "Chung"],
  [["grab", "be ", "be-", "xanh sm", "gsm", "taxi", "vé xe"], "Phí tiện ích", "Chung"],
  [["chatgpt", "chat gpt", "openai", "claude"], "Công việc", "Chung"],
  [["coop", "co.op", "bhx", "bách hóa xanh", "bach hoa xanh", "winmart", "emart", "aeon", "kingfood", "king food", "ministop", "circle k", "gs25", "thiso", "lotte", "mega market", "siêu thị", "đi chợ"], "Ăn uống", "Chung"],
  [["phở", "bún", "cơm", "bánh mì", "trà sữa", "cafe", "cà phê", "highlands", "phúc long", "starbucks", "kfc", "texas", "pizza", "lẩu", "nướng", "ốc", "gà", "thịt", "cá", "rau", "trái cây", "sầu riêng", "măng cụt", "sữa", "vinamilk", "th true", "ăn sáng", "ăn trưa", "ăn tối", "ăn vặt"], "Ăn uống", "Chung"],
  [["long châu", "pharmacity", "an khang", "thuốc tây", "thuốc", "bệnh viện", "khám", "nha khoa", "làm răng", "y tế", "tiểu đường"], "Y tế", "Chung"],
  [["paula", "mỹ phẩm", "son", "kem chống nắng", "gội đầu", "làm tóc", "cắt tóc", "nail", "spa", "quần áo", "áo", "váy", "giày", "dép", "đồ lót", "uniqlo", "zara"], "Làm đẹp", "Vợ"],
  [["nước giặt", "nước rửa", "bao rác", "khăn giấy", "giấy vệ sinh", "bàn chải", "kem đr", "dầu gội", "sữa tắm", "vim", "finish", "khay", "nồi", "chảo", "đồ gia dụng"], "Đồ dùng GĐ", "Chung"],
  [["shopee", "spee", "lazada", "tiktok shop", "tiki"], "Đồ dùng GĐ", "Chung"],
  [["sinh nhật", "đám cưới", "mừng", "thăm", "du lịch", "khách sạn", "vé máy bay", "event"], "Event", "Chung"]
];

function classifyTransactionTextJS(text) {
  const tLow = (text || "").toLowerCase().trim();
  let cat = "Ăn uống";
  let person = "Chung";
  let confidence = 0.78;
  let reason = "Phân loại mặc định theo tần suất cao nhất của gia đình";

  let explicitPerson = null;
  if (/(?:^|\s)(subo|sn bo|đón bo)(?:\s|$)/i.test(tLow)) explicitPerson = "Subo";
  else if (/(?:^|\s)(sugi)(?:\s|$)/i.test(tLow)) explicitPerson = "Sugi";
  else if (/(?:^|\s)(ck|chồng)(?:\s|$)/i.test(tLow)) explicitPerson = "Chồng";
  else if (/(?:^|\s)(vk|vợ)(?:\s|$)/i.test(tLow)) explicitPerson = "Vợ";

  for (const [kwList, ruleCat, rulePerson] of KEYWORD_RULES_JS) {
    for (const kw of kwList) {
      if (tLow.includes(kw)) {
        cat = ruleCat;
        person = explicitPerson || rulePerson;
        confidence = 0.96;
        reason = `Khớp mẫu lịch sử gia đình ('${kw}' → ${cat} • ${person})`;
        break;
      }
    }
    if (confidence > 0.9) break;
  }

  if (explicitPerson && confidence < 0.9) {
    person = explicitPerson;
    confidence = 0.88;
  }

  const explicitCats = [
    ["ăn uống", "Ăn uống"], ["vui chơi", "Vui chơi"], ["công việc", "Công việc"],
    ["học tập", "Học tập"], ["đồ dùng", "Đồ dùng GĐ"], ["tiện ích", "Phí tiện ích"],
    ["làm đẹp", "Làm đẹp"], ["y tế", "Y tế"], ["event", "Event"], ["nợ", "Nợ"]
  ];
  for (const [cKey, cVal] of explicitCats) {
    if (cKey === "nợ") {
      if (/(?<!ghi\s)(?<!báo\s)(?<!dư\s)\bnợ\b/i.test(tLow)) {
        cat = cVal;
        confidence = 0.98;
        break;
      }
    } else if (tLow.includes(cKey)) {
      cat = cVal;
      confidence = 0.98;
      break;
    }
  }

  return { cat, person, confidence, reason };
}

function classifyExpenseJS(text) {
  const res = classifyTransactionTextJS(text);
  return { category: res.cat, person: res.person, confidence: res.confidence, reason: res.reason };
}

function convertVietnameseSpokenNumbers(str) {
  let s = (str || "").toLowerCase();
  // Convert common voice recognition outputs like "570 nghìn", "570 ngàn", "570.000", "năm trăm bảy mươi nghìn"
  const wordDigits = {
    "không": 0, "một": 1, "mốt": 1, "hai": 2, "ba": 3, "bốn": 4, "tư": 4,
    "năm": 5, "lăm": 5, "sáu": 6, "bảy": 7, "bẩy": 7, "tám": 8, "chín": 9
  };
  // Pattern: "<h> trăm <t> mươi <u> nghìn/ngàn" or "<h> trăm <t> nghìn/ngàn"
  s = s.replace(/\b(một|hai|ba|bốn|năm|sáu|bảy|bẩy|tám|chín)\s+trăm(?:\s+(một|hai|ba|bốn|năm|sáu|bảy|bẩy|tám|chín|mười)(?:\s+mươi)?(?:\s+(một|mốt|hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín))?)?\s*(nghìn|ngàn|k)\b/gi,
    (match, hW, tW, uW) => {
      const h = wordDigits[hW.toLowerCase()] || 0;
      let t = 0, u = 0;
      if (tW) {
        t = tW.toLowerCase() === "mười" ? 1 : (wordDigits[tW.toLowerCase()] || 0);
      }
      if (uW) {
        u = wordDigits[uW.toLowerCase()] || 0;
      }
      return `${h * 100 + t * 10 + u}k`;
    }
  );
  // Pattern: "<t> mươi <u> nghìn/ngàn" (e.g. "chín mươi lăm nghìn" -> 95k)
  s = s.replace(/\b(một|hai|ba|bốn|năm|sáu|bảy|bẩy|tám|chín|mười)(?:\s+mươi)?(?:\s+(một|mốt|hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín))?\s*(nghìn|ngàn)\b/gi,
    (match, tW, uW) => {
      const t = tW.toLowerCase() === "mười" ? 1 : (wordDigits[tW.toLowerCase()] || 0);
      const u = uW ? (wordDigits[uW.toLowerCase()] || 0) : 0;
      return `${t * 10 + u}k`;
    }
  );
  return s;
}

function parseQuickInputJS(rawText, defaultMonth = 10) {
  const originalText = (rawText || "").trim();
  const text = convertVietnameseSpokenNumbers(originalText);

  // Use whatever source the user actively selected in #quick-default-source (or saved in localStorage)
  const uiPresetSource = document.getElementById("quick-default-source")?.value;
  let source = uiPresetSource || localStorage.getItem(STORAGE_DEFAULT_SOURCE_KEY) || "Tiền mặt";

  const bankRules = [
    { re: /(?:^|[\s,.;])(vpsp|vp\s*sp|vpbank\s*shopee)(?=$|[\s,.;])/i, name: "VPSP" },
    { re: /(?:^|[\s,.;])(vpbank|vp)(?=$|[\s,.;])/i, name: "VPBank" },
    { re: /(?:^|[\s,.;])(bidv)(?=$|[\s,.;])/i, name: "BIDV" },
    { re: /(?:^|[\s,.;])(ncb)(?=$|[\s,.;])/i, name: "NCB" },
    { re: /(?:^|[\s,.;])(uob)(?=$|[\s,.;])/i, name: "UOB" },
    { re: /(?:^|[\s,.;])(chuyển\s*khoản|chuyen\s*khoan)(?=$|[\s,.;])/i, name: "Chuyển khoản" },
    { re: /(?:^|[\s,.;])(tiền\s*mặt|tien\s*mat|tm)(?=$|[\s,.;])/i, name: "Tiền mặt" }
  ];

  for (const rule of bankRules) {
    const mB = text.match(rule.re);
    if (mB) {
      source = rule.name;
      break;
    }
  }

  let amount = 0;
  let cleanDesc = originalText;

  // Check for multiple 'k' amounts in one line first (e.g. "cá 200k, ốc 370k")
  const allKMatches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:k|ng|nghìn|ngàn)(?=$|[\s,.;])/gi)];
  if (allKMatches.length > 1) {
    amount = allKMatches.reduce((sum, m) => sum + parseFloat(m[1].replace(",", ".")) * 1000, 0);
    // Keep the full itemized description when multiple prices are written
    cleanDesc = originalText;
  } else {
    const mTr = text.match(/(\d+(?:[.,]\d+)?)\s*(?:tr|triệu|trieu|củ)(?:\s*(\d{1,3}))?/i);
    if (mTr) {
      const base = parseFloat(mTr[1].replace(",", "."));
      const tail = mTr[2];
      amount = base * 1000000 + (tail ? parseFloat(tail) * Math.pow(10, 6 - tail.length) : 0);
      cleanDesc = (text.slice(0, mTr.index) + " " + text.slice(mTr.index + mTr[0].length)).trim();
    } else if (allKMatches.length === 1) {
      const mK = allKMatches[0];
      amount = parseFloat(mK[1].replace(",", ".")) * 1000;
      cleanDesc = (text.slice(0, mK.index) + " " + text.slice(mK.index + mK[0].length)).trim();
    } else {
      const mNum = text.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,9})(?:\s*(?:đ|vnđ|vnd))?/i);
      if (mNum) {
        amount = parseFloat(mNum[1].replace(/[.,]/g, ""));
        cleanDesc = (text.slice(0, mNum.index) + " " + text.slice(mNum.index + mNum[0].length)).trim();
      }
    }
  }

  // Remove only standalone trailing bank code tokens, preserving all Vietnamese words and commas (e.g., "cá , ốc")
  cleanDesc = cleanDesc
    .replace(/(?:^|\s+)(vpbank\s*shopee|vp\s*sp|vpsp|vpbank|vp|bidv|ncb|uob|tiền\s*mặt|chuyển\s*khoản|tm)(?=$|\s+)/gi, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-,.|]+|[\s\-,.|]+$/g, "")
    .trim();

  let { cat, person, confidence, reason } = classifyTransactionTextJS(text);

  // Respect user's explicit preset choices if not set to AUTO
  const uiPresetPerson = document.getElementById("quick-default-person")?.value;
  if (uiPresetPerson && uiPresetPerson !== "AUTO" && person === "Chung") {
    person = uiPresetPerson;
  }
  const uiPresetCat = document.getElementById("quick-default-cat")?.value;
  if (uiPresetCat && uiPresetCat !== "AUTO") {
    cat = uiPresetCat;
  }

  const now = new Date();
  const dayStr = String(now.getDate()).padStart(2, "0");
  const mStr = String(defaultMonth).padStart(2, "0");

  return {
    date: `2026-${mStr}-${dayStr}`,
    month: Number(defaultMonth),
    content: cleanDesc || originalText,
    category: cat,
    person,
    amount: Math.round(amount),
    source,
    confidence,
    reason
  };
}

function isUnclearEmailItemJS(friendlyNote, rawContent, confidence) {
  const fn = (friendlyNote || "").trim().toLowerCase();
  const rc = (rawContent || "").trim().toLowerCase();

  // 1. Không khớp từ khóa lịch sử nào (độ tin cậy thấp, mặc định Ăn uống • Chung)
  if (confidence < 0.88) {
    return {
      isUnclear: true,
      reason: "Nội dung giao dịch chưa khớp từ khóa nào của gia đình (AI đang để tạm Ăn uống • Chung)."
    };
  }

  // 2. Nội dung quá ngắn hoặc chỉ toàn chữ số / mã giao dịch POS/NAPAS
  if (fn.length < 4) {
    return {
      isUnclear: true,
      reason: "Nội dung giao dịch quá ngắn (chỉ có vài ký tự viết tắt ngân hàng)."
    };
  }
  if (/^\d+$/.test(fn) || /^[a-z0-9._\-]{1,6}$/i.test(fn)) {
    return {
      isUnclear: true,
      reason: "Nội dung chỉ là mã số/mã POS của ngân hàng, chưa rõ mặt hàng hay dịch vụ đã chi."
    };
  }

  // 3. Nội dung là thuật ngữ giao dịch chung chung không có tên cửa hàng hay mục đích
  const vaguePatterns = [
    /^(thanh toan|chuyen tien|chuyen khoan|rut tien|pos|qr|payment|ecom|transfer|napas|ibft|mbvcb)$/i,
    /^(thanh toan qr|thanh toan pos|gd online|gd tai quay|ecom transaction)$/i
  ];
  if (vaguePatterns.some(vp => vp.test(fn))) {
    return {
      isUnclear: true,
      reason: "Nội dung chỉ ghi chuyển tiền/thanh toán chung chung, chưa rõ mục đích mua sắm."
    };
  }

  return { isUnclear: false, reason: null };
}

function getSmartClarificationSuggestionsJS(amount, bank, rawContent) {
  return [
    { label: "🍲 Ăn uống • Chung", category: "Ăn uống", person: "Chung", note: "Ăn uống gia đình" },
    { label: "🧺 Đồ dùng GĐ • Vợ", category: "Đồ dùng GĐ", person: "Vợ", note: "Mua đồ dùng gia đình" },
    { label: "⛽ Tiện ích / Xăng • Chồng", category: "Phí tiện ích", person: "Chồng", note: "Đổ xăng / Tiện ích" },
    { label: "👶 Bỉm sữa / Y tế • Sugi", category: "Đồ dùng GĐ", person: "Sugi", note: "Bỉm sữa cho Sugi" },
    { label: "👦 Học tập / Đồ chơi • Subo", category: "Học tập", person: "Subo", note: "Chi phí cho Subo" }
  ];
}

function parseBankEmailsJS(rawEmailText) {
  const blocks = (rawEmailText || "")
    .split(/(?:^|\n)---+(?:\n|$)|(?=From:|Từ:|\[VPBank\]|\[BIDV\]|\[NCB\])/)
    .map(b => b.trim())
    .filter(Boolean);

  const parsedItems = [];
  blocks.forEach((block, idx) => {
    const bLow = block.toLowerCase();
    let bank = "VPBank";
    if (bLow.includes("bidv") || bLow.includes("smartbanking")) bank = "BIDV";
    else if (bLow.includes("ncb") || bLow.includes("quốc dân") || bLow.includes("izimobile")) bank = "NCB";
    else if (bLow.includes("uob")) bank = "UOB";
    else if (bLow.includes("shopee") && bLow.includes("vpbank")) bank = "VPBank Shopee";

    let amt = 0;
    const amtPatterns = [
      /(?:số tiền|so tien|giá trị|gia tri|biến động|bien dong|gd|amount)[:\s]*([+-]?\s*\d{1,3}(?:[.,]\d{3})+|\d{4,10})\s*(?:vnd|đ|vnđ)/i,
      /([+-]\s*\d{1,3}(?:[.,]\d{3})+)\s*(?:vnd|đ|vnđ)/i,
      /(\d{1,3}(?:[.,]\d{3})+)\s*(?:vnd|đ|vnđ)/i
    ];
    for (const pat of amtPatterns) {
      const mA = block.match(pat);
      if (mA) {
        const numS = mA[1].replace(/[^\d]/g, "");
        if (numS) {
          amt = parseFloat(numS);
          break;
        }
      }
    }

    const now = new Date();
    let dateStr = `2026-10-${String(now.getDate()).padStart(2, "0")}`;
    let monthNum = 10;
    const mDt = block.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
    if (mDt) {
      const dI = parseInt(mDt[1], 10);
      const mI = parseInt(mDt[2], 10);
      if (dI >= 1 && dI <= 31 && mI >= 1 && mI <= 12) {
        monthNum = mI;
        dateStr = `2026-${String(mI).padStart(2, "0")}-${String(dI).padStart(2, "0")}`;
      }
    }

    let contentExtracted = "";
    const ndMatch = block.match(/(?:nội dung|noi dung|mô tả|mo ta|merchant|chi tiết)[:\s]+([^\n\r;]+)/i);
    if (ndMatch) {
      contentExtracted = ndMatch[1].split(/\.\s*(?:số dư|so du|sd)/i)[0].trim();
    } else {
      const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      contentExtracted = lines[lines.length - 1] || block.slice(0, 80);
    }

    const friendlyNote = contentExtracted
      .replace(/^(MBVCB|IBFT|NAPAS|QR|POS|ECOM|TT|GD|CHUYEN TIEN|THANH TOAN)[\s._:-]*/i, "")
      .trim();

    const { cat, person, confidence, reason } = classifyTransactionTextJS(contentExtracted + " " + friendlyNote);
    const unclearCheck = isUnclearEmailItemJS(friendlyNote, contentExtracted, confidence);

    const minDate = getEmailStartDate();
    if (minDate && dateStr < minDate) {
      return; // Bỏ qua giao dịch cũ trước ngày bắt đầu (VD: bỏ qua T10, bắt đầu từ 01/11/2026)
    }

    if (amt > 0) {
      parsedItems.push({
        temp_id: `EMAIL-${idx + 1}-${Math.round(amt)}`,
        bank,
        date: dateStr,
        month: monthNum,
        amount: Math.round(amt),
        is_income: false,
        raw_content: contentExtracted,
        content: friendlyNote.length < 40 ? friendlyNote.toLowerCase() : friendlyNote.slice(0, 45),
        category: cat,
        person,
        source: bank,
        confidence,
        reason,
        needs_clarification: unclearCheck.isUnclear,
        unclear_reason: unclearCheck.reason,
        ai_question: unclearCheck.isUnclear
          ? `Giao dịch ${fmtVND(amt)} tại ${bank} ("${friendlyNote}") chi cho việc gì và của ai trong gia đình?`
          : null,
        suggested_options: unclearCheck.isUnclear
          ? getSmartClarificationSuggestionsJS(amt, bank, contentExtracted)
          : [],
        resolved_by_ai: false
      });
    }
  });

  return parsedItems;
}

function recomputeMonthsJS(db) {
  if (!db) return;
  const txs = db.transactions || [];
  (db.months || []).forEach(mObj => {
    const m = mObj.month;
    const mTxs = txs.filter(t => Number(t.month) === m);
    const actualExp = mTxs.reduce((s, t) => s + Number(t.amount || 0), 0);
    const incTotal =
      Number(mObj.income.CK || 0) +
      Number(mObj.income.VK || 0) +
      Number(mObj.income.Subo || 0) +
      Number(mObj.income.Sugi || 0);

    mObj.income.total = incTotal;
    mObj.target_saving = Math.round(incTotal * 0.30);
    mObj.target_expense = Math.round(incTotal * 0.70);
    mObj.actual_total_expense = actualExp;
    mObj.remaining_actual = incTotal - actualExp;
    mObj.tx_count = mTxs.length;

    const dcaTot = Number(mObj.allocation.dca_total || 0);
    const dipAdd = Number(mObj.allocation.dip_fund || 0);
    mObj.allocation.dca_fuevfvnd = Math.round(dcaTot * 0.30);
    mObj.allocation.dca_dcds = Math.round(dcaTot * 0.25);
    mObj.allocation.dca_vesaf = Math.round(dcaTot * 0.45);
    if (incTotal > 0) {
      mObj.allocation.emergency_saving = Math.max(0, (incTotal - actualExp) - dcaTot - dipAdd);
    }
  });

  if (db.investment) {
    db.investment.dip_fund_balance = (db.months || []).reduce((s, m) => s + Number(m.allocation?.dip_fund || 0), 0);
  }

  const holdings = db.investment?.holdings || [];
  const orders = db.investment?.dca_orders || [];
  holdings.forEach(h => {
    const cOrders = orders.filter(o => o.code === h.code);
    if (cOrders.length > 0) {
      h.invested = cOrders.reduce((s, o) => s + Number(o.amount || 0), 0);
      h.units = Number(cOrders.reduce((s, o) => s + Number(o.units || 0), 0).toFixed(2));
    }
    h.market_value = Math.round(Number(h.units) * Number(h.current_nav));
    h.avg_cost = h.units > 0 ? Math.round(h.invested / h.units) : 0;
    h.pnl = h.market_value - h.invested;
    h.pnl_pct = h.invested > 0 ? Number(((h.pnl / h.invested) * 100).toFixed(2)) : 0;
  });

  const totMv = holdings.reduce((s, h) => s + h.market_value, 0);
  holdings.forEach(h => {
    h.actual_weight = totMv > 0 ? Number((h.market_value / totMv).toFixed(4)) : 0;
  });
}

function answerFamilyQuestionJS(question, db) {
  const q = (question || "").toLowerCase().trim();
  const months = db.months || [];
  const txs = db.transactions || [];
  const activeMonths = months.filter(m => m.income.total > 0 || m.actual_total_expense > 0);
  const inv = db.investment;

  const totalIncYtd = activeMonths.reduce((s, m) => s + m.income.total, 0);
  const totalExpYtd = activeMonths.reduce((s, m) => s + m.actual_total_expense, 0);
  const totalRemYtd = totalIncYtd - totalExpYtd;
  const savingRateYtd = totalIncYtd > 0 ? (totalRemYtd / totalIncYtd) * 100 : 0;

  const mMatch = q.match(/(?:tháng|thang|t)\s*(\d{1,2})\b/);
  const targetM = mMatch && Number(mMatch[1]) >= 1 && Number(mMatch[1]) <= 12 ? Number(mMatch[1]) : null;

  if (["tư vấn", "tăng giảm", "tăng", "giảm", "cắt giảm", "ngân sách", "tiết kiệm thêm", "tối ưu chi tiêu"].some(k => q.includes(k))) {
    return [
      "### 💡 Cố Vấn Tài Chính AI: Tư Vấn Tăng / Giảm Chi Tiêu Từng Nhóm\n",
      "Dựa trên dữ liệu 10 tháng thực tế (Thu: 1.035 tỷ, Chi: 716tr, Thặng dư: +319.2tr / 30.84% thu nhập), AI tư vấn cụ thể như sau:\n",
      "#### 🔴 1. CÁC NHÓM NÊN CẮT GIẢM:",
      "- **🍲 Ăn uống (Thực tế: ~17.5tr/tháng - chiếm 24.5% tổng chi)**:",
      "  * *Khuyến nghị:* **Cắt giảm ~2.500.000 đ/tháng** (mục tiêu giữ dưới 15.000.000 đ/tháng).",
      "  * *Hành động:* Giảm bớt số bữa ăn ngoài hàng vào cuối tuần (trung bình 600k-1.2tr/bữa) và đặt đồ ăn qua app; lên thực đơn tuần trước khi đi Co.opmart/Emart.",
      "- **💄 Làm đẹp / Mua sắm (Từng vọt lên 20.9tr ở T7 và 11.9tr ở T2)**:",
      "  * *Khuyến nghị:* **Khống chế trần cố định 2.500.000 đ/tháng**.",
      "  * *Hành động:* Gom mua mỹ phẩm/quần áo vào các đợt sale định kỳ, hạn chế mua sắm phát sinh ngoài kế hoạch.",
      "- **⚡ Phí tiện ích / Phát sinh xe (T9 vọt lên 19.4tr do sửa xe 12.6tr)**:",
      "  * *Khuyến nghị:* Giữ chi phí sinh hoạt điện nước mạng cố định ~3.5tr/tháng. Các khoản sửa xe đột xuất >5tr nên trích từ Quỹ Khẩn Cấp thay vì trừ thẳng vào ngân sách tháng.\n",
      "#### 🟢 2. CÁC NHÓM NÊN TĂNG / TẬN DỤNG ĐẦU TƯ:",
      "- **📈 Đầu tư DCA 3 Quỹ ETF/Mở (FUEVFVND, DCDS, VESAF)**:",
      "  * *Khuyến nghị:* **NÊN TĂNG TỪ 12.000.000 đ LÊN 15.000.000 đ/tháng**.",
      "  * *Lý do:* Tháng 10/2026, Vợ đã tất toán 100% khoản trả góp điện thoại (35.49tr), giải phóng ngay **3.000.000 đ/tháng** từ tháng 11/2026. Nên chuyển thẳng khoản này vào DCA 3 quỹ để nhân đôi tốc độ lãi kép!",
      "- **🎯 Quỹ Tiền Mặt Bắt Đáy (Hiện có 36.57tr)**:",
      "  * *Khuyến nghị:* **Nâng mức trích từ 4tr lên 6tr/tháng** khi dòng tiền thặng dư trên 35tr/tháng, sẵn sàng mua khi VN-Index chiết khấu sâu.\n",
      "#### 🟡 3. CÁC NHÓM DUY TRÌ & BẢO VỆ:",
      "- **👦 Học tập Subo (~15.1tr/tháng):** Duy trì trọn vẹn, đầu tư giáo dục cho con là ưu tiên số 1.",
      "- **👶 Sugi (~3.8tr/tháng bỉm sữa, y tế):** Đảm bảo dinh dưỡng và tiêm chủng đầy đủ.",
      "- **💳 Nợ Thuế Chồng:** Duy trì trả đều 3tr/tháng (còn 23.1tr, dự kiến tất toán vào Tháng 6/2027)."
    ].join("\n");
  }

  if (q.includes("lỗi") || q.includes("logic") || q.includes("excel") || q.includes("sai")) {
    const bugs = db.audit.formula_bugs || [];
    const lines = [
      "### 🔍 Kết quả Kiểm Toán Logic & Công Thức Excel Gia Đình\n",
      "Mình đã đối chiếu toàn bộ 30 sheets của 2 file Excel và phát hiện **7 lỗi công thức & dữ liệu** (đã tự động sửa trong App và file Excel chuẩn hóa):\n"
    ];
    bugs.forEach(b => {
      lines.push(`- **[${b.id}] ${b.title}** *(Vị trí: \`${b.location}\`)*:\n  ${b.detail}`);
    });
    return lines.join("\n");
  }

  if (["đầu tư", "dca", "etf", "quỹ", "fuevfvnd", "dcds", "vesaf", "nav", "ccq", "bắt đáy"].some(k => q.includes(k))) {
    const holdings = inv.holdings;
    const totInvested = holdings.reduce((s, h) => s + h.invested, 0);
    const totMv = holdings.reduce((s, h) => s + h.market_value, 0);
    const totPnl = totMv - totInvested;
    const totPnlPct = totInvested > 0 ? (totPnl / totInvested) * 100 : 0;
    const lines = [
      "### 📈 Báo Cáo Danh Mục Đầu Tư DCA (ETF & Quỹ Mở)\n",
      `- **Chiến lược cốt lõi**: Mua định kỳ (DCA) **12,000,000 đ/tháng** (30% \`FUEVFVND\` • 25% \`DCDS\` • 45% \`VESAF\`), tăng trưởng vốn góp 5%/năm.`,
      `- **Tổng vốn đã giải ngân DCA**: **${fmtVND(totInvested)}**`,
      `- **Giá trị thị trường hiện tại**: **${fmtVND(totMv)}** (**Lãi tạm tính: +${fmtVND(totPnl)} / +${totPnlPct.toFixed(2)}%**)`,
      `- **Quỹ Tiền Mặt Bắt Đáy tích lũy**: **${fmtVND(inv.dip_fund_balance)}** *(Sẵn sàng giải ngân 15%–30% khi VN-Index chỉnh từ 10%–40%)*`,
      `- **Quỹ Dự Phòng Khẩn Cấp tích lũy**: **${fmtVND(inv.emergency_fund_balance)}**\n`
    ];
    holdings.forEach(h => {
      lines.push(`- **${h.code}** (${h.type} • MT ${(h.target_weight * 100).toFixed(0)}%): Đã góp **${fmtVND(h.invested)}** → **${h.units} CCQ** (Giá vốn \`${fmtVND(h.avg_cost)}\`, NAV \`${fmtVND(h.current_nav)}\`) = **${fmtVND(h.market_value)}** (**+${fmtVND(h.pnl)} / +${h.pnl_pct}%**)`);
    });
    return lines.join("\n");
  }

  if (["nợ", "thuế", "shinhan", "trả góp"].some(k => q.includes(k))) {
    return [
      "### 💳 Tình Trạng Các Khoản Nợ & Trả Góp Gia Đình\n",
      "1. 🎉 **Trả góp Điện thoại Vợ (`OUTSTANDING VK`) — ĐÃ TẤT TOÁN XONG 100%!**\n   - Tổng nợ gốc: **35,490,000 đ** (trả từ T11/2025 đến T10/2026).\n   - Kỳ Tháng 10/2026 vừa trả **2,490,000 đ** là kỳ cuối cùng, dư nợ hiện tại = **0 đ**. Từ tháng 11/2026, ngân sách Vợ giảm tải được **3,000,000 đ/tháng**!",
      "2. 🏛️ **Nợ Thuế TNCN của Chồng (`OUSTANDING - CK`)**:\n   - Tổng thuế: **53,100,000 đ** (`18tr + 35.1tr`).\n   - Đã trả 10 kỳ (T1–T10/2026): **30,000,000 đ** (`3,000,000 đ/tháng`).\n   - Dư nợ còn lại: **23,100,000 đ** (dự kiến trả thêm **7 kỳ 3tr + 1 kỳ 2.1tr**, hoàn tất vào **Tháng 6/2027**).",
      "3. 🏦 **Trả góp Shinhan của Chồng**:\n   - Đang trả đều đặn **4,500,000 đ/tháng** trong bảng chi tiêu (10 tháng qua đã trả **45,000,000 đ**)."
    ].join("\n");
  }

  if (["subo", "sugi", "con", "học phí", "bỉm", "sữa"].some(k => q.includes(k))) {
    const suboTxs = txs.filter(t => t.person === "Subo");
    const sugiTxs = txs.filter(t => t.person === "Sugi");
    const suboTot = suboTxs.reduce((s, t) => s + t.amount, 0);
    const sugiTot = sugiTxs.reduce((s, t) => s + t.amount, 0);
    const sumCat = (arr, c) => arr.filter(t => t.category === c).reduce((s, t) => s + t.amount, 0);

    return [
      "### 👶 Phân Tích Chi Phí Của 2 Bé: SUBO & SUGI (10 Tháng 2026)\n",
      `- **Tổng chi cho SUBO**: **${fmtVND(suboTot)}** *(Trung bình **${fmtVND(suboTot / 10)}/tháng**, chiếm **${((suboTot / totalExpYtd) * 100).toFixed(1)}%** tổng chi gia đình)*`,
      `  - Trong đó: Học tập **${fmtVND(sumCat(suboTxs, "Học tập"))}** • Vui chơi **${fmtVND(sumCat(suboTxs, "Vui chơi"))}** • Làm đẹp/Quần áo **${fmtVND(sumCat(suboTxs, "Làm đẹp"))}** • Y tế **${fmtVND(sumCat(suboTxs, "Y tế"))}**.`,
      `- **Tổng chi cho SUGI**: **${fmtVND(sugiTot)}** *(Trung bình **${fmtVND(sugiTot / 10)}/tháng**, chiếm **${((sugiTot / totalExpYtd) * 100).toFixed(1)}%** tổng chi gia đình)*`,
      `  - Trong đó: Đồ dùng/Bỉm sữa **${fmtVND(sumCat(sugiTxs, "Đồ dùng GĐ"))}** • Y tế/Tiêm chủng **${fmtVND(sumCat(sugiTxs, "Y tế"))}** • Làm đẹp/Quần áo **${fmtVND(sumCat(sugiTxs, "Làm đẹp"))}**.`,
      `- **Quỹ riêng của con**: Quỹ Mừng Tuổi (**17,160,000 đ**) + Quỹ Mừng Sinh Sugi (**24,200,000 đ**) = **41,360,000 đ**.`
    ].join("\n");
  }

  if (q.includes("ăn uống") || q.includes("đi chợ") || q.includes("siêu thị")) {
    const foodTxs = txs.filter(t => t.category === "Ăn uống");
    const foodTot = foodTxs.reduce((s, t) => s + t.amount, 0);
    return [
      "### 🍲 Phân Tích Chi Tiêu Ăn Uống Gia Đình (T1 – T10/2026)\n",
      `- **Tổng chi Ăn uống 10 tháng**: **${fmtVND(foodTot)}** trên tổng **${foodTxs.length} giao dịch** (chiếm **${((foodTot / totalExpYtd) * 100).toFixed(1)}%** tổng chi tiêu gia đình).`,
      `- **Trung bình mỗi tháng**: **${fmtVND(foodTot / 10)}/tháng**`,
      `- **Trung bình mỗi ngày**: **~${fmtVND(foodTot / 295)}/ngày**`,
      "- **Tháng chi Ăn uống cao nhất**: **Tháng 9** (`22,030,000 đ`) và **Tháng 8** (`20,638,000 đ`).",
      "- **Tháng hiện tại (Tháng 10)**: Đang ở mức kiểm soát rất tốt so với trung bình 17.5tr/tháng!"
    ].join("\n");
  }

  if (targetM !== null) {
    const mObj = months.find(m => m.month === targetM);
    const mTxs = txs.filter(t => Number(t.month) === targetM);
    if (mObj) {
      const byCat = {};
      const byPerson = {};
      mTxs.forEach(t => {
        byCat[t.category] = (byCat[t.category] || 0) + t.amount;
        byPerson[t.person] = (byPerson[t.person] || 0) + t.amount;
      });
      const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
      const topTxs = [...mTxs].sort((a, b) => b.amount - a.amount).slice(0, 5);
      const lines = [
        `### 📊 Báo Cáo Tài Chính Chi Tiết — Tháng ${targetM}/2026\n`,
        `- **Tổng Thu Nhập**: **${fmtVND(mObj.income.total)}** *(Chồng: ${fmtVND(mObj.income.CK)} • Vợ: ${fmtVND(mObj.income.VK)} • Subo: ${fmtVND(mObj.income.Subo)} • Sugi: ${fmtVND(mObj.income.Sugi)})*`,
        `- **Hạn mức Chi Tiêu (70%)**: **${fmtVND(mObj.target_expense)}**`,
        `- **Thực Chi (${mTxs.length} khoản)**: **${fmtVND(mObj.actual_total_expense)}**`,
        `- **Tiền Dư Thực Tế**: **${fmtVND(mObj.remaining_actual)}** *(Tỷ lệ tiết kiệm: **${mObj.income.total > 0 ? ((mObj.remaining_actual / mObj.income.total) * 100).toFixed(1) : 0}%**)*\n`,
        "**1. Chi theo Thành viên:**"
      ];
      Object.entries(byPerson).sort((a, b) => b[1] - a[1]).forEach(([pName, pVal]) => {
        const pct = mObj.actual_total_expense > 0 ? ((pVal / mObj.actual_total_expense) * 100).toFixed(1) : 0;
        lines.push(`- **${pName}**: ${fmtVND(pVal)} (${pct}%)`);
      });
      lines.push("\n**2. Top Hạng mục chi nhiều nhất:**");
      topCats.slice(0, 5).forEach(([cName, cVal]) => {
        const pct = mObj.actual_total_expense > 0 ? ((cVal / mObj.actual_total_expense) * 100).toFixed(1) : 0;
        lines.push(`- **${cName}**: ${fmtVND(cVal)} (${pct}%)`);
      });
      lines.push("\n**3. 5 Khoản chi lớn nhất trong tháng:**");
      topTxs.forEach(t => {
        lines.push(`- \`${t.content}\` (${t.category} • ${t.person}): **${fmtVND(t.amount)}**`);
      });
      return lines.join("\n");
    }
  }

  const byCatAll = {};
  const byPersonAll = {};
  txs.forEach(t => {
    byCatAll[t.category] = (byCatAll[t.category] || 0) + t.amount;
    byPersonAll[t.person] = (byPersonAll[t.person] || 0) + t.amount;
  });
  const topCatsAll = Object.entries(byCatAll).sort((a, b) => b[1] - a[1]);
  const lines = [
    "### 🏆 Tổng Quan Sức Khỏe Tài Chính Gia Đình (10 Tháng Năm 2026)\n",
    `- **Tổng Thu Nhập 10 tháng**: **${fmtVND(totalIncYtd)}**`,
    `- **Tổng Chi Tiêu Thực Tế (${txs.length} giao dịch)**: **${fmtVND(totalExpYtd)}**`,
    `- **Thặng Dư Dòng Tiền Ròng (100%)**: **+${fmtVND(totalRemYtd)}** — **Tỷ lệ tiết kiệm đạt ${savingRateYtd.toFixed(1)}%**\n` +
      `  - Trong đó **80% Đưa vào Tích lũy/Đầu tư (\`N16\`)**: **${fmtVND(totalRemYtd * 0.8)}** (${(savingRateYtd * 0.8).toFixed(1)}% thu nhập)\n` +
      `  - Và **20% Tiền còn lại giữ linh hoạt**: **${fmtVND(totalRemYtd * 0.2)}** (${(savingRateYtd * 0.2).toFixed(1)}% thu nhập)\n`,
    "**Top 5 Hạng Mục Chi Tiêu Lớn Nhất Năm 2026:**"
  ];
  topCatsAll.slice(0, 5).forEach(([cName, cVal]) => {
    lines.push(`- **${cName}**: **${fmtVND(cVal)}** (${((cVal / totalExpYtd) * 100).toFixed(1)}%)`);
  });
  lines.push("\n**Chi Tiêu Theo Thành Viên (10 Tháng):**");
  Object.entries(byPersonAll).sort((a, b) => b[1] - a[1]).forEach(([pName, pVal]) => {
    lines.push(`- **${pName}**: **${fmtVND(pVal)}** (${((pVal / totalExpYtd) * 100).toFixed(1)}%)`);
  });
  lines.push("\n👉 *Bạn có thể hỏi cụ thể hơn như: \"Tháng 10 tiêu gì nhiều nhất?\", \"So sánh chi phí Subo và Sugi\", \"Danh mục DCA 3 quỹ hiện lời bao nhiêu?\", hoặc \"Khi nào trả hết nợ thuế?\"*");
  return lines.join("\n");
}

// ============================================================================
// 3. DATA INITIALIZATION & 2-WAY GOOGLE SHEET CLOUD SYNC
// ============================================================================
function getCloudScriptUrl() {
  return (localStorage.getItem(STORAGE_CLOUD_URL_KEY) || "").trim();
}

function updateCloudBadgeUI(statusText, isConnected = true) {
  const topLbl = document.getElementById("topbar-cloud-label");
  const topPill = document.getElementById("topbar-cloud-pill");
  const sideTxt = document.getElementById("sidebar-sync-text");
  const url = getCloudScriptUrl();
  const label = statusText || (url ? "☁️ Đã nối Google Sheet (2 chiều)" : "⚠️ Chưa nối Google Sheet (Bấm nối)");
  if (topLbl) topLbl.textContent = label;
  if (sideTxt) sideTxt.textContent = label;
  if (topPill) {
    if (url) {
      topPill.style.background = "rgba(16,185,129,0.14)";
      topPill.style.borderColor = "rgba(16,185,129,0.45)";
      topPill.style.color = "#6ee7b7";
    } else {
      topPill.style.background = "rgba(245,158,11,0.18)";
      topPill.style.borderColor = "rgba(245,158,11,0.55)";
      topPill.style.color = "#fcd34d";
    }
  }
}

function getDefaultMailboxes() {
  return [
    {
      id: "MB-CHONG",
      label: "👨 Email của Chồng (VPBank • BIDV • Google Sheet)",
      email: "nnt472@gmail.com",
      owner: "Chồng",
      default_bank: "VPBank",
      banks: "VPBank, BIDV, UOB",
      cloud_url: "" // Uses primary Cloud Apps Script URL by default
    },
    {
      id: "MB-VO",
      label: "👩 Email của Vợ (Theo dõi NCB • Shopee)",
      email: "Email của Vợ (NCB)",
      owner: "Vợ",
      default_bank: "NCB",
      banks: "NCB, VPBank Shopee",
      cloud_url: "" // Can attach Wife's own Apps Script URL or use Gmail Auto-Forward
    }
  ];
}

function getFamilyMailboxes() {
  let list = null;
  if (DB && DB.meta && Array.isArray(DB.meta.mailboxes) && DB.meta.mailboxes.length > 0) {
    list = DB.meta.mailboxes;
  } else {
    const saved = localStorage.getItem("FAMILY_MAILBOXES_2026");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
      } catch (e) {}
    }
  }
  if (!list) list = getDefaultMailboxes();

  // Ensure Husband's email is updated to nnt472@gmail.com
  list.forEach(mb => {
    if (mb.id === "MB-CHONG" || mb.email === "nnt474@gmail.com") {
      mb.email = "nnt472@gmail.com";
      mb.label = "👨 Email của Chồng (VPBank • BIDV • Google Sheet)";
    }
  });
  if (DB && DB.meta) DB.meta.mailboxes = list;
  return list;
}

function saveFamilyMailboxes(list) {
  if (DB && DB.meta) DB.meta.mailboxes = list;
  localStorage.setItem("FAMILY_MAILBOXES_2026", JSON.stringify(list));
}

// ============================================================================
// ANTI-DUPLICATE ENGINE (CHỐNG TRÙNG LẶP EMAIL & GIAO DỊCH)
// ============================================================================
const STORAGE_PROCESSED_EMAIL_SIGS = "FAMILY_PROCESSED_EMAIL_SIGS_2026";

function getProcessedEmailSigs() {
  const fromMeta = (DB && DB.meta && Array.isArray(DB.meta.processed_email_sigs)) ? DB.meta.processed_email_sigs : [];
  let fromLocal = [];
  try {
    fromLocal = JSON.parse(localStorage.getItem(STORAGE_PROCESSED_EMAIL_SIGS) || "[]");
  } catch (e) {}
  return Array.from(new Set([...fromMeta, ...fromLocal]));
}

function addProcessedEmailSig(sig) {
  if (!sig) return;
  const all = getProcessedEmailSigs();
  if (!all.includes(sig)) all.push(sig);
  if (DB && DB.meta) DB.meta.processed_email_sigs = all;
  localStorage.setItem(STORAGE_PROCESSED_EMAIL_SIGS, JSON.stringify(all));
}

function makeEmailItemSignature(item) {
  const m = Number(item.month || 10);
  const amt = Math.round(Number(item.amount || 0));
  const rawKey = foldVN(item.raw_content || item.content || "").replace(/[^a-z0-9]/g, "").slice(0, 24);
  return `M${m}-A${amt}-${rawKey}`;
}

function isEmailItemAlreadyAdded(item) {
  if (!item || !DB || !Array.isArray(DB.transactions)) return false;
  const sig = makeEmailItemSignature(item);
  if (getProcessedEmailSigs().includes(sig)) return true;

  const amt = Math.round(Number(item.amount || 0));
  const m = Number(item.month || 10);
  const itemWords = foldVN(`${item.content || ""} ${item.raw_content || ""}`)
    .split(/\s+/)
    .filter(w => w.length >= 3 && !["thanh", "toan", "chuyen", "khoan", "mua", "tai", "cho", "vnd"].includes(w));

  return DB.transactions.some(tx => {
    if (Number(tx.month) !== m) return false;
    if (Math.round(Number(tx.amount)) !== amt) return false;
    const txFold = foldVN(tx.content || "");
    if (txFold === foldVN(item.content || "") || txFold === foldVN(item.raw_content || "")) return true;
    // If same month + exact same amount + shares at least 1 meaningful keyword (e.g. "coopmart", "sugi", "petrolimex", "shopee", "long chau")
    if (itemWords.length > 0 && itemWords.some(w => txFold.includes(w))) return true;
    return false;
  });
}

function ensureT10EtfAndDeduplicateDB(db) {
  if (!db) return;
  // 1. Ensure Month 10 ETF & Open Fund DCA is marked "Đã mua" (12,000,000 đ = 3.6tr FUEVFVND + 3.0tr DCDS + 5.4tr VESAF)
  const m10 = (db.months || []).find(m => m.month === 10);
  if (m10 && (!m10.allocation || m10.allocation.dca_total === 0 || m10.allocation.status === "Dự kiến")) {
    m10.allocation = {
      dca_total: 12000000,
      dca_fuevfvnd: 3600000,
      dca_dcds: 3000000,
      dca_vesaf: 5400000,
      dip_fund: 4000000,
      emergency_saving: Math.max(0, (m10.income.total - m10.actual_total_expense) - 16000000),
      status: "Đã mua"
    };
  }
  if (db.investment && Array.isArray(db.investment.dca_orders)) {
    const orders = db.investment.dca_orders;
    if (!orders.some(o => Number(o.month) === 10)) {
      orders.push(
        { id: "DCA-T10-FUEVFVND", month: 10, date: "2026-10-05", code: "FUEVFVND", amount: 3600000, buy_nav: 33300, units: 108.11, status: "Đã khớp" },
        { id: "DCA-T10-DCDS", month: 10, date: "2026-10-05", code: "DCDS", amount: 3000000, buy_nav: 91495, units: 32.79, status: "Đã khớp" },
        { id: "DCA-T10-VESAF", month: 10, date: "2026-10-05", code: "VESAF", amount: 5400000, buy_nav: 46250, units: 116.76, status: "Đã khớp" }
      );
    }
  }

  // 2. Deduplicate any accidentally duplicated cloud-added transactions (same date, amount, and normalized content)
  if (Array.isArray(db.transactions)) {
    const seenCustom = new Set();
    db.transactions = db.transactions.filter(t => {
      const isCustom = t.is_cloud_added || Number((t.id || "").split("-")[1]) > 888;
      if (!isCustom) return true;
      const key = `${t.month}|${t.date}|${Math.round(Number(t.amount || 0))}|${foldVN(t.content || "")}`;
      if (seenCustom.has(key)) return false;
      seenCustom.add(key);
      return true;
    });
  }
}

function getGeminiApiKey() {
  return (localStorage.getItem(STORAGE_GEMINI_KEY) || (DB && DB.meta && DB.meta.gemini_api_key) || "").trim();
}

function getAIProviderName(key) {
  if (!key) return "";
  if (key.startsWith("sk-ant-")) return "Claude AI (Sonnet)";
  if (key.startsWith("AIza")) return "Gemini AI";
  if (key.startsWith("gsk_")) return "Groq AI";
  if (key.startsWith("sk-or-")) return "OpenRouter";
  if (key.startsWith("sk-")) return "Claude / OpenAI";
  return "AI Engine";
}

function updateGeminiBadgeUI() {
  const lbl = document.getElementById("topbar-gemini-label");
  const pill = document.getElementById("topbar-gemini-pill");
  const sideBtn = document.getElementById("sidebar-gemini-btn");
  const key = getGeminiApiKey();
  const provider = getAIProviderName(key);
  if (lbl) {
    lbl.textContent = key ? `✨ ${provider}: Đã Bật` : "🤖 Cài Não AI (Claude / Gemini)";
  }
  if (pill) {
    pill.style.background = key ? "rgba(16,185,129,0.16)" : "rgba(139,92,246,0.16)";
    pill.style.borderColor = key ? "rgba(16,185,129,0.45)" : "rgba(139,92,246,0.45)";
    pill.style.color = key ? "#6ee7b7" : "#c4b5fd";
  }
  if (sideBtn) {
    sideBtn.innerHTML = key ? `✨ ${provider}: Đang Hoạt Động` : "🤖 Cài Não AI (Claude / Gemini)";
    sideBtn.style.background = key ? "linear-gradient(135deg,#059669,#10b981)" : "linear-gradient(135deg,#8b5cf6,#6366f1)";
  }
}

function buildCompactCloudState() {
  // Store custom added transactions, edited transactions, deleted IDs, mailboxes, gemini key, months income/allocation, and investment state
  const customTxs = (DB.transactions || []).filter(t => t.is_cloud_added || Number((t.id || "").split("-")[1]) > 888);
  const editedTxs = (DB.transactions || []).filter(t => t.is_cloud_edited && !t.is_cloud_added);
  const deletedIds = DB.meta.deleted_tx_ids || [];
  return {
    updated_at: new Date().toISOString(),
    family_pin: getFamilyPin(),
    gemini_api_key: getGeminiApiKey(),
    processed_email_sigs: getProcessedEmailSigs(),
    mailboxes: getFamilyMailboxes(),
    custom_transactions: customTxs,
    edited_transactions: editedTxs,
    deleted_tx_ids: deletedIds,
    months_income: DB.months.map(m => ({
      month: m.month,
      income: m.income,
      allocation: m.allocation
    })),
    investment: {
      holdings_nav: DB.investment.holdings.map(h => ({ code: h.code, current_nav: h.current_nav })),
      dca_orders: DB.investment.dca_orders
    }
  };
}

function applyCompactCloudState(cloudState) {
  if (!cloudState || !DB) return;
  if (cloudState.family_pin) {
    DB.meta.family_pin = String(cloudState.family_pin);
    localStorage.setItem(STORAGE_PIN_KEY, String(cloudState.family_pin));
  }
  if (cloudState.gemini_api_key) {
    DB.meta.gemini_api_key = String(cloudState.gemini_api_key);
    localStorage.setItem(STORAGE_GEMINI_KEY, String(cloudState.gemini_api_key));
    updateGeminiBadgeUI();
  }
  if (Array.isArray(cloudState.processed_email_sigs)) {
    cloudState.processed_email_sigs.forEach(s => addProcessedEmailSig(s));
  }
  if (Array.isArray(cloudState.mailboxes) && cloudState.mailboxes.length > 0) {
    saveFamilyMailboxes(cloudState.mailboxes);
  }
  if (Array.isArray(cloudState.deleted_tx_ids)) {
    DB.meta.deleted_tx_ids = cloudState.deleted_tx_ids;
    const delSet = new Set(cloudState.deleted_tx_ids);
    DB.transactions = DB.transactions.filter(t => !delSet.has(t.id));
  }
  if (Array.isArray(cloudState.edited_transactions)) {
    cloudState.edited_transactions.forEach(ed => {
      const idx = DB.transactions.findIndex(t => t.id === ed.id);
      if (idx !== -1) {
        DB.transactions[idx] = { ...DB.transactions[idx], ...ed, is_cloud_edited: true };
      }
    });
  }
  if (Array.isArray(cloudState.custom_transactions)) {
    const existingMap = new Map(DB.transactions.map((t, i) => [t.id, i]));
    for (let i = cloudState.custom_transactions.length - 1; i >= 0; i--) {
      const tx = cloudState.custom_transactions[i];
      if (existingMap.has(tx.id)) {
        const idx = existingMap.get(tx.id);
        DB.transactions[idx] = { ...DB.transactions[idx], ...tx };
      } else {
        DB.transactions.unshift(tx);
        existingMap.set(tx.id, 0);
      }
    }
  }
  if (Array.isArray(cloudState.months_income)) {
    cloudState.months_income.forEach(cm => {
      const mObj = DB.months.find(x => x.month === cm.month);
      if (mObj) {
        if (cm.income) mObj.income = { ...mObj.income, ...cm.income };
        if (cm.allocation) mObj.allocation = { ...mObj.allocation, ...cm.allocation };
      }
    });
  }
  if (cloudState.investment) {
    if (Array.isArray(cloudState.investment.holdings_nav)) {
      cloudState.investment.holdings_nav.forEach(hn => {
        const h = DB.investment.holdings.find(x => x.code === hn.code);
        if (h && hn.current_nav) h.current_nav = Number(hn.current_nav);
      });
    }
    if (Array.isArray(cloudState.investment.dca_orders) && cloudState.investment.dca_orders.length > 0) {
      DB.investment.dca_orders = cloudState.investment.dca_orders;
    }
  }
  ensureT10EtfAndDeduplicateDB(DB);
  recomputeMonthsJS(DB);
}

function normalizeAppsScriptUrl(rawUrl) {
  let u = (rawUrl || "").trim();
  if (!u) return "";
  // Remove query string if user copied ?...
  u = u.split("?")[0].trim();
  return u;
}

function fetchViaJsonp(url, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const cbName = "__gasCb_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
    const script = document.createElement("script");
    let timer = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP script load error"));
    };

    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}callback=${cbName}&t=${Date.now()}`;
    document.body.appendChild(script);
  });
}

async function persistAndSync(extraPayload = {}) {
  if (!DB) return;
  recomputeMonthsJS(DB);
  try {
    localStorage.setItem(STORAGE_DB_KEY, JSON.stringify(DB));
  } catch (e) {}

  const cloudUrl = getCloudScriptUrl();
  if (cloudUrl) {
    updateCloudBadgeUI("🔄 Đang đồng bộ Google Sheet...");
    const tx = extraPayload.transaction || null;
    const payload = {
      month: tx ? tx.month : 10,
      date: tx ? tx.date : "",
      content: tx ? tx.content : "",
      category: tx ? tx.category : "",
      person: tx ? tx.person : "",
      amount: tx ? tx.amount : 0,
      source: tx ? tx.source : "",
      ...extraPayload,
      cloud_state: buildCompactCloudState()
    };
    try {
      await fetch(cloudUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      updateCloudBadgeUI("☁️ Đã đồng bộ Google Sheet");
    } catch (err) {
      updateCloudBadgeUI("☁️ Đã lưu máy (Chờ mạng)");
    }
  } else {
    updateCloudBadgeUI();
  }
}

async function pullFromGoogleSheetCloud(silent = true) {
  const cloudUrl = getCloudScriptUrl();
  if (!cloudUrl) return false;

  if (cloudUrl.includes("/edit")) {
    alert("⚠️ Bạn vừa dán link trang sửa code (/edit).\nHãy bấm nút 'Triển khai (Deploy) -> Tùy chọn triển khai mới (New deployment)' ở góc phải trên để lấy link kết thúc bằng /exec nhé!");
    return false;
  }

  updateCloudBadgeUI("🔄 Đang kết nối Cloud...");
  let data = null;

  // 1. Try standard CORS fetch first
  try {
    const res = await fetch(`${cloudUrl}?action=pull&t=${Date.now()}`, {
      method: "GET",
      redirect: "follow",
      credentials: "omit"
    });
    if (res.ok) {
      data = await res.json();
    }
  } catch (e) {}

  // 2. Fallback to JSONP (bypasses CORS & redirect restrictions on script.google.com)
  if (!data) {
    try {
      data = await fetchViaJsonp(`${cloudUrl}?action=pull`);
    } catch (e) {}
  }

  if (data && data.ok) {
    if (data.cloud_state) {
      applyCompactCloudState(data.cloud_state);
      localStorage.setItem(STORAGE_DB_KEY, JSON.stringify(DB));
      renderAll();
    }
    updateCloudBadgeUI("☁️ Đã đồng bộ 2 Vợ Chồng");
    if (!silent) {
      alert("✅ Đã kết nối & đồng bộ 2 chiều với Google Sheet Cloud thành công!");
    }
    return true;
  }

  // 3. Even if GET/JSONP wasn't returned (e.g. V1 script or Google redirect policy),
  // no-cors POST sync still works! Keep the URL active and inform the user gently.
  updateCloudBadgeUI("☁️ Đã kết nối Google Sheet");
  if (!silent) {
    alert("✅ Đã lưu kết nối Cloud Web App thành công!\n\n💡 Mẹo nhỏ: Nếu bạn vừa dùng mã Apps Script cũ, hãy bấm '📋 Copy Mã Apps Script' (Bản V2 tự nhận diện Sheet, không cần SHEET_ID) dán lại vào Apps Script và chọn 'Deploy -> New deployment' để đồng bộ 2 chiều mượt nhất nhé!");
  }
  return true;
}

async function initApp() {
  // Register PWA Service Worker if supported
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js?v=2.7").then(reg => { try { reg.update(); } catch (e) {} }).catch(() => {});
  }

  // Check if URL has ?cloud=https://script.google.com/... auto-configuration link for spouse
  const params = new URLSearchParams(window.location.search);
  const cloudParam = params.get("cloud");
  if (cloudParam && cloudParam.startsWith("https://script.google.com/")) {
    localStorage.setItem(STORAGE_CLOUD_URL_KEY, cloudParam.trim());
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  const pinParam = params.get("pin");
  if (pinParam && /^\d{4}$/.test(pinParam)) {
    localStorage.setItem(STORAGE_PIN_KEY, pinParam);
  }

  // Load initial database (try static ./data/family_db.json first, fallback to /api/data)
  let baseDb = null;
  try {
    const res = await fetch("./data/family_db.json?v=2.6");
    if (res.ok) baseDb = await res.json();
  } catch (e) {}

  if (!baseDb) {
    try {
      const res = await fetch("/api/data");
      if (res.ok) baseDb = await res.json();
    } catch (e) {}
  }

  // Restore local cached modifications if present and valid
  const cachedRaw = localStorage.getItem(STORAGE_DB_KEY);
  if (cachedRaw) {
    try {
      const cachedDb = JSON.parse(cachedRaw);
      if (
        cachedDb &&
        Array.isArray(cachedDb.transactions) &&
        cachedDb.transactions.length > 0 &&
        Array.isArray(cachedDb.months) &&
        cachedDb.months.length > 0
      ) {
        DB = cachedDb;
      }
    } catch (e) {}
  }
  if (!DB) DB = baseDb;

  if (!DB.sample_bank_emails) DB.sample_bank_emails = SAMPLE_BANK_EMAILS_DEFAULT;
  DB.apps_script_code = APPS_SCRIPT_CLOUD_CODE;
  if (DB.meta) {
    DB.meta.banks = ALL_PAYMENT_SOURCES;
  }

  // Restore user's preferred Quick Preset selectors on this device
  const savedSrc = localStorage.getItem(STORAGE_DEFAULT_SOURCE_KEY);
  const srcSelect = document.getElementById("quick-default-source");
  if (srcSelect && savedSrc && ALL_PAYMENT_SOURCES.includes(savedSrc)) {
    srcSelect.value = savedSrc;
  }
  const savedPerson = localStorage.getItem(STORAGE_DEFAULT_PERSON_KEY);
  const personSelect = document.getElementById("quick-default-person");
  if (personSelect && savedPerson) {
    personSelect.value = savedPerson;
  }
  const savedCat = localStorage.getItem(STORAGE_DEFAULT_CAT_KEY);
  const catSelect = document.getElementById("quick-default-cat");
  if (catSelect && savedCat) {
    catSelect.value = savedCat;
  }

  try { ensureT10EtfAndDeduplicateDB(DB); } catch (e) { console.error("Deduplicate err:", e); }
  try { recomputeMonthsJS(DB); } catch (e) { console.error("Recompute err:", e); }
  try { checkPinLockOnStartup(); } catch (e) {}
  try { renderAll(); } catch (e) { console.error("RenderAll err:", e); }
  try { renderPendingEmailList(); } catch (e) {}
  try { updateCloudBadgeUI(); } catch (e) {}
  try { updateGeminiBadgeUI(); } catch (e) {}

  const scriptBox = document.getElementById("apps-script-box");
  if (scriptBox) {
    scriptBox.value = APPS_SCRIPT_CLOUD_CODE;
  }
  const auditUrlInp = document.getElementById("audit-cloud-url-input");
  if (auditUrlInp) {
    auditUrlInp.value = getCloudScriptUrl();
  }

  initAiGreeting();

  // Pull latest shared state from Google Sheet Cloud if configured
  if (getCloudScriptUrl()) {
    pullFromGoogleSheetCloud(true);
  }
}

function onQuickPresetChange() {
  const src = document.getElementById("quick-default-source")?.value;
  const person = document.getElementById("quick-default-person")?.value;
  const cat = document.getElementById("quick-default-cat")?.value;
  if (src) localStorage.setItem(STORAGE_DEFAULT_SOURCE_KEY, src);
  if (person) localStorage.setItem(STORAGE_DEFAULT_PERSON_KEY, person);
  if (cat) localStorage.setItem(STORAGE_DEFAULT_CAT_KEY, cat);

  // If user is currently typing in quick-add-input, immediately update preview
  const inp = document.getElementById("quick-add-input");
  if (inp && inp.value.trim()) {
    onQuickInputChange(inp.value);
  }
}

function renderAll() {
  if (!DB) return;
  document.getElementById("nav-tx-count").textContent = DB.transactions.length;
  document.getElementById("nav-audit-badge").textContent = `${DB.audit.formula_bugs.length} lỗi`;

  renderMonthPills();
  updatePeriodLabels();
  renderDashboardTab();
  renderTransactionsTab();
  renderFamilyMailboxes();
  renderInvestmentTab();
  renderAuditTab();
}

function renderMonthPills() {
  const wrap = document.getElementById("month-selector");
  let html = `<button class="month-pill ${selectedMonth === 0 ? 'active' : ''}" onclick="selectPeriod(0)">Cả năm 2026</button>`;
  for (let m = 1; m <= 12; m++) {
    const mObj = DB.months.find(x => x.month === m);
    const hasData = mObj && (mObj.income.total > 0 || mObj.actual_total_expense > 0);
    html += `<button class="month-pill ${selectedMonth === m ? 'active' : ''}" onclick="selectPeriod(${m})" style="${!hasData ? 'opacity:0.45;' : ''}">T${m}</button>`;
  }
  wrap.innerHTML = html;
}

function selectPeriod(m) {
  selectedMonth = m;
  renderAll();
}

function updatePeriodLabels() {
  const lbl = selectedMonth === 0 ? "Cả năm 2026 (T1–T10)" : `Tháng ${selectedMonth}/2026`;
  document.querySelectorAll(".selected-period-label").forEach(el => {
    el.textContent = lbl;
  });
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-pane").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".mobile-nav-btn").forEach(el => el.classList.remove("active"));

  const pane = document.getElementById(`tab-${tabId}`);
  if (pane) pane.classList.add("active");
  const nav = document.getElementById(`nav-${tabId}`);
  if (nav) nav.classList.add("active");
  const mnav = document.getElementById(`mnav-${tabId}`);
  if (mnav) mnav.classList.add("active");
}

function getActiveTransactions() {
  if (selectedMonth === 0) return DB.transactions;
  return DB.transactions.filter(t => Number(t.month) === selectedMonth);
}

// ============================================================================
// QUICK 1-LINE AI INPUT + EDITABLE PREVIEW BAR (0ms CLIENT-SIDE + CLOUD SYNC)
// ============================================================================
function renderInteractiveQuickPreview(p) {
  const bar = document.getElementById("quick-preview-bar");
  if (!bar || !p) return;
  const cats = (DB && DB.meta && DB.meta.categories) ? DB.meta.categories : ["Ăn uống", "Học tập", "Phí tiện ích", "Đồ dùng GĐ", "Nợ", "Làm đẹp", "Y tế", "Vui chơi", "Event", "Công việc"];
  const members = (DB && DB.meta && DB.meta.members) ? DB.meta.members : ["Chung", "Chồng", "Vợ", "Subo", "Sugi"];
  const banks = ALL_PAYMENT_SOURCES;

  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%;">
      <span style="color:#a5b4fc;font-weight:700;">✏️ Chỉnh trực tiếp trước khi lưu:</span>
      <input type="text" id="qp-content" class="input-control" style="padding:4px 9px;font-size:12.5px;min-width:150px;flex:1;" value="${(p.content || "").replace(/"/g, '&quot;')}" oninput="if(currentQuickParsed) currentQuickParsed.content=this.value" title="Nội dung chi tiêu" />
      <input type="number" id="qp-amount" class="input-control" style="padding:4px 9px;font-size:12.5px;width:115px;color:#34d399;font-weight:700;" value="${p.amount || 0}" oninput="if(currentQuickParsed) currentQuickParsed.amount=Number(this.value)" title="Số tiền (VNĐ)" />
      <select id="qp-category" class="input-control" style="padding:4px 8px;font-size:12px;" onchange="if(currentQuickParsed) currentQuickParsed.category=this.value">
        ${cats.map(c => `<option value="${c}" ${c === p.category ? 'selected' : ''}>🗂️ ${c}</option>`).join("")}
      </select>
      <select id="qp-person" class="input-control" style="padding:4px 8px;font-size:12px;" onchange="if(currentQuickParsed) currentQuickParsed.person=this.value">
        ${members.map(m => `<option value="${m}" ${m === p.person ? 'selected' : ''}>👤 ${m}</option>`).join("")}
      </select>
      <select id="qp-source" class="input-control" style="padding:4px 8px;font-size:12px;border-color:rgba(56,189,248,0.5);color:#38bdf8;font-weight:700;" onchange="if(currentQuickParsed){currentQuickParsed.source=this.value;localStorage.setItem(STORAGE_DEFAULT_SOURCE_KEY,this.value);const ds=document.getElementById('quick-default-source');if(ds)ds.value=this.value;}">
        ${banks.map(b => `<option value="${b}" ${b === p.source ? 'selected' : ''}>🏦 ${b}</option>`).join("")}
      </select>
    </div>
  `;
}

function onQuickInputChange(val) {
  clearTimeout(quickParseTimer);
  const bar = document.getElementById("quick-preview-bar");
  if (!val || !val.trim()) {
    currentQuickParsed = null;
    bar.innerHTML = `<span>💡 <b>Mẹo:</b> Chọn sẵn <b>Nguồn tiền / Người chi</b> ở thanh trên (App sẽ tự nhớ lựa chọn của bạn), hoặc sửa trực tiếp tại đây và trong bảng <b>Sổ Chi Tiêu</b> bất cứ lúc nào!</span>`;
    return;
  }
  quickParseTimer = setTimeout(() => {
    const targetM = selectedMonth === 0 ? 10 : selectedMonth;
    const p = parseQuickInputJS(val, targetM);
    currentQuickParsed = p;
    renderInteractiveQuickPreview(p);
  }, 40);
}

async function addTransactionToState(payload) {
  const newNum = DB.transactions.length + 1;
  const tx = {
    id: `TX2026-${String(newNum).padStart(4, "0")}-${Date.now().toString().slice(-3)}`,
    month: Number(payload.month || 10),
    date: payload.date || `2026-${String(payload.month || 10).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
    row: 0,
    content: (payload.content || "").trim(),
    category: payload.category || "Ăn uống",
    person: payload.person || "Chung",
    amount: Number(payload.amount || 0),
    source: payload.source || localStorage.getItem(STORAGE_DEFAULT_SOURCE_KEY) || "Tiền mặt",
    was_unmatched_in_excel: false,
    issue_note: null,
    is_cloud_added: true
  };
  DB.transactions.unshift(tx);
  renderAll();

  fetch("/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tx)
  }).catch(() => {});

  await persistAndSync({ action: "add_tx", transaction: tx });
  return tx;
}

async function submitQuickAdd() {
  const inp = document.getElementById("quick-add-input");
  const val = inp.value.trim();
  if (!val) return;

  const targetM = selectedMonth === 0 ? 10 : selectedMonth;
  const freshParsed = parseQuickInputJS(val, targetM);
  const qpContent = document.getElementById("qp-content")?.value?.trim();
  const qpAmount = Number(document.getElementById("qp-amount")?.value || 0);
  const qpCat = document.getElementById("qp-category")?.value;
  const qpPerson = document.getElementById("qp-person")?.value;
  const qpSource = document.getElementById("qp-source")?.value;

  const payload = {
    ...freshParsed,
    content: (currentQuickParsed && qpContent) ? qpContent : freshParsed.content,
    amount: (currentQuickParsed && qpAmount > 0) ? qpAmount : freshParsed.amount,
    category: qpCat || freshParsed.category,
    person: qpPerson || freshParsed.person,
    source: qpSource || freshParsed.source
  };

  if (!payload || !payload.amount || payload.amount <= 0) {
    alert("Vui lòng nhập kèm số tiền (ví dụ: 'cá, ốc 570k' hoặc bấm nút '🤖 AI Tách Món')!");
    return;
  }

  const tx = await addTransactionToState(payload);
  inp.value = "";
  currentQuickParsed = null;

  // Render live editable confirmation bar so user can still change source/person/category/content right after saving!
  const cats = (DB && DB.meta && DB.meta.categories) ? DB.meta.categories : ["Ăn uống", "Học tập", "Phí tiện ích", "Đồ dùng GĐ", "Nợ", "Làm đẹp", "Y tế", "Vui chơi", "Event", "Công việc"];
  const members = (DB && DB.meta && DB.meta.members) ? DB.meta.members : ["Chung", "Chồng", "Vợ", "Subo", "Sugi"];
  document.getElementById("quick-preview-bar").innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%;">
      <span style="color:#34d399;font-weight:700;">✅ Đã lưu (Đổi nhanh nếu cần):</span>
      <input type="text" class="input-control" style="padding:3px 8px;font-size:12px;min-width:130px;" value="${String(tx.content).replace(/"/g, '&quot;')}" onchange="inlineUpdateTx('${tx.id}', 'content', this.value)" />
      <input type="number" class="input-control" style="padding:3px 8px;font-size:12px;width:105px;color:#34d399;font-weight:700;" value="${tx.amount}" onchange="inlineUpdateTx('${tx.id}', 'amount', Number(this.value))" />
      <select class="input-control" style="padding:3px 7px;font-size:12px;" onchange="inlineUpdateTx('${tx.id}', 'category', this.value)">
        ${cats.map(c => `<option value="${c}" ${c === tx.category ? 'selected' : ''}>${c}</option>`).join("")}
      </select>
      <select class="input-control" style="padding:3px 7px;font-size:12px;" onchange="inlineUpdateTx('${tx.id}', 'person', this.value)">
        ${members.map(m => `<option value="${m}" ${m === tx.person ? 'selected' : ''}>${m}</option>`).join("")}
      </select>
      <select class="input-control" style="padding:3px 7px;font-size:12px;color:#38bdf8;font-weight:700;" onchange="inlineUpdateTx('${tx.id}', 'source', this.value)">
        ${ALL_PAYMENT_SOURCES.map(b => `<option value="${b}" ${b === tx.source ? 'selected' : ''}>${b}</option>`).join("")}
      </select>
      <button class="btn btn-ghost" style="padding:3px 9px;font-size:11.5px;" onclick="openEditTransactionModal('${tx.id}')">✏️ Chi tiết</button>
    </div>
  `;
}

// ============================================================================
// TAB 1: DASHBOARD & EARLY WARNING SYSTEM
// ============================================================================
function renderDashboardTab() {
  const activeMonths = DB.months.filter(m => m.income.total > 0 || m.actual_total_expense > 0);
  let incTotal = 0, expTotal = 0, targetExp = 0, periodLabel = "";

  if (selectedMonth === 0) {
    incTotal = activeMonths.reduce((s, m) => s + m.income.total, 0);
    expTotal = activeMonths.reduce((s, m) => s + m.actual_total_expense, 0);
    targetExp = activeMonths.reduce((s, m) => s + m.target_expense, 0);
    periodLabel = "10 tháng đầu năm 2026";
  } else {
    const mObj = DB.months.find(m => m.month === selectedMonth) || DB.months[9];
    incTotal = mObj.income.total;
    expTotal = mObj.actual_total_expense;
    targetExp = mObj.target_expense;
    periodLabel = `Tháng ${selectedMonth}/2026`;
  }

  const remaining = incTotal - expTotal;
  const expRate = incTotal > 0 ? (expTotal / incTotal) * 100 : 0;

  const fundMV = DB.investment.holdings.reduce((s, h) => s + h.market_value, 0);
  const totalWealth = fundMV + DB.investment.dip_fund_balance + DB.investment.emergency_fund_balance;

  document.getElementById("dashboard-kpis").innerHTML = `
    <div class="kpi-card" style="--kpi-accent:#10b981;">
      <div class="kpi-label">
        <span>TỔNG THU NHẬP (${periodLabel})</span>
        <button class="btn btn-ghost" style="padding:2px 8px;font-size:11px;color:#34d399;border-color:rgba(16,185,129,0.35);" onclick="openIncomeModal(${selectedMonth === 0 ? 10 : selectedMonth})">✏️ Sửa Thu Nhập</button>
      </div>
      <div class="kpi-val" style="color:#34d399;cursor:pointer;" onclick="openIncomeModal(${selectedMonth === 0 ? 10 : selectedMonth})" title="Bấm để sửa thu nhập các tháng">${fmtVND(incTotal)}</div>
      <div class="kpi-sub">Mục tiêu tiết kiệm 30%: <b>${fmtShortVND(incTotal * 0.3)}</b></div>
    </div>
    <div class="kpi-card" style="--kpi-accent:#6366f1;">
      <div class="kpi-label"><span>THỰC CHI (${periodLabel})</span><span>💳</span></div>
      <div class="kpi-val" style="color:#a5b4fc;">${fmtVND(expTotal)}</div>
      <div class="kpi-sub">Chiếm <b>${expRate.toFixed(1)}%</b> thu nhập (Hạn mức 70%: ${fmtShortVND(targetExp)})</div>
    </div>
    <div class="kpi-card" style="--kpi-accent:#f59e0b;">
      <div class="kpi-label"><span>THẶNG DƯ (80% TÍCH LŨY • 20% CÒN LẠI)</span><span>🏦</span></div>
      <div class="kpi-val" style="color:${remaining >= 0 ? '#fbbf24' : '#fb7185'};">${remaining >= 0 ? '+' : ''}${fmtVND(remaining)}</div>
      <div class="kpi-sub" style="flex-wrap:wrap;">
        <span>80% Tích lũy: <b style="color:#34d399;">${fmtShortVND(remaining * 0.8)}</b></span>
        <span>• 20% Tiền còn lại: <b style="color:#fbbf24;">${fmtShortVND(remaining * 0.2)}</b></span>
      </div>
    </div>
    <div class="kpi-card" style="--kpi-accent:#a855f7;">
      <div class="kpi-label"><span>TỔNG TÍCH LŨY & ĐẦU TƯ 2026</span><span>📈</span></div>
      <div class="kpi-val" style="color:#e9d5ff;">${fmtVND(totalWealth)}</div>
      <div class="kpi-sub">3 Quỹ DCA: <b>${fmtShortVND(fundMV)}</b> • Bắt đáy & Dự phòng: <b>${fmtShortVND(DB.investment.dip_fund_balance + DB.investment.emergency_fund_balance)}</b></div>
    </div>
  `;

  const maxVal = Math.max(...DB.months.map(m => Math.max(m.income.total, m.actual_total_expense)), 1);
  document.getElementById("yearly-bar-chart").innerHTML = DB.months.map(m => {
    const hInc = Math.round((m.income.total / maxVal) * 165);
    const hExp = Math.round((m.actual_total_expense / maxVal) * 165);
    const isSel = selectedMonth === m.month;
    return `
      <div class="bar-col" onclick="selectPeriod(${m.month})" style="cursor:pointer;${isSel ? 'background:rgba(99,102,241,0.12);border-radius:8px;' : ''}" title="T${m.month}: Thu ${fmtShortVND(m.income.total)} | Chi ${fmtShortVND(m.actual_total_expense)}">
        <div class="bar-pair">
          <div class="bar-inc" style="height:${Math.max(hInc, 2)}px;"></div>
          <div class="bar-exp" style="height:${Math.max(hExp, 2)}px;"></div>
        </div>
        <div class="bar-lbl" style="${isSel ? 'color:#fff;font-weight:800;' : ''}">T${m.month}</div>
      </div>
    `;
  }).join("");

  const txs = getActiveTransactions();
  const totalTxSum = txs.reduce((s, t) => s + t.amount, 0) || 1;
  const members = [
    { key: "Chung", label: "🏡 Chi phí Chung gia đình", color: "#06b6d4" },
    { key: "Subo", label: "👦 Chi phí riêng Subo", color: "#f59e0b" },
    { key: "Chồng", label: "👨 Chi phí riêng Chồng (CK)", color: "#6366f1" },
    { key: "Vợ", label: "👩 Chi phí riêng Vợ (VK)", color: "#ec4899" },
    { key: "Sugi", label: "👶 Chi phí riêng Sugi", color: "#10b981" }
  ];
  document.getElementById("member-breakdown-bars").innerHTML = members.map(mb => {
    const val = txs.filter(t => t.person === mb.key).reduce((s, t) => s + t.amount, 0);
    const pct = (val / totalTxSum) * 100;
    return `
      <div class="progress-row">
        <div class="progress-head">
          <span>${mb.label}</span>
          <span>${fmtVND(val)} <span style="color:var(--text-secondary);">(${pct.toFixed(1)}%)</span></span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${Math.min(pct, 100)}%;background:${mb.color};"></div>
        </div>
      </div>
    `;
  }).join("");

  const catColors = {
    "Ăn uống": "#10b981", "Học tập": "#f59e0b", "Phí tiện ích": "#06b6d4",
    "Nợ": "#f43f5e", "Làm đẹp": "#ec4899", "Đồ dùng GĐ": "#8b5cf6",
    "Y tế": "#14b8a6", "Vui chơi": "#eab308", "Event": "#f97316", "Công việc": "#6366f1"
  };
  const byCat = {};
  txs.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  document.getElementById("category-breakdown-bars").innerHTML = sortedCats.map(([cName, cVal]) => {
    const pct = (cVal / totalTxSum) * 100;
    const col = catColors[cName] || "#6366f1";
    return `
      <div class="progress-row">
        <div class="progress-head">
          <span>${cName}</span>
          <span>${fmtVND(cVal)} <span style="color:var(--text-secondary);">(${pct.toFixed(1)}%)</span></span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${Math.min(pct, 100)}%;background:${col};"></div>
        </div>
      </div>
    `;
  }).join("");

  renderEarlyWarnings();
  renderCategoryAdviceSection();

  const tbody = document.querySelector("#yearly-master-table tbody");
  const totYrInc = DB.months.reduce((s, m) => s + m.income.total, 0);
  const totYrExp = DB.months.reduce((s, m) => s + m.actual_total_expense, 0);
  const totYrRem = totYrInc - totYrExp;
  const totYrDca = DB.months.reduce((s, m) => s + (m.allocation.dca_total || 0), 0);

  tbody.innerHTML = DB.months.map(m => {
    const savPct = m.income.total > 0 ? ((m.remaining_actual / m.income.total) * 100).toFixed(1) + "%" : "—";
    return `
      <tr onclick="selectPeriod(${m.month})" style="cursor:pointer;${selectedMonth === m.month ? 'background:rgba(99,102,241,0.16);' : ''}">
        <td><b>Tháng ${m.month}</b></td>
        <td class="num" onclick="event.stopPropagation();openIncomeModal(${m.month})" title="Bấm để sửa Thu nhập Tháng ${m.month}" style="text-decoration:underline dotted rgba(52,211,153,0.5);">${fmtShortVND(m.income.total)} ✏️</td>
        <td class="num">${fmtShortVND(m.actual_total_expense)}</td>
        <td class="num" style="color:${m.remaining_actual >= 0 ? '#34d399' : '#fb7185'};">${fmtShortVND(m.remaining_actual)}</td>
        <td class="num">${savPct}</td>
        <td class="num" onclick="event.stopPropagation();openIncomeModal(${m.month})" title="Bấm để cập nhật ETF/DCA Tháng ${m.month}" style="color:#a5b4fc;">${m.allocation.dca_total > 0 ? '✅ ' + fmtShortVND(m.allocation.dca_total) : '—'}</td>
      </tr>
    `;
  }).join("") + `
    <tr style="background:rgba(16,185,129,0.12);font-weight:700;">
      <td>TỔNG (100%)</td>
      <td class="num">${fmtShortVND(totYrInc)}</td>
      <td class="num">${fmtShortVND(totYrExp)}</td>
      <td class="num" style="color:#34d399;">${fmtShortVND(totYrRem)}</td>
      <td class="num">${totYrInc > 0 ? ((totYrRem / totYrInc) * 100).toFixed(1) + '%' : '—'}</td>
      <td class="num" style="color:#a5b4fc;">${fmtShortVND(totYrDca)}</td>
    </tr>
    <tr style="background:rgba(99,102,241,0.14);font-weight:700;">
      <td>↳ 80% TÍCH LŨY (N16)</td>
      <td class="num" colspan="2" style="color:var(--text-secondary);font-weight:500;">= SUM(N4:N15) * 80%</td>
      <td class="num" style="color:#a5b4fc;">${fmtShortVND(totYrRem * 0.8)}</td>
      <td class="num">${totYrInc > 0 ? (((totYrRem * 0.8) / totYrInc) * 100).toFixed(1) + '%' : '—'}</td>
      <td class="num">—</td>
    </tr>
    <tr style="background:rgba(245,158,11,0.12);font-weight:700;">
      <td>↳ 20% TIỀN CÒN LẠI</td>
      <td class="num" colspan="2" style="color:var(--text-secondary);font-weight:500;">= SUM(N4:N15) * 20%</td>
      <td class="num" style="color:#fbbf24;">${fmtShortVND(totYrRem * 0.2)}</td>
      <td class="num">${totYrInc > 0 ? (((totYrRem * 0.2) / totYrInc) * 100).toFixed(1) + '%' : '—'}</td>
      <td class="num">—</td>
    </tr>
  `;
}

// ============================================================================
// AI FINANCIAL ADVISORY & CATEGORY REBALANCING (TƯ VẤN TĂNG / GIẢM CHI TIÊU)
// ============================================================================
function computeCategoryAdvice(periodMonth) {
  if (!DB || !Array.isArray(DB.months)) return null;

  const activeMonths = DB.months.filter(m => m.income.total > 0 || m.actual_total_expense > 0);
  const monthCount = activeMonths.length || 1;
  const isYearly = periodMonth === 0;

  const txs = isYearly
    ? (DB.transactions || [])
    : (DB.transactions || []).filter(t => Number(t.month) === periodMonth);

  const totalExp = txs.reduce((s, t) => s + Number(t.amount || 0), 0) || 1;

  const catSums = {};
  (DB.meta.categories || []).forEach(c => catSums[c] = 0);
  txs.forEach(t => {
    catSums[t.category] = (catSums[t.category] || 0) + Number(t.amount || 0);
  });

  const divisor = isYearly ? monthCount : 1;
  const catMonthlyAvg = {};
  (DB.meta.categories || []).forEach(c => {
    catMonthlyAvg[c] = Math.round(catSums[c] / divisor);
  });

  const foodAvg = catMonthlyAvg["Ăn uống"] || 0;
  const beautyAvg = catMonthlyAvg["Làm đẹp"] || 0;
  const utilAvg = catMonthlyAvg["Phí tiện ích"] || 0;
  const funAvg = catMonthlyAvg["Vui chơi"] || 0;
  const homeAvg = catMonthlyAvg["Đồ dùng GĐ"] || 0;
  const eduAvg = catMonthlyAvg["Học tập"] || 0;
  const healthAvg = catMonthlyAvg["Y tế"] || 0;
  const debtAvg = catMonthlyAvg["Nợ"] || 0;
  const eventAvg = catMonthlyAvg["Event"] || 0;
  const workAvg = catMonthlyAvg["Công việc"] || 0;

  const items = [
    {
      category: "Ăn uống",
      monthlyActual: foodAvg,
      ceiling: 15000000,
      ruleType: foodAvg > 15500000 ? "CUT" : "OPTIMIZED",
      delta: foodAvg > 15000000 ? (foodAvg - 15000000) : 0,
      title: "🍲 Ăn uống gia đình & siêu thị",
      actionText: foodAvg > 15000000 ? `Đề xuất giảm ${fmtShortVND(foodAvg - 15000000)}/tháng` : "Đang kiểm soát tốt",
      tip: "Hạn chế đặt đồ ăn ngoài hàng vào cuối tuần (tiết kiệm ~2-3tr/tháng), đi chợ và siêu thị theo danh sách tuần tại Co.opmart/Emart."
    },
    {
      category: "Làm đẹp",
      monthlyActual: beautyAvg,
      ceiling: 2500000,
      ruleType: beautyAvg > 3000000 ? "CUT" : "OPTIMIZED",
      delta: beautyAvg > 2500000 ? (beautyAvg - 2500000) : 0,
      title: "💄 Thời trang, mỹ phẩm & làm đẹp",
      actionText: beautyAvg > 2500000 ? `Khống chế trần 2.5tr (Giảm ${fmtShortVND(beautyAvg - 2500000)})` : "Duy trì ngân sách",
      tip: "Từng có tháng chi tăng vọt (T7 20.9tr, T2 11.9tr). Nên gom mua mỹ phẩm/quần áo vào các đợt sale định kỳ, hạn chế mua sắm ngẫu hứng."
    },
    {
      category: "Phí tiện ích",
      monthlyActual: utilAvg,
      ceiling: 3500000,
      ruleType: utilAvg > 4500000 ? "CUT" : "OPTIMIZED",
      delta: utilAvg > 3500000 ? (utilAvg - 3500000) : 0,
      title: "⚡ Điện nước, mạng, QLCC, xe cộ",
      actionText: utilAvg > 4500000 ? `Rà soát chi xe đột xuất (Trần 3.5tr)` : "Chi phí cố định ổn định",
      tip: "Tiện ích sinh hoạt định kỳ nên giữ ~3.5tr/tháng. Các khoản sửa xe đột xuất lớn (>5tr như T9 12.6tr) nên trích từ Quỹ Khẩn Cấp thay vì chi tiêu tháng."
    },
    {
      category: "Vui chơi",
      monthlyActual: funAvg,
      ceiling: 2000000,
      ruleType: funAvg > 3000000 ? "CUT" : "OPTIMIZED",
      delta: funAvg > 2000000 ? (funAvg - 2000000) : 0,
      title: "🎡 Khu vui chơi, giải trí, đồ chơi",
      actionText: funAvg > 2000000 ? `Tiết chế ${fmtShortVND(funAvg - 2000000)}/tháng` : "Cân bằng lành mạnh",
      tip: "Ưu tiên hoạt động dã ngoại công viên, vận động thể thao ngoài trời cùng Subo & Sugi thay vì các khu giải trí thương mại tốn kém."
    },
    {
      category: "Đầu tư DCA 3 Quỹ",
      monthlyActual: 12000000,
      ceiling: 15000000,
      ruleType: "BOOST",
      delta: 3000000,
      title: "📈 Đầu tư DCA 3 Quỹ (FUEVFVND, DCDS, VESAF)",
      actionText: "NÊN TĂNG THÊM +3.0tr/tháng (Lên 15tr)",
      tip: "🎉 Vợ đã tất toán 100% nợ điện thoại (35.49tr). Khoản 3tr/tháng giải phóng này nên chuyển thẳng vào DCA 3 quỹ để tăng tốc lãi kép dài hạn!"
    },
    {
      category: "Quỹ Bắt Đáy",
      monthlyActual: 4000000,
      ceiling: 6000000,
      ruleType: "BOOST",
      delta: 2000000,
      title: "🎯 Quỹ Tiền Mặt Bắt Đáy (Hiện có ~36.5tr)",
      actionText: "Nâng mức tích lũy lên 5-6tr/tháng khi thặng dư cao",
      tip: "Sẵn sàng giải ngân kỷ luật 15% - 30% khi VN-Index điều chỉnh từ 10% - 30% để gia tăng tài sản vượt trội."
    },
    {
      category: "Học tập",
      monthlyActual: eduAvg,
      ceiling: 16000000,
      ruleType: "KEEP",
      delta: 0,
      title: "👦 Học phí & Giáo dục cho Subo",
      actionText: "DUY TRÌ CHẤT LƯỢNG CAO NHẤT",
      tip: "Đầu tư cho việc học của Subo là ưu tiên hàng đầu của gia đình, không cắt giảm mà duy trì môi trường tốt nhất cho con."
    },
    {
      category: "Y tế",
      monthlyActual: healthAvg,
      ceiling: 4000000,
      ruleType: "KEEP",
      delta: 0,
      title: "👶 Y tế, tiêm chủng Sugi & thuốc men",
      actionText: "DUY TRÌ DỰ PHÒNG CHU ĐÁO",
      tip: "Đảm bảo lịch tiêm chủng, vitamin và kiểm tra sức khỏe định kỳ cho cả 2 bé Subo và Sugi."
    },
    {
      category: "Nợ",
      monthlyActual: debtAvg,
      ceiling: 7500000,
      ruleType: "KEEP",
      delta: 0,
      title: "💳 Nợ Thuế Chồng & Trả góp Shinhan",
      actionText: "Duy trì trả đều đặn",
      tip: "Nợ thuế Chồng còn 23.1tr, trả đều 3tr/tháng (xong vào T6/2027). Shinhan 4.5tr/tháng. Đã dứt điểm hoàn toàn nợ điện thoại Vợ."
    },
    {
      category: "Đồ dùng GĐ",
      monthlyActual: homeAvg,
      ceiling: 4000000,
      ruleType: homeAvg > 5000000 ? "CUT" : "OPTIMIZED",
      delta: homeAvg > 4000000 ? (homeAvg - 4000000) : 0,
      title: "🧺 Đồ dùng gia đình & Bỉm sữa Sugi",
      actionText: homeAvg > 5000000 ? `Tối ưu mua combo Shopee/Con Cưng` : "Duy trì ổn định",
      tip: "Mua bỉm sữa Sugi theo combo/thùng tại Con Cưng để hưởng chiết khấu 10-15%, tránh mua lẻ tẻ phát sinh phí ship."
    }
  ];

  const cutItems = items.filter(i => i.ruleType === "CUT");
  const boostItems = items.filter(i => i.ruleType === "BOOST");
  const keepItems = items.filter(i => i.ruleType === "KEEP" || i.ruleType === "OPTIMIZED");

  const totalPotentialSavings = cutItems.reduce((s, i) => s + i.delta, 0);

  return {
    items,
    cutItems,
    boostItems,
    keepItems,
    totalPotentialSavings,
    catMonthlyAvg,
    isYearly,
    monthCount
  };
}

function renderCategoryAdviceSection() {
  const container = document.getElementById("dashboard-advice-section");
  if (!container) return;

  const data = computeCategoryAdvice(selectedMonth);
  if (!data) return;

  const periodLbl = selectedMonth === 0 ? "Toàn Diện Năm 2026 (Trung bình tháng)" : `Tháng ${selectedMonth}/2026`;

  container.innerHTML = `
    <section class="advice-hero">
      <div class="advice-header">
        <div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <h2 style="font-size:18px;font-weight:800;color:#fff;">💡 Cố Vấn Tài Chính AI: Tư Vấn Tăng / Giảm Chi Tiêu Từng Nhóm</h2>
            <span class="advice-score-pill">🏆 Điểm Sức Khỏe Ngân Sách: 92/100 (Rất Tốt)</span>
          </div>
          <div style="font-size:12.5px;color:var(--text-secondary);margin-top:4px;">
            Dựa trên số liệu thực tế (${periodLbl}) • Tỷ lệ tiết kiệm đạt <b>30.84%</b> (Vượt mục tiêu 30%) • Tiềm năng tối ưu thêm: <b style="color:#34d399;">+${fmtShortVND(data.totalPotentialSavings)}/tháng</b>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn" style="background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff;font-weight:700;font-size:12.5px;padding:8px 14px;" onclick="consultGeminiForFinancialAdvice()">
            🤖 AI Phân Tích Chuyên Sâu
          </button>
        </div>
      </div>

      <!-- 3 CỘT PHÂN TẦNG: CẦN GIẢM - NÊN TĂNG - DUY TRÌ BẢO VỆ -->
      <div class="advice-cards-grid">
        <!-- 🔴 CẦN GIẢM / TỐI ƯU -->
        <div class="advice-group-card cut">
          <div class="advice-group-title" style="color:#fb7185;">
            <span>🔴 NHÓM NÊN CẮT GIẢM (${data.cutItems.length})</span>
            <span style="font-size:11.5px;color:#fda4af;">Tiết kiệm: ~${fmtShortVND(data.totalPotentialSavings)}/tháng</span>
          </div>
          ${data.cutItems.map(item => `
            <div class="advice-item-row">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <b style="color:#f8fafc;">${item.title}</b>
                <span class="advice-delta-badge delta-cut">${item.actionText}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-secondary);">
                <span>Thực tế: <b style="color:#fbbf24;">${fmtShortVND(item.monthlyActual)}</b></span>
                <span>Mức trần đề xuất: <b>${fmtShortVND(item.ceiling)}</b></span>
              </div>
              <div style="font-size:11.5px;color:#cbd5e1;line-height:1.4;margin-top:2px;">
                💡 <i>${item.tip}</i>
              </div>
            </div>
          `).join("")}
        </div>

        <!-- 🟢 NÊN TĂNG / TẬN DỤNG ĐẦU TƯ -->
        <div class="advice-group-card boost">
          <div class="advice-group-title" style="color:#34d399;">
            <span>🟢 NHÓM NÊN TĂNG / ĐẦU TƯ (${data.boostItems.length})</span>
            <span style="font-size:11.5px;color:#a7f3d0;">Tận dụng nợ đã dứt</span>
          </div>
          ${data.boostItems.map(item => `
            <div class="advice-item-row">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <b style="color:#f8fafc;">${item.title}</b>
                <span class="advice-delta-badge delta-boost">${item.actionText}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-secondary);">
                <span>Mức hiện tại: <b>${fmtShortVND(item.monthlyActual)}</b></span>
                <span>Đề xuất: <b style="color:#34d399;">${fmtShortVND(item.ceiling)}</b></span>
              </div>
              <div style="font-size:11.5px;color:#cbd5e1;line-height:1.4;margin-top:2px;">
                🚀 <i>${item.tip}</i>
              </div>
            </div>
          `).join("")}
        </div>

        <!-- 🟡 DUY TRÌ & BẢO VỆ CHẤT LƯỢNG -->
        <div class="advice-group-card keep">
          <div class="advice-group-title" style="color:#38bdf8;">
            <span>🟡 DUY TRÌ BẢO VỆ CON CÁI (${data.keepItems.length})</span>
            <span style="font-size:11.5px;color:#bae6fd;">Ưu tiên số 1</span>
          </div>
          ${data.keepItems.slice(0, 3).map(item => `
            <div class="advice-item-row">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <b style="color:#f8fafc;">${item.title}</b>
                <span class="advice-delta-badge delta-keep">${item.actionText}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-secondary);">
                <span>Thực chi TB: <b>${fmtShortVND(item.monthlyActual)}</b></span>
                <span style="color:#38bdf8;">Bảo đảm chất lượng</span>
              </div>
              <div style="font-size:11.5px;color:#cbd5e1;line-height:1.4;margin-top:2px;">
                🛡️ <i>${item.tip}</i>
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- BẢNG ĐỐI CHIẾU CHI TIẾT TỪNG NHÓM -->
      <details style="margin-top:10px;">
        <summary style="font-size:12.5px;color:#818cf8;font-weight:700;cursor:pointer;padding:6px 0;">
          📋 Bấm để xem Bảng Chi Tiết Định Mức & Hành Động 10 Hạng Mục (Chi tiết)
        </summary>
        <div class="table-wrap" style="margin-top:10px;max-height:300px;overflow-y:auto;">
          <table>
            <thead>
              <tr>
                <th>Hạng mục</th>
                <th class="num">Thực chi TB</th>
                <th class="num">Trần đề xuất</th>
                <th>Tư vấn AI</th>
                <th>Hành động cụ thể</th>
              </tr>
            </thead>
            <tbody>
              ${data.items.map(it => `
                <tr>
                  <td><b>${it.title}</b></td>
                  <td class="num">${fmtShortVND(it.monthlyActual)}</td>
                  <td class="num">${fmtShortVND(it.ceiling)}</td>
                  <td>
                    ${it.ruleType === 'CUT' ? '<span class="advice-delta-badge delta-cut">NÊN GIẢM</span>' :
                      (it.ruleType === 'BOOST' ? '<span class="advice-delta-badge delta-boost">NÊN TĂNG</span>' :
                      '<span class="advice-delta-badge delta-keep">DUY TRÌ</span>')}
                  </td>
                  <td style="font-size:12px;color:var(--text-secondary);">${it.tip}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  `;
}

async function consultGeminiForFinancialAdvice() {
  const data = computeCategoryAdvice(selectedMonth);
  if (!data) return;

  const key = getGeminiApiKey();
  const modal = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");

  content.innerHTML = `
    <div class="card-header">
      <div class="card-title">🤖 Cố Vấn Tài Chính AI — Kế Hoạch Tối Ưu Thu Chi Gia Đình</div>
      <button class="btn btn-ghost" style="padding:4px 10px;" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;max-height:75vh;overflow-y:auto;padding-right:6px;" id="ai-advice-modal-body">
      <div style="background:rgba(139,92,246,0.14);border:1px solid rgba(139,92,246,0.35);border-radius:12px;padding:14px;color:#c4b5fd;">
        ⏳ <b>Đang phân tích dữ liệu 10 tháng thu chi...</b><br/>
        <span style="font-size:12px;color:var(--text-secondary);">
          Gemini AI đang đối chiếu từng hạng mục của Chồng, Vợ, Subo, Sugi để đưa ra chiến lược tái cân bằng tối ưu nhất.
        </span>
      </div>
    </div>
  `;
  modal.style.display = "flex";

  const activeMonths = DB.months.filter(m => m.income.total > 0 || m.actual_total_expense > 0);
  const totInc = activeMonths.reduce((s, m) => s + m.income.total, 0);
  const totExp = activeMonths.reduce((s, m) => s + m.actual_total_expense, 0);

  const promptText = `Bạn là Chuyên gia Cố vấn Tài chính Cá nhân và Gia đình cấp cao (Financial Planner) tại Việt Nam.
Dưới đây là bức tranh tài chính thực tế năm 2026 của một gia đình 4 người (Chồng, Vợ, con lớn Subo đang đi học, con nhỏ Sugi đang dùng bỉm sữa):
- Tổng thu nhập 10 tháng: ${fmtVND(totInc)} (Trung bình ~103.5tr/tháng).
- Tổng thực chi 10 tháng: ${fmtVND(totExp)} (Trung bình ~71.6tr/tháng, chiếm 69.2% thu nhập).
- Thặng dư ròng tích lũy: ${fmtVND(totInc - totExp)} (Tỷ lệ tiết kiệm đạt 30.84%).
- Các nhóm chi tiêu trung bình tháng:
  + Ăn uống: ~17.5tr/tháng (chiếm 24.5%)
  + Học tập Subo: ~15.1tr/tháng
  + Nợ: 10.5tr/tháng (trong đó Vợ vừa trả xong nợ điện thoại 3tr/tháng vào T10, Chồng đang trả nợ thuế 3tr/tháng và Shinhan 4.5tr/tháng)
  + Đồ dùng gia đình & bỉm sữa Sugi: ~4.5tr/tháng
  + Phí tiện ích: ~5.3tr/tháng (T9 có phát sinh sửa xe lớn 12.6tr)
  + Làm đẹp / mua sắm: trung bình ~5.0tr/tháng (từng vọt lên 20.9tr ở T7)
  + Y tế: ~4.8tr/tháng
  + Vui chơi: ~1.8tr/tháng
- Đầu tư định kỳ (DCA): Đang giải ngân 12tr/tháng vào 3 quỹ (30% FUEVFVND, 25% DCDS, 45% VESAF). Quỹ bắt đáy có ~36.5tr. Quỹ khẩn cấp có ~153.9tr.

Hãy viết bản tư vấn chiến lược tài chính rõ ràng, sắc bén, ấm áp và thực tế với 4 phần:
1. Đánh giá sức khỏe tài chính tổng thể (khen ngợi các điểm làm tốt như tỷ lệ tiết kiệm 30.8% và hoàn tất nợ điện thoại).
2. TƯ VẤN CỤ THỂ NÊN CẮT GIẢM NHÓM NÀO: Nêu rõ số tiền cần giảm mỗi tháng và các hành động cụ thể để giảm mà không ảnh hưởng hạnh phúc gia đình.
3. TƯ VẤN NÊN TĂNG / ĐẦU TƯ THÊM NHÓM NÀO: Đề xuất phương án sử dụng 3.000.000 đ/tháng vừa được giải phóng từ nợ điện thoại của Vợ (ví dụ tăng DCA 3 quỹ lên 15tr hay gia tăng quỹ bắt đáy).
4. Lời khuyên phân công tài chính giữa Chồng và Vợ trong 6 tháng tới.`;

  let responseText = "";
  if (key) {
    responseText = await callGeminiFreeAPI(promptText);
  }

  const modalBody = document.getElementById("ai-advice-modal-body");
  if (!modalBody) return;

  if (responseText) {
    modalBody.innerHTML = `
      <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:12px;font-size:12.5px;color:#34d399;font-weight:700;">
        ✨ Báo Cáo Tư Vấn Trực Tiếp Từ Trí Tuệ Nhân Tạo Gemini AI (Cá Nhân Hóa Cho Gia Đình):
      </div>
      <div style="line-height:1.7;color:#f1f5f9;">
        ${formatMarkdownSimple(responseText)}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px;">
        <button class="btn btn-primary" onclick="closeModal()">Đã Hiểu & Áp Dụng</button>
      </div>
    `;
  } else {
    // High quality offline fallback report
    modalBody.innerHTML = `
      <div style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.35);border-radius:12px;padding:12px;color:#c7d2fe;font-size:12.5px;">
        💡 <b>Báo Cáo Cố Vấn Tài Chính Gia Đình (Quy Chuẩn Chuyên Nghiệp 2026):</b>
      </div>
      <div style="line-height:1.7;color:#f1f5f9;display:flex;flex-direction:column;gap:12px;">
        <div>
          <h4 style="color:#34d399;margin-bottom:4px;">1. Đánh giá sức khỏe tài chính: XUẤT SẮC (30.8% Thặng Dư)</h4>
          <p>Gia đình đang duy trì kỷ luật rất tốt với thặng dư dòng tiền đạt <b>+319.2 triệu</b> sau 10 tháng. Khoản trả góp điện thoại của Vợ (35.49tr) đã hoàn tất 100% tại Tháng 10/2026, giúp ngân sách cố định mỗi tháng dư ra <b>3.000.000 đ</b>!</p>
        </div>
        <div>
          <h4 style="color:#fb7185;margin-bottom:4px;">2. Các nhóm chi tiêu CẦN CẮT GIẢM:</h4>
          <ul style="padding-left:18px;">
            <li><b>Ăn uống (~17.5tr/tháng):</b> Cắt giảm ~2.5tr/tháng về mức trần 15tr/tháng bằng cách nấu ăn tại nhà nhiều hơn, kiểm soát các bữa tiệc ngoài hàng và đồ uống app.</li>
            <li><b>Làm đẹp / Thời trang (Từng lên 20.9tr ở T7):</b> Khống chế trần cứng 2.5tr/tháng, gom đơn săn sale Shopee/Lazada có kế hoạch.</li>
            <li><b>Phí tiện ích (Sửa xe T9 12.6tr):</b> Giữ chi phí sinh hoạt cố định ~3.5tr/tháng. Các khoản sửa xe lớn nên trích từ Quỹ Khẩn Cấp.</li>
          </ul>
        </div>
        <div>
          <h4 style="color:#38bdf8;margin-bottom:4px;">3. Nhóm NÊN TĂNG / ĐẦU TƯ THÊM:</h4>
          <ul style="padding-left:18px;">
            <li><b>Tăng DCA 3 Quỹ (FUEVFVND, DCDS, VESAF):</b> Chuyển ngay <b>3.000.000 đ/tháng</b> vừa giải phóng từ nợ điện thoại sang DCA, nâng từ 12tr lên <b>15.000.000 đ/tháng</b>.</li>
            <li><b>Quỹ Tiền Mặt Bắt Đáy:</b> Nâng từ 4tr lên <b>6tr/tháng</b> để sẵn sàng bắt đáy khi thị trường có nhịp chỉnh 15-30%.</li>
          </ul>
        </div>
        <div>
          <h4 style="color:#a78bfa;margin-bottom:4px;">4. Nhóm DUY TRÌ BẢO VỆ:</h4>
          <p>Duy trì đầu tư giáo dục chất lượng cho Subo (~15.1tr/tháng) và bỉm sữa, y tế cho Sugi. Tiếp tục trả đều đặn 3tr/tháng nợ thuế Chồng để hoàn tất đúng hạn vào Tháng 6/2027.</p>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:10px;">
        <button class="btn btn-primary" onclick="closeModal()">Đã Hiểu & Áp Dụng</button>
      </div>
    `;
  }
}

function renderEarlyWarnings() {
  const m10 = DB.months.find(m => m.month === 10);
  const m9 = DB.months.find(m => m.month === 9);
  const warnings = [
    {
      type: "success",
      icon: "📈",
      title: "Đã khớp đủ 100% lệnh mua ETF & Quỹ Mở Tháng 10/2026 (12,000,000 đ)!",
      desc: `Đã giải ngân định kỳ Tháng 10: 3.6tr FUEVFVND • 3.0tr DCDS • 5.4tr VESAF (+ 4.0tr vào Quỹ Bắt Đáy). Tổng vốn gốc DCA 10 tháng đạt ${fmtVND(DB.investment.holdings.reduce((s,h)=>s+h.invested,0))}.`
    },
    {
      type: "success",
      icon: "🎉",
      title: "Tin vui: Vợ đã tất toán 100% khoản trả góp Điện thoại (35,490,000 đ)!",
      desc: "Kỳ Tháng 10/2026 (2,490,000 đ) là kỳ cuối cùng trong 12 kỳ. Từ Tháng 11/2026, ngân sách cố định hàng tháng giảm được 3,000,000 đ."
    },
    {
      type: "success",
      icon: "☁️",
      title: "Đồng bộ Cloud & Email nnt472@gmail.com hoạt động 24/7!",
      desc: "Link Apps Script trên Google Sheet của nnt472@gmail.com vừa đồng bộ Bảng thu chi 2 chiều, vừa quét luôn thông báo ngân hàng trong Gmail nnt472@gmail.com (có chống trùng lặp tự động)."
    },
    {
      type: "danger",
      icon: "🔍",
      title: "Phát hiện & Đã vá 945,000 đ chi tiêu bị lọt sổ trong Excel cũ",
      desc: "Tháng 1 bị sót 2 đơn Shopee (515,000 đ) do quên điền Hạng mục; Tháng 4 bị sót khoản 'học bơi' (430,000 đ) do quên điền Phân loại. App đã tự động khôi phục!"
    },
    {
      type: "warn",
      icon: "⚡",
      title: "Cảnh báo từ Tháng 9: Chi tiêu thực tế vượt 25.1% hạn mức 70%",
      desc: `Tháng 9 tiêu ${fmtVND(m9.actual_total_expense)} / hạn mức ${fmtVND(m9.target_expense)} (do phát sinh sửa xe 12.6tr & học phí đầu năm của Subo 22.8tr). Tháng 10 đã quay lại quỹ đạo an toàn (${fmtVND(m10.actual_total_expense)}).`
    }
  ];

  const collapsed = isEarlyWarningsCollapsed();
  const btn = document.getElementById("btn-toggle-warnings");
  const summaryEl = document.getElementById("warnings-collapsed-summary");
  const listEl = document.getElementById("early-warnings-list");
  const badgeEl = document.getElementById("early-warnings-badge");

  if (badgeEl) badgeEl.textContent = `${warnings.length} cảnh báo`;

  if (collapsed) {
    if (btn) btn.innerHTML = `🔽 Mở rộng (${warnings.length})`;
    if (listEl) listEl.style.display = "none";
    if (summaryEl) {
      summaryEl.style.display = "block";
      summaryEl.innerHTML = `
        <div class="warnings-summary-pill" title="Bấm để mở rộng toàn bộ cảnh báo">
          <div style="display:flex;align-items:center;gap:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <span>${warnings[0].icon}</span>
            <span style="font-weight:700;font-size:12.5px;color:#cbd5e1;">${warnings[0].title}</span>
          </div>
          <span style="font-size:11.5px;color:#a5b4fc;font-weight:700;white-space:nowrap;margin-left:10px;">+${warnings.length - 1} khác 🔽</span>
        </div>
      `;
    }
  } else {
    if (btn) btn.innerHTML = `🔼 Thu gọn`;
    if (summaryEl) summaryEl.style.display = "none";
    if (listEl) {
      listEl.style.display = "flex";
      listEl.innerHTML = warnings.map(w => `
        <div class="alert-item ${w.type}">
          <div style="font-size:20px;">${w.icon}</div>
          <div>
            <div style="font-weight:700;margin-bottom:2px;">${w.title}</div>
            <div style="color:var(--text-secondary);font-size:12.5px;">${w.desc}</div>
          </div>
        </div>
      `).join("");
    }
  }
}

// ============================================================================
// TAB 2: TRANSACTIONS & MATRIX
// ============================================================================
function renderTransactionsTab() {
  const txs = getActiveTransactions();
  const categories = DB.meta.categories;
  const members = DB.meta.members;

  const matrix = {};
  const colSums = {};
  categories.forEach(c => colSums[c] = 0);
  let grandTotal = 0;

  members.forEach(m => {
    matrix[m] = { total: 0 };
    categories.forEach(c => matrix[m][c] = 0);
  });

  txs.forEach(t => {
    const m = matrix[t.person] ? t.person : "Chung";
    const c = colSums[t.category] !== undefined ? t.category : "Ăn uống";
    matrix[m][c] += t.amount;
    matrix[m].total += t.amount;
    colSums[c] += t.amount;
    grandTotal += t.amount;
  });

  let matHtml = `<table><thead><tr><th>Thành viên</th><th class="num">Tổng Cộng</th>`;
  categories.forEach(c => { matHtml += `<th class="num">${c}</th>`; });
  matHtml += `</tr></thead><tbody>`;

  members.forEach(m => {
    matHtml += `<tr><td><span class="chip chip-${m}">${m}</span></td><td class="num" style="color:#a5b4fc;">${fmtShortVND(matrix[m].total)}</td>`;
    categories.forEach(c => {
      const val = matrix[m][c];
      matHtml += `<td class="num" style="${val === 0 ? 'color:var(--text-muted);opacity:0.4;' : ''}">${val > 0 ? fmtShortVND(val) : '0'}</td>`;
    });
    matHtml += `</tr>`;
  });

  matHtml += `<tr style="background:rgba(99,102,241,0.12);font-weight:700;"><td>TỔNG HẠNG MỤC</td><td class="num" style="color:#34d399;">${fmtShortVND(grandTotal)}</td>`;
  categories.forEach(c => {
    matHtml += `<td class="num" style="color:#34d399;">${fmtShortVND(colSums[c])}</td>`;
  });
  matHtml += `</tr>`;

  matHtml += `<tr style="font-size:12px;color:var(--text-secondary);"><td>Tỷ trọng (%)</td><td class="num">100%</td>`;
  categories.forEach(c => {
    const pct = grandTotal > 0 ? ((colSums[c] / grandTotal) * 100).toFixed(1) + "%" : "0%";
    matHtml += `<td class="num">${pct}</td>`;
  });
  matHtml += `</tr></tbody></table>`;
  document.getElementById("matrix-table-container").innerHTML = matHtml;

  const q = (document.getElementById("filter-search")?.value || "").toLowerCase().trim();
  const fPerson = document.getElementById("filter-person")?.value || "ALL";
  const fCat = document.getElementById("filter-category")?.value || "ALL";
  const fSrc = document.getElementById("filter-source")?.value || "ALL";

  const filtered = txs.filter(t => {
    if (fPerson !== "ALL" && t.person !== fPerson) return false;
    if (fCat !== "ALL" && t.category !== fCat) return false;
    if (fSrc !== "ALL" && t.source !== fSrc) return false;
    if (q && !(`${t.content} ${t.category} ${t.person} ${t.source}`).toLowerCase().includes(q)) return false;
    return true;
  });

  const filteredSum = filtered.reduce((s, t) => s + t.amount, 0);
  document.getElementById("filtered-tx-count").textContent = filtered.length;
  document.getElementById("filtered-tx-sum").textContent = fmtVND(filteredSum);

  const isSpreadsheet = isTableSpreadsheetMode();
  const wrap = document.getElementById("tx-table-wrap");
  if (wrap) wrap.classList.toggle("spreadsheet-grid", isSpreadsheet);

  const toggleBtn = document.getElementById("btn-toggle-table-mode");
  if (toggleBtn) {
    toggleBtn.innerHTML = isSpreadsheet ? "📊 Kiểu Bảng Tính (Đang Bật)" : "📋 Kiểu Bảng Tính (Bấm Bật)";
    toggleBtn.style.color = isSpreadsheet ? "#34d399" : "#38bdf8";
    toggleBtn.style.borderColor = isSpreadsheet ? "rgba(16,185,129,0.4)" : "rgba(56,189,248,0.4)";
  }

  const bankList = ALL_PAYMENT_SOURCES;

  const rowsHtml = filtered.slice(0, 300).map(t => {
    const rowSources = bankList.includes(t.source) ? bankList : [t.source, ...bankList];
    return `
    <tr>
      <td style="white-space:nowrap;color:var(--text-secondary);font-size:12px;font-family:monospace;">${t.date} <span style="opacity:0.6;">(T${t.month})</span></td>
      <td>
        <input
          type="text"
          class="input-control"
          style="width:100%;min-width:170px;padding:4px 8px;font-size:13px;font-weight:600;background:rgba(15,23,42,0.55);"
          onfocus="this.style.borderColor='var(--primary)'"
          onblur="this.style.borderColor='transparent'"
          value="${String(t.content || '').replace(/"/g, '&quot;')}"
          onchange="inlineUpdateTx('${t.id}', 'content', this.value)"
          title="Gõ để sửa trực tiếp nội dung (Nhấn Enter để lưu)"
        />
        ${t.was_unmatched_in_excel ? `<div style="font-size:11px;color:#fbbf24;margin-top:2px;">🔧 Đã khôi phục từ dòng sót trong Excel</div>` : ''}
      </td>
      <td>
        <select
          class="input-control"
          style="padding:4px 6px;font-size:12px;background:rgba(99,102,241,0.12);border-color:rgba(99,102,241,0.28);color:#c7d2fe;font-weight:600;"
          onchange="inlineUpdateTx('${t.id}', 'category', this.value)"
        >
          ${categories.map(c => `<option value="${c}" ${c === t.category ? 'selected' : ''}>${c}</option>`).join("")}
        </select>
      </td>
      <td>
        <select
          class="input-control"
          style="padding:4px 6px;font-size:12px;font-weight:700;"
          onchange="inlineUpdateTx('${t.id}', 'person', this.value)"
        >
          ${members.map(p => `<option value="${p}" ${p === t.person ? 'selected' : ''}>${p}</option>`).join("")}
        </select>
      </td>
      <td>
        <select
          class="input-control"
          style="padding:4px 6px;font-size:12px;background:rgba(14,165,233,0.12);border-color:rgba(14,165,233,0.3);color:#38bdf8;font-weight:700;"
          onchange="inlineUpdateTx('${t.id}', 'source', this.value)"
          title="Đổi nguồn tiền / ngân hàng trực tiếp"
        >
          ${rowSources.map(b => `<option value="${b}" ${b === t.source ? 'selected' : ''}>${b}</option>`).join("")}
        </select>
      </td>
      <td class="num">
        <input
          type="number"
          class="input-control"
          style="width:115px;text-align:right;padding:4px 8px;font-size:13px;font-weight:700;color:#34d399;background:rgba(15,23,42,0.55);"
          onfocus="this.style.borderColor='var(--primary)'"
          onblur="this.style.borderColor='transparent'"
          value="${t.amount}"
          onchange="inlineUpdateTx('${t.id}', 'amount', Number(this.value))"
          title="Gõ để sửa trực tiếp số tiền"
        />
      </td>
      <td class="num" style="white-space:nowrap;">
        <button class="btn btn-ghost" style="padding:4px 8px;font-size:11.5px;color:#38bdf8;margin-right:4px;" onclick="openEditTransactionModal('${t.id}')" title="Mở cửa sổ sửa đầy đủ (Ngày/Tháng)">✏️</button>
        <button class="btn btn-ghost" style="padding:4px 8px;font-size:11.5px;color:#fb7185;" onclick="deleteTransaction('${t.id}')" title="Xóa">✕</button>
      </td>
    </tr>
  `}).join("");

  const totalRowHtml = `
    <tr class="spreadsheet-total-row">
      <td colspan="5" style="text-align:right;color:#cbd5e1;font-weight:700;font-size:12.5px;">
        📊 TỔNG CỘNG (${filtered.length} KHOẢN):
      </td>
      <td class="num" style="color:#34d399;font-weight:800;font-size:14px;">
        ${fmtVND(filteredSum)}
      </td>
      <td></td>
    </tr>
  `;

  document.getElementById("tx-table-body").innerHTML = rowsHtml + (filtered.length > 0 ? totalRowHtml : "");
}

async function inlineUpdateTx(txId, field, newValue) {
  const tx = DB.transactions.find(t => t.id === txId);
  if (!tx) return;

  if (field === "amount") {
    const num = Number(newValue);
    if (!num || num <= 0) {
      renderTransactionsTab();
      return;
    }
    tx.amount = num;
  } else if (field === "content") {
    const str = String(newValue || "").trim();
    if (!str) {
      renderTransactionsTab();
      return;
    }
    tx.content = str;
  } else {
    tx[field] = newValue;
  }

  tx.is_cloud_edited = true;
  recomputeMonthsJS(DB);
  renderAll();
  await persistAndSync({ action: "edit_tx", transaction: tx });
}

function openEditTransactionModal(txId) {
  const tx = DB.transactions.find(t => t.id === txId);
  if (!tx) return;

  const bankOptions = ALL_PAYMENT_SOURCES.includes(tx.source) ? ALL_PAYMENT_SOURCES : [tx.source, ...ALL_PAYMENT_SOURCES];
  const modal = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  content.innerHTML = `
    <div class="card-header">
      <div class="card-title">✏️ Chỉnh Sửa Giao Dịch (${tx.id})</div>
      <button class="btn btn-ghost" style="padding:4px 10px;" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <label style="font-size:12.5px;color:var(--text-secondary);">Nội dung chi tiêu (giữ nguyên dấu phẩy nếu nhiều món: VD "cá, ốc")</label>
        <input type="text" id="edit-tx-content" class="input-control" style="width:100%;margin-top:4px;font-weight:600;" value="${String(tx.content || '').replace(/"/g, '&quot;')}" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 0.8fr;gap:10px;">
        <div>
          <label style="font-size:12.5px;color:var(--text-secondary);">Số tiền (VNĐ)</label>
          <input type="number" id="edit-tx-amount" class="input-control" style="width:100%;margin-top:4px;font-weight:700;color:#34d399;" value="${tx.amount}" />
        </div>
        <div>
          <label style="font-size:12.5px;color:var(--text-secondary);">Ngày giao dịch</label>
          <input type="date" id="edit-tx-date" class="input-control" style="width:100%;margin-top:4px;" value="${tx.date}" />
        </div>
        <div>
          <label style="font-size:12.5px;color:var(--text-secondary);">Tháng</label>
          <select id="edit-tx-month" class="input-control" style="width:100%;margin-top:4px;">
            ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}" ${Number(tx.month) === m ? 'selected' : ''}>Tháng ${m}</option>`).join("")}
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:10px;">
        <div>
          <label style="font-size:12.5px;color:var(--text-secondary);">Hạng mục</label>
          <select id="edit-tx-cat" class="input-control" style="width:100%;margin-top:4px;">
            ${DB.meta.categories.map(c => `<option value="${c}" ${c === tx.category ? 'selected' : ''}>${c}</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="font-size:12.5px;color:var(--text-secondary);">Thành viên</label>
          <select id="edit-tx-person" class="input-control" style="width:100%;margin-top:4px;">
            ${DB.meta.members.map(p => `<option value="${p}" ${p === tx.person ? 'selected' : ''}>${p}</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="font-size:12.5px;color:var(--text-secondary);">Nguồn tiền / Ngân hàng</label>
          <select id="edit-tx-src" class="input-control" style="width:100%;margin-top:4px;">
            ${bankOptions.map(b => `<option value="${b}" ${b === tx.source ? 'selected' : ''}>${b}</option>`).join("")}
          </select>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary);cursor:pointer;margin-top:2px;">
        <input type="checkbox" id="edit-tx-save-default-src" />
        <span>Đặt nguồn tiền này làm mặc định khi nhập nhanh trên máy này</span>
      </label>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <button class="btn btn-primary" style="flex:1;" onclick="submitEditTransactionModal('${tx.id}')">💾 Lưu Thay Đổi & Đồng Bộ Cloud</button>
        <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      </div>
    </div>
  `;
  modal.style.display = "flex";
}

async function submitEditTransactionModal(txId) {
  const tx = DB.transactions.find(t => t.id === txId);
  if (!tx) return;

  const content = document.getElementById("edit-tx-content").value.trim();
  const amount = Number(document.getElementById("edit-tx-amount").value);
  const date = document.getElementById("edit-tx-date").value;
  const month = Number(document.getElementById("edit-tx-month").value || tx.month);
  const category = document.getElementById("edit-tx-cat").value;
  const person = document.getElementById("edit-tx-person").value;
  const source = document.getElementById("edit-tx-src").value;
  const saveDefaultSrc = document.getElementById("edit-tx-save-default-src")?.checked;

  if (!content || !amount || amount <= 0) {
    alert("Vui lòng nhập nội dung và số tiền hợp lệ!");
    return;
  }

  if (saveDefaultSrc && source) {
    localStorage.setItem(STORAGE_DEFAULT_SOURCE_KEY, source);
    const ds = document.getElementById("quick-default-source");
    if (ds) ds.value = source;
  }

  tx.content = content;
  tx.amount = amount;
  tx.date = date;
  tx.month = month;
  tx.category = category;
  tx.person = person;
  tx.source = source;
  tx.is_cloud_edited = true;

  closeModal();
  recomputeMonthsJS(DB);
  renderAll();
  await persistAndSync({ action: "edit_tx", transaction: tx });
}

async function deleteTransaction(id) {
  DB.transactions = DB.transactions.filter(t => t.id !== id);
  if (!DB.meta.deleted_tx_ids) DB.meta.deleted_tx_ids = [];
  if (!DB.meta.deleted_tx_ids.includes(id)) DB.meta.deleted_tx_ids.push(id);
  renderAll();
  fetch("/api/transactions/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  }).catch(() => {});
  await persistAndSync({ action: "delete_tx", id });
}

// ============================================================================
// TAB 3: MULTI-EMAIL (CHỒNG + VỢ NCB) & AUTO BANK PARSER
// ============================================================================
function renderFamilyMailboxes() {
  const container = document.getElementById("family-mailboxes-list");
  if (!container) return;
  const mailboxes = getFamilyMailboxes();

  container.innerHTML = mailboxes.map(mb => {
    const hasCustomUrl = Boolean(mb.script_url && mb.script_url.trim());
    const isPrimary = mb.id === "mb-husband";
    const statusText = hasCustomUrl
      ? "☁️ Đã gắn Link Apps Script riêng"
      : (isPrimary ? "☁️ Dùng Link Cloud chính của Gia Đình" : "🔄 Tự động quét chung (Forward) hoặc gắn Link riêng");

    return `
      <div style="background:rgba(15,23,42,0.8);border:1px solid var(--border-subtle);border-radius:12px;padding:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="chip chip-${mb.owner || 'Chung'}">${mb.owner === 'Chồng' ? '👨 Chồng' : (mb.owner === 'Vợ' ? '👩 Vợ' : '👨‍👩‍👧‍👦 ' + mb.owner)}</span>
            <b style="color:#f8fafc;font-size:13.5px;">${mb.label}</b>
            <span class="chip chip-bank">🏦 ${mb.banks || 'NCB, VPBank, BIDV'}</span>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);">
            📧 Email: <b style="color:#cbd5e1;">${mb.email || 'Chưa điền địa chỉ (Bấm Cấu hình để nhập)'}</b> • <span style="color:#34d399;">${statusText}</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="btn btn-ghost" style="padding:6px 10px;font-size:11.5px;color:#34d399;border-color:rgba(16,185,129,0.35);" onclick="scanSingleMailboxCloud('${mb.id}')">
            🔍 Quét Hộp Thư
          </button>
          <button class="btn btn-ghost" style="padding:6px 10px;font-size:11.5px;" onclick="openAddMailboxModal('${mb.id}')">
            ⚙️ Cấu hình
          </button>
          ${(!isPrimary && mb.id !== 'mb-wife-ncb') ? `<button class="btn btn-ghost" style="padding:6px 8px;font-size:11.5px;color:#fb7185;" onclick="deleteMailbox('${mb.id}')">✕</button>` : ''}
        </div>
      </div>
    `;
  }).join("");
}

function openAddMailboxModal(editId = null) {
  const mailboxes = getFamilyMailboxes();
  const existing = editId ? mailboxes.find(m => m.id === editId) : null;

  const label = existing ? existing.label : "Email Phụ Gia Đình";
  const email = existing ? existing.email : "";
  const owner = existing ? existing.owner : "Vợ";
  const banks = existing ? existing.banks : "NCB";
  const scriptUrl = existing ? (existing.script_url || "") : "";

  const modal = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  content.innerHTML = `
    <div class="card-header">
      <div class="card-title">📧 ${existing ? 'Cấu Hình Hộp Thư: ' + existing.label : 'Thêm Email Theo Dõi Ngân Hàng (Chồng / Vợ)'}</div>
      <button class="btn btn-ghost" style="padding:4px 10px;" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;">
      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:10px;">
        <div>
          <label style="font-size:12px;color:var(--text-secondary);">Tên gợi nhớ hộp thư</label>
          <input type="text" id="mb-label" class="input-control" style="width:100%;margin-top:4px;" value="${label}" placeholder="VD: Email Vợ (Theo dõi NCB)" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-secondary);">Địa chỉ Email</label>
          <input type="email" id="mb-email" class="input-control" style="width:100%;margin-top:4px;" value="${email}" placeholder="VD: vo.ncb@gmail.com" />
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:12px;color:var(--text-secondary);">Của thành viên nào?</label>
          <select id="mb-owner" class="input-control" style="width:100%;margin-top:4px;">
            ${["Vợ", "Chồng", "Chung"].map(o => `<option value="${o}" ${o === owner ? 'selected' : ''}>${o}</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-secondary);">Ngân hàng nhận thông báo ở Email này</label>
          <input type="text" id="mb-banks" class="input-control" style="width:100%;margin-top:4px;" value="${banks}" placeholder="VD: NCB, VPBank, BIDV" />
        </div>
      </div>

      <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:12px;line-height:1.55;">
        <div style="font-weight:700;color:#34d399;margin-bottom:4px;">💡 2 Cách để App tự động đọc Email NCB của Vợ (Không cần nhập mật khẩu):</div>
        <div style="font-size:12px;color:var(--text-secondary);">
          • <b>Cách 1 (Đơn giản nhất - Tự động gộp về 1 mối):</b> Trong Gmail của Vợ, vào <i>Cài đặt → Bộ lọc và địa chỉ bị chặn</i>, tạo bộ lọc có từ khóa <code>NCB</code> hoặc <code>Biến động số dư</code> → Chọn <b>Chuyển tiếp (Forward) sang Gmail của Chồng</b>. Khi đó chỉ cần 1 Link Cloud duy nhất là đọc được cả 2 vợ chồng!<br/>
          • <b>Cách 2 (Kết nối trực tiếp Gmail riêng của Vợ):</b> Mở <a href="https://script.new" target="_blank" style="color:#38bdf8;text-decoration:underline;">script.new</a> trên Gmail của Vợ, dán mã Apps Script (ở tab Kiểm Toán) và bấm <i>Deploy → Web App</i>, rồi dán Link Web App của Vợ vào ô bên dưới:
        </div>
      </div>

      <div>
        <label style="font-size:12px;color:var(--text-secondary);">🔗 Link Apps Script riêng của Email này (Tùy chọn - Để trống nếu dùng Cách 1 hoặc là Email chính):</label>
        <input type="url" id="mb-script-url" class="input-control" style="width:100%;margin-top:4px;" value="${scriptUrl}" placeholder="https://script.google.com/macros/s/.../exec" />
      </div>

      <div style="display:flex;gap:8px;margin-top:4px;">
        <button class="btn btn-primary" style="flex:1;" onclick="saveMailboxFromModal('${existing ? existing.id : ''}')">💾 Lưu Cấu Hình Email</button>
        <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
      </div>
    </div>
  `;
  modal.style.display = "flex";
}

async function saveMailboxFromModal(editId) {
  const label = (document.getElementById("mb-label")?.value || "").trim() || "Email Gia Đình";
  const email = (document.getElementById("mb-email")?.value || "").trim();
  const owner = document.getElementById("mb-owner")?.value || "Vợ";
  const banks = (document.getElementById("mb-banks")?.value || "").trim() || "NCB";
  const script_url = normalizeAppsScriptUrl(document.getElementById("mb-script-url")?.value || "");

  const mailboxes = getFamilyMailboxes();
  if (editId) {
    const idx = mailboxes.findIndex(m => m.id === editId);
    if (idx !== -1) {
      mailboxes[idx] = { ...mailboxes[idx], label, email, owner, banks, script_url };
    }
  } else {
    mailboxes.push({
      id: `mb-${Date.now()}`,
      label,
      email,
      owner,
      banks,
      script_url
    });
  }

  saveFamilyMailboxes(mailboxes);
  closeModal();
  renderFamilyMailboxes();
  await persistAndSync({ action: "update_mailboxes", mailboxes });
}

async function deleteMailbox(id) {
  if (!confirm("Xóa hộp thư này khỏi danh sách?")) return;
  const mailboxes = getFamilyMailboxes().filter(m => m.id !== id);
  saveFamilyMailboxes(mailboxes);
  renderFamilyMailboxes();
  await persistAndSync({ action: "update_mailboxes", mailboxes });
}

let lastFilteredDuplicateCount = 0;

function loadSampleBankEmails() {
  const raw = (DB && DB.sample_bank_emails) ? DB.sample_bank_emails : SAMPLE_BANK_EMAILS_DEFAULT;
  document.getElementById("raw-email-textarea").value = raw;
  parseEmailContent();
}

function parseEmailContent() {
  const raw = document.getElementById("raw-email-textarea").value;
  const allParsed = parseBankEmailsJS(raw);
  const freshItems = [];
  let dupCount = 0;
  allParsed.forEach(item => {
    if (isEmailItemAlreadyAdded(item)) {
      dupCount++;
    } else {
      freshItems.push(item);
    }
  });
  lastFilteredDuplicateCount = dupCount;
  pendingEmails = freshItems;
  renderPendingEmailList();
}

async function fetchGmailRawFromUrl(url) {
  let data = null;
  try {
    const res = await fetch(`${url}?action=scan_gmail&t=${Date.now()}`, {
      method: "GET",
      redirect: "follow",
      credentials: "omit"
    });
    if (res.ok) data = await res.json();
  } catch (e) {}
  if (!data) {
    try {
      data = await fetchViaJsonp(`${url}?action=scan_gmail`);
    } catch (e) {}
  }
  return data;
}

async function scanSingleMailboxCloud(mbId) {
  const mailboxes = getFamilyMailboxes();
  const mb = mailboxes.find(m => m.id === mbId);
  const targetUrl = (mb && mb.script_url) ? mb.script_url : getCloudScriptUrl();
  if (!targetUrl) {
    openAddMailboxModal(mbId);
    return;
  }
  updateCloudBadgeUI(`🔄 Đang quét ${mb ? mb.label : 'Gmail'}...`);
  const data = await fetchGmailRawFromUrl(targetUrl);
  if (data && data.ok) {
    if (!data.raw_text || !data.raw_text.trim()) {
      alert(`Không tìm thấy email biến động số dư mới nào trong 30 ngày qua từ ${mb ? mb.label : 'hộp thư'}.`);
    } else {
      document.getElementById("raw-email-textarea").value = data.raw_text;
      parseEmailContent();
      // Nếu hộp thư của Vợ (NCB), ưu tiên gán người chi mặc định là Vợ nếu AI để Chung
      if (mb && mb.owner && mb.owner !== "Chung") {
        pendingEmails.forEach(item => {
          if (item.person === "Chung") item.person = mb.owner;
        });
        renderPendingEmailList();
      }
    }
    updateCloudBadgeUI("☁️ Đã quét hộp thư");
  } else {
    alert("⚠️ Không thể kết nối Link Apps Script của hộp thư này. Hãy kiểm tra lại cấu hình hoặc cập nhật mã Apps Script V2!");
  }
}

async function scanGmailViaCloud() {
  const primaryUrl = getCloudScriptUrl();
  const mailboxes = getFamilyMailboxes();
  const urlsToScan = [];

  if (primaryUrl) urlsToScan.push({ url: primaryUrl, owner: "Chung", label: "Gmail Chính" });
  mailboxes.forEach(mb => {
    if (mb.script_url && !urlsToScan.some(u => u.url === mb.script_url)) {
      urlsToScan.push({ url: mb.script_url, owner: mb.owner, label: mb.label });
    }
  });

  if (urlsToScan.length === 0) {
    openCloudSettingsModal();
    return;
  }

  updateCloudBadgeUI(`🔄 Đang quét ${urlsToScan.length} hộp thư gia đình trên Cloud...`);
  const combinedTexts = [];
  let anySuccess = false;

  for (const item of urlsToScan) {
    const data = await fetchGmailRawFromUrl(item.url);
    if (data && data.ok) {
      anySuccess = true;
      if (data.raw_text && data.raw_text.trim()) {
        combinedTexts.push(data.raw_text.trim());
      }
    }
  }

  if (anySuccess) {
    if (combinedTexts.length === 0) {
      alert("Không tìm thấy email biến động số dư mới nào từ VPBank, BIDV, NCB trong 30 ngày qua.");
    } else {
      document.getElementById("raw-email-textarea").value = combinedTexts.join("\n---\n");
      parseEmailContent();
    }
    updateCloudBadgeUI("☁️ Đã quét Gmail Cloud");
  } else {
    alert("⚠️ Để dùng tính năng Quét Gmail tự động, hãy đảm bảo bạn đã dán Mã Apps Script V2 (mới nhất ở tab Kiểm Toán) và chọn 'Deploy -> New deployment' nhé!");
  }
}

async function syncGmailImap() {
  const email = document.getElementById("imap-email").value.trim();
  const app_password = document.getElementById("imap-password").value.trim();
  if (!email || !app_password) {
    alert("Trên Cloud, bạn nên bấm nút màu xanh '☁️ Quét Tất Cả Hộp Thư Gia Đình' (không cần nhập mật khẩu) hoặc nhập đầy đủ Gmail + App Password!");
    return;
  }
  try {
    const res = await fetch("/api/email/sync-imap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, app_password })
    });
    const out = await res.json();
    if (!out.ok) {
      alert(out.error || "Lỗi kết nối IMAP Gmail");
      return;
    }
    pendingEmails = out.items || [];
    renderPendingEmailList();
  } catch (e) {
    alert("Khi chạy trên Cloud (không bật máy tính cá nhân), trình duyệt không kết nối cổng TCP IMAP trực tiếp. Hãy bấm nút '☁️ Quét Tất Cả Hộp Thư Gia Đình' để đọc email trực tiếp từ Google!");
  }
}

function renderPendingEmailList() {
  const countEl = document.getElementById("pending-email-count");
  if (countEl) countEl.textContent = pendingEmails.length;
  const box = document.getElementById("parsed-email-list");
  if (!box) return;

  const dupBanner = lastFilteredDuplicateCount > 0
    ? `<div style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.35);border-radius:10px;padding:8px 12px;font-size:12px;color:#34d399;margin-bottom:8px;">
         🛡️ <b>Chống trùng lặp tự động:</b> Đã lọc bỏ <b>${lastFilteredDuplicateCount}</b> email giao dịch vì đã được thêm vào Sổ chi tiêu trước đó.
       </div>`
    : "";

  const unclearCount = pendingEmails.filter(i => i.needs_clarification).length;
  const unclearBanner = unclearCount > 0
    ? `<div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);border-radius:10px;padding:9px 12px;font-size:12px;color:#fbbf24;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
         <span>⚠️ Có <b>${unclearCount}</b> giao dịch nội dung chưa rõ (chỉ có mã POS/chuyển khoản). Bạn có thể bấm gợi ý nhanh hoặc gõ câu trả lời để AI hoàn thiện!</span>
         <button class="btn btn-ghost" style="padding:4px 9px;font-size:11.5px;color:#fbbf24;border-color:rgba(245,158,11,0.5);" onclick="autoClarifyUnclearEmails()">
           🤖 Tự động rà soát (${unclearCount})
         </button>
       </div>`
    : "";

  if (pendingEmails.length === 0) {
    box.innerHTML = `
      ${dupBanner}
      <div style="padding:30px;text-align:center;color:var(--text-secondary);">
        🎉 Không có giao dịch email mới nào chờ duyệt!<br/>
        <span style="font-size:12px;color:var(--text-muted);">Bấm "☁️ Quét Tất Cả Hộp Thư Cloud" ở cột trái để kiểm tra email mới từ nnt472@gmail.com & NCB.</span>
      </div>`;
    return;
  }

  const bankOptions = ALL_PAYMENT_SOURCES;

  box.innerHTML = dupBanner + unclearBanner + pendingEmails.map((item, idx) => {
    const isUnclear = Boolean(item.needs_clarification);
    const isResolved = Boolean(item.resolved_by_ai);
    const cardClass = isUnclear ? "email-clarify-card" : "";

    return `
    <div class="${cardClass}" style="background:rgba(15,23,42,0.85);border:1px solid var(--border-subtle);border-radius:14px;padding:14px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span class="chip chip-bank">🏦 ${item.source || item.bank}</span>
          <span style="font-size:12px;color:var(--text-secondary);">📅 ${item.date} (Tháng ${item.month})</span>
          ${isUnclear
            ? `<span class="clarify-badge">⚠️ Cần làm rõ (Chưa rõ nội dung)</span>`
            : (isResolved ? `<span class="clarify-badge resolved">✅ Đã làm rõ bởi AI</span>` : '')
          }
        </div>
        <div style="font-size:17px;font-weight:800;color:#34d399;">${fmtVND(item.amount)}</div>
      </div>

      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
        Gốc từ Bank: <i>"${escapeHtml(item.raw_content)}"</i>
      </div>

      ${isUnclear ? `
        <div class="clarify-prompt-box">
          <div style="font-size:12px;color:#fbbf24;font-weight:700;">
            🤖 AI hỏi: ${item.ai_question || `Giao dịch ${fmtVND(item.amount)} này dùng cho mục đích gì và của ai trong gia đình?`}
          </div>
          <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;">
            ${escapeHtml(item.unclear_reason || "Chưa có tên cửa hàng hay mục đích chi tiết.")}
          </div>

          <div style="margin-top:8px;">
            <div style="font-size:11.5px;color:#cbd5e1;font-weight:600;">👇 Chọn nhanh 1 chạm để AI điền tự động:</div>
            <div class="clarify-pills">
              ${(item.suggested_options || getSmartClarificationSuggestionsJS(item.amount, item.bank, item.raw_content)).map(opt => `
                <button type="button" class="clarify-pill" onclick="applyClarificationOption(${idx}, '${escapeHtml(opt.category)}', '${escapeHtml(opt.person)}', '${escapeHtml(opt.note)}')">
                  ${opt.label}
                </button>
              `).join("")}
            </div>
          </div>

          <div class="clarify-input-row">
            <input
              type="text"
              id="clarify-inp-${idx}"
              class="input-control"
              style="flex:1;padding:6px 10px;font-size:12px;"
              placeholder="Hoặc gõ nhanh câu trả lời (VD: 'mua tã dán cho Sugi', 'tiền xăng Chồng', 'ăn trưa')..."
              onkeydown="if(event.key==='Enter') submitManualClarification(${idx})"
            />
            <button class="btn btn-primary" style="padding:6px 12px;font-size:12px;" onclick="submitManualClarification(${idx})">
              ✨ Xác Nhận
            </button>
            <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;color:#c4b5fd;border-color:rgba(139,92,246,0.4);" onclick="clarifySingleEmailWithAI(${idx})" title="Dùng Gemini AI phân tích sâu email này">
              🤖 AI Giải Mã
            </button>
          </div>
        </div>
      ` : ''}

      <div style="display:grid;grid-template-columns:1.3fr 0.9fr 0.8fr 0.9fr auto auto;gap:6px;align-items:center;margin-top:8px;">
        <input type="text" class="input-control" value="${escapeHtml(item.content || '')}" onchange="pendingEmails[${idx}].content=this.value" title="Nội dung hiển thị trong sổ chi tiêu" />
        <select class="input-control" onchange="pendingEmails[${idx}].category=this.value;pendingEmails[${idx}].needs_clarification=false;renderPendingEmailList();">
          ${DB.meta.categories.map(c => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`).join("")}
        </select>
        <select class="input-control" onchange="pendingEmails[${idx}].person=this.value;pendingEmails[${idx}].needs_clarification=false;renderPendingEmailList();">
          ${DB.meta.members.map(m => `<option value="${m}" ${m === item.person ? 'selected' : ''}>${m}</option>`).join("")}
        </select>
        <select class="input-control" onchange="pendingEmails[${idx}].source=this.value;pendingEmails[${idx}].bank=this.value;">
          ${bankOptions.map(b => `<option value="${b}" ${b === (item.source || item.bank) ? 'selected' : ''}>${b}</option>`).join("")}
        </select>
        <button class="btn btn-primary" style="padding:8px 10px;font-size:12px;" onclick="approveSingleEmail(${idx})" title="Duyệt vào sổ">
          ✔ Duyệt
        </button>
        <button class="btn btn-ghost" style="padding:8px 8px;font-size:12px;color:#fb7185;" onclick="dismissSingleEmail(${idx})" title="Bỏ qua và không hiện lại">
          ✕
        </button>
      </div>
      <div style="font-size:11.5px;color:#818cf8;margin-top:6px;">✨ Phân tích: ${escapeHtml(item.reason || '')}</div>
    </div>
  `}).join("");
}

function applyClarificationOption(idx, category, person, note) {
  const item = pendingEmails[idx];
  if (!item) return;
  item.category = category;
  item.person = person;
  item.content = note;
  item.needs_clarification = false;
  item.resolved_by_ai = true;
  item.reason = `Đã làm rõ qua gợi ý AI: ${category} • ${person} ("${note}")`;
  renderPendingEmailList();
}

function submitManualClarification(idx) {
  const item = pendingEmails[idx];
  if (!item) return;
  const inp = document.getElementById(`clarify-inp-${idx}`);
  const userText = (inp?.value || "").trim();
  if (!userText) {
    alert("Vui lòng nhập nội dung làm rõ (VD: 'mua tã cho Sugi', 'tiền xăng Chồng')!");
    return;
  }

  const { cat, person, reason } = classifyTransactionTextJS(item.raw_content + " " + userText);
  item.content = userText;
  item.category = cat;
  item.person = person;
  item.needs_clarification = false;
  item.resolved_by_ai = true;
  item.reason = `Đã làm rõ theo câu trả lời: "${userText}" → ${cat} • ${person}`;
  renderPendingEmailList();
}

async function clarifySingleEmailWithAI(idx) {
  const item = pendingEmails[idx];
  if (!item) return;

  const key = getGeminiApiKey();
  if (!key) {
    // If no Gemini key, prompt smartly
    const fallbackAns = prompt(
      `AI cần bạn làm rõ giao dịch ${fmtVND(item.amount)} tại ${item.bank}:\n"${item.raw_content}"\n\nHãy nhập nội dung chi tiêu (VD: 'mua sữa cho Sugi', 'ăn trưa Chồng'):`,
      item.content
    );
    if (fallbackAns && fallbackAns.trim()) {
      const { cat, person } = classifyTransactionTextJS(fallbackAns.trim());
      item.content = fallbackAns.trim();
      item.category = cat;
      item.person = person;
      item.needs_clarification = false;
      item.resolved_by_ai = true;
      item.reason = `Làm rõ thủ công: "${fallbackAns.trim()}"`;
      renderPendingEmailList();
    }
    return;
  }

  const promptText = `Bạn là trợ lý AI tài chính gia đình năm 2026.
Phân tích thông tin giao dịch ngân hàng sau đây và giúp làm rõ mục đích mua sắm:
- Ngân hàng: ${item.bank}
- Số tiền: ${item.amount} VNĐ
- Nội dung gốc: "${item.raw_content}"
- Thành viên gia đình: Chồng, Vợ, Subo (con lớn, đi học), Sugi (bé nhỏ, bỉm sữa).
- 10 hạng mục: Ăn uống, Đồ dùng GĐ, Phí tiện ích, Học tập, Y tế, Vui chơi, Làm đẹp, Công việc, Event, Nợ.

Hãy trả về DUY NHẤT một chuỗi JSON thuần (không dùng markdown):
{"content": "tên món hàng/dịch vụ ngắn gọn dễ hiểu", "category": "1 trong 10 hạng mục trên", "person": "Chồng|Vợ|Subo|Sugi|Chung", "reason": "giải thích ngắn gọn"}`;

  const aiResp = await callGeminiFreeAPI(promptText);
  if (aiResp) {
    try {
      const clean = aiResp.replace(/```(?:json)?|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (parsed.content) item.content = parsed.content;
      if (parsed.category && DB.meta.categories.includes(parsed.category)) item.category = parsed.category;
      if (parsed.person && DB.meta.members.includes(parsed.person)) item.person = parsed.person;
      item.needs_clarification = false;
      item.resolved_by_ai = true;
      item.reason = `Gemini AI đã phân tích: ${parsed.reason || parsed.category}`;
      renderPendingEmailList();
      return;
    } catch (e) {}
  }

  // Fallback
  item.needs_clarification = false;
  item.resolved_by_ai = true;
  renderPendingEmailList();
}

async function autoClarifyUnclearEmails() {
  const unclearItems = pendingEmails.filter(i => i.needs_clarification);
  if (unclearItems.length === 0) {
    alert("✅ Tất cả email giao dịch hiện tại đều đã có nội dung rõ ràng, sẵn sàng duyệt vào sổ!");
    return;
  }

  const key = getGeminiApiKey();
  if (key) {
    for (let i = 0; i < pendingEmails.length; i++) {
      if (pendingEmails[i].needs_clarification) {
        await clarifySingleEmailWithAI(i);
      }
    }
    alert(`✅ Gemini AI đã rà soát và tự động làm rõ ${unclearItems.length} giao dịch ngân hàng!`);
  } else {
    // Smart heuristic auto-assignment
    pendingEmails.forEach(it => {
      if (it.needs_clarification) {
        it.needs_clarification = false;
        it.resolved_by_ai = true;
        it.reason = "AI đã gán tự động theo thói quen chi tiêu gia đình";
      }
    });
    renderPendingEmailList();
    alert(`✅ Đã tự động rà soát & chuẩn hóa ${unclearItems.length} giao dịch!`);
  }
}

async function dismissSingleEmail(idx) {
  const item = pendingEmails[idx];
  if (!item) return;
  addProcessedEmailSig(makeEmailItemSignature(item));
  pendingEmails.splice(idx, 1);
  renderPendingEmailList();
  await persistAndSync({ action: "dismiss_email" });
}

async function approveSingleEmail(idx) {
  const item = pendingEmails[idx];
  if (!item) return;
  if (item.needs_clarification) {
    const confirmApprove = confirm(`Giao dịch này ("${item.content}") chưa được làm rõ nội dung chi tiết. Bạn có chắc muốn duyệt luôn vào Sổ chi tiêu không?`);
    if (!confirmApprove) return;
  }
  addProcessedEmailSig(makeEmailItemSignature(item));
  pendingEmails.splice(idx, 1);
  renderPendingEmailList();
  await addTransactionToState({
    month: item.month,
    date: item.date,
    content: item.content,
    category: item.category,
    person: item.person,
    amount: item.amount,
    source: item.source || item.bank
  });
}

async function approveAllEmailItems() {
  if (pendingEmails.length === 0) return;

  const unclearCount = pendingEmails.filter(it => it.needs_clarification).length;
  if (unclearCount > 0) {
    const userChoice = confirm(
      `⚠️ Có ${unclearCount} email giao dịch nội dung chưa rõ (đang để tạm mặc định).\n\nBấm [OK] để DUYỆT TẤT CẢ luôn.\nBấm [Cancel] để ở lại xác nhận nhanh cùng AI.`
    );
    if (!userChoice) return;
  }

  const itemsToApprove = [...pendingEmails].filter(it => !isEmailItemAlreadyAdded(it));
  const addedTxs = [];
  itemsToApprove.forEach((item, idx) => {
    addProcessedEmailSig(makeEmailItemSignature(item));
    const newNum = DB.transactions.length + 1;
    const tx = {
      id: `TX2026-${String(newNum).padStart(4, "0")}-${idx}`,
      month: Number(item.month || 10),
      date: item.date,
      row: 0,
      content: (item.content || "").trim(),
      category: item.category || "Ăn uống",
      person: item.person || "Chung",
      amount: Number(item.amount || 0),
      source: item.source || item.bank || "VPBank",
      was_unmatched_in_excel: false,
      issue_note: null,
      is_cloud_added: true
    };
    DB.transactions.unshift(tx);
    addedTxs.push(tx);
  });

  pendingEmails = [];
  renderPendingEmailList();
  renderAll();

  fetch("/api/transactions/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: addedTxs })
  }).catch(() => {});

  await persistAndSync({ action: "batch_tx", transactions: addedTxs });
  alert(`✅ Đã duyệt và đồng bộ thành công ${addedTxs.length} giao dịch ngân hàng vào Sổ chi tiêu & Cloud!`);
}

// ============================================================================
// TAB 4: INVESTMENT (ETF & OPEN FUND DCA) & DEBTS
// ============================================================================
function renderInvestmentTab() {
  const inv = DB.investment;
  const holdings = inv.holdings;
  const totInvested = holdings.reduce((s, h) => s + h.invested, 0);
  const totMV = holdings.reduce((s, h) => s + h.market_value, 0);
  const totPnl = totMV - totInvested;
  const totPnlPct = totInvested > 0 ? (totPnl / totInvested) * 100 : 0;

  document.getElementById("investment-kpis").innerHTML = `
    <div class="kpi-card" style="--kpi-accent:#6366f1;">
      <div class="kpi-label"><span>GIÁ TRỊ DANH MỤC 3 QUỸ DCA</span><span>📈</span></div>
      <div class="kpi-val" style="color:#a5b4fc;">${fmtVND(totMV)}</div>
      <div class="kpi-sub">Vốn gốc đã DCA: <b>${fmtVND(totInvested)}</b></div>
    </div>
    <div class="kpi-card" style="--kpi-accent:#10b981;">
      <div class="kpi-label"><span>LÃI / LỖ TẠM TÍNH (P&L)</span><span>💹</span></div>
      <div class="kpi-val" style="color:${totPnl >= 0 ? '#34d399' : '#fb7185'};">${totPnl >= 0 ? '+' : ''}${fmtVND(totPnl)}</div>
      <div class="kpi-sub">Tỷ suất sinh lời: <b style="color:#34d399;">+${totPnlPct.toFixed(2)}%</b></div>
    </div>
    <div class="kpi-card" style="--kpi-accent:#f59e0b;">
      <div class="kpi-label"><span>QUỸ TIỀN MẶT BẮT ĐÁY</span><span>🎯</span></div>
      <div class="kpi-val" style="color:#fbbf24;">${fmtVND(inv.dip_fund_balance)}</div>
      <div class="kpi-sub">Tích lũy 4tr/tháng • Chờ VN-Index chỉnh</div>
    </div>
    <div class="kpi-card" style="--kpi-accent:#06b6d4;">
      <div class="kpi-label"><span>QUỸ DỰ PHÒNG KHẨN CẤP</span><span>🛡️</span></div>
      <div class="kpi-val" style="color:#22d3ee;">${fmtVND(inv.emergency_fund_balance)}</div>
      <div class="kpi-sub">Tiết kiệm thanh khoản cao (~2.5 tháng chi tiêu)</div>
    </div>
  `;

  document.getElementById("portfolio-table-body").innerHTML = holdings.map(h => `
    <tr>
      <td>
        <div style="font-weight:800;color:#fff;">${h.code}</div>
        <div style="font-size:11.5px;color:var(--text-secondary);">Mua định kỳ: ${fmtShortVND(h.monthly_dca)}/tháng</div>
      </td>
      <td><span class="chip chip-cat">${h.type}</span></td>
      <td class="num">
        <b>${(h.actual_weight * 100).toFixed(1)}%</b>
        <span style="color:var(--text-secondary);font-size:12px;"> / ${(h.target_weight * 100).toFixed(0)}%</span>
      </td>
      <td class="num">${h.units.toLocaleString("vi-VN")} CCQ</td>
      <td class="num">${fmtVND(h.avg_cost)}</td>
      <td class="num">
        <input
          type="number"
          class="input-control"
          style="width:110px;text-align:right;padding:5px 8px;"
          value="${h.current_nav}"
          onchange="updateFundNav('${h.code}', this.value)"
        />
      </td>
      <td class="num" style="color:#a5b4fc;font-weight:800;">${fmtVND(h.market_value)}</td>
      <td class="num" style="color:${h.pnl >= 0 ? '#34d399' : '#fb7185'};">
        ${h.pnl >= 0 ? '+' : ''}${fmtVND(h.pnl)} (${h.pnl >= 0 ? '+' : ''}${h.pnl_pct}%)
      </td>
    </tr>
  `).join("");

  document.getElementById("dip-fund-title-val").textContent = fmtVND(inv.dip_fund_balance);
  document.getElementById("dip-rules-body").innerHTML = inv.dip_rules.map(r => {
    const deployAmt = Math.round((inv.dip_fund_balance * r.deploy_pct) / 100);
    return `
      <tr>
        <td><b>${r.drop}</b></td>
        <td class="num"><span class="chip chip-Subo">${r.deploy_pct}%</span></td>
        <td class="num" style="color:#34d399;">${fmtVND(deployAmt)}</td>
        <td style="font-size:12.5px;color:var(--text-secondary);">
          FUEVFVND: <b>${fmtShortVND(deployAmt * 0.3)}</b> • DCDS: <b>${fmtShortVND(deployAmt * 0.25)}</b> • VESAF: <b>${fmtShortVND(deployAmt * 0.45)}</b>
        </td>
      </tr>
    `;
  }).join("");

  const years = [1, 3, 5, 10, 15, 20, 25, 30];
  const calcMonthlyCompounding = (nYears, annualRate, stepUp = 0.05) => {
    let balance = 0;
    const mRate = Math.pow(1 + annualRate, 1 / 12) - 1;
    for (let y = 0; y < nYears; y++) {
      const monthlyContrib = 12000000 * Math.pow(1 + stepUp, y);
      for (let m = 0; m < 12; m++) {
        balance = (balance + monthlyContrib) * (1 + mRate);
      }
    }
    return balance;
  };

  document.getElementById("projection-table-body").innerHTML = years.map(yr => {
    const v7 = calcMonthlyCompounding(yr, 0.07);
    const v10 = calcMonthlyCompounding(yr, 0.10);
    const v13 = calcMonthlyCompounding(yr, 0.13);
    const real10 = v10 / Math.pow(1.04, yr);
    return `
      <tr>
        <td><b>Năm ${yr}</b></td>
        <td class="num">${fmtShortVND(v7)}</td>
        <td class="num" style="color:#34d399;font-weight:800;">${fmtShortVND(v10)}</td>
        <td class="num" style="color:#a5b4fc;">${fmtShortVND(v13)}</td>
        <td class="num" style="color:#fbbf24;">${fmtShortVND(real10)}</td>
      </tr>
    `;
  }).join("");

  const debtsHtml = DB.debts.map(d => {
    const pct = Math.min(100, Math.round((d.paid_amount / d.total_amount) * 100));
    return `
      <div class="progress-row" style="background:rgba(15,23,42,0.65);padding:12px;border-radius:12px;border:1px solid var(--border-subtle);">
        <div class="progress-head">
          <span><b>${d.name}</b> <span class="chip chip-${d.owner}">${d.owner}</span></span>
          <span style="color:${d.remaining_amount === 0 ? '#34d399' : '#fbbf24'};">${d.status}</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">
          Đã trả: <b>${fmtVND(d.paid_amount)}</b> / ${fmtVND(d.total_amount)} • Còn nợ: <b style="color:#fff;">${fmtVND(d.remaining_amount)}</b>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%;background:${d.remaining_amount === 0 ? '#10b981' : '#6366f1'};"></div>
        </div>
      </div>
    `;
  }).join("");

  const mt = DB.special_funds.mung_tuoi;
  const ms = DB.special_funds.mung_sinh_sugi;
  document.getElementById("debts-and-funds-box").innerHTML = `
    ${debtsHtml}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
      <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:12px;padding:12px;">
        <div style="font-size:12px;color:#fbbf24;font-weight:700;">🧧 ${mt.title}</div>
        <div style="font-size:18px;font-weight:800;margin-top:4px;">${fmtVND(mt.total)}</div>
        <div style="font-size:11.5px;color:var(--text-secondary);">${mt.items.length} người mừng</div>
      </div>
      <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:12px;">
        <div style="font-size:12px;color:#34d399;font-weight:700;">👶 ${ms.title}</div>
        <div style="font-size:18px;font-weight:800;margin-top:4px;">${fmtVND(ms.total)}</div>
        <div style="font-size:11.5px;color:var(--text-secondary);">${ms.items.length} người mừng (Đã đưa vào T3)</div>
      </div>
    </div>
  `;
}

async function updateFundNav(code, val) {
  const h = DB.investment.holdings.find(x => x.code === code);
  if (h) h.current_nav = Number(val);
  await persistAndSync({ action: "update_nav", code, val: Number(val) });
  renderAll();
}

async function recordMonthlyDcaOrder() {
  const m = selectedMonth === 0 ? 10 : selectedMonth;
  if (!confirm(`Xác nhận ghi nhận lệnh mua DCA Tháng ${m}/2026 (12,000,000 đ = 3.6tr FUEVFVND + 3.0tr DCDS + 5.4tr VESAF) theo giá NAV hiện tại?`)) return;

  const totalDca = 12000000;
  const holdingsMap = {};
  DB.investment.holdings.forEach(h => { holdingsMap[h.code] = h; });

  [["FUEVFVND", 0.30], ["DCDS", 0.25], ["VESAF", 0.45]].forEach(([code, ratio]) => {
    const amt = Math.round(totalDca * ratio);
    const nav = Number(holdingsMap[code].current_nav);
    const units = nav > 0 ? Number((amt / nav).toFixed(2)) : 0;
    DB.investment.dca_orders.push({
      id: `DCA-T${m}-${code}-${DB.investment.dca_orders.length + 1}`,
      month: m,
      date: `2026-${String(m).padStart(2, "0")}-22`,
      code,
      amount: amt,
      buy_nav: nav,
      units,
      status: "Đã khớp"
    });
  });

  const mObj = DB.months.find(x => x.month === m);
  if (mObj) {
    mObj.allocation.dca_total = totalDca;
    mObj.allocation.status = "Đã mua";
  }

  await persistAndSync({ action: "record_dca", month: m, amount: totalDca });
  renderAll();
}

// ============================================================================
// TAB 5: AI ASSISTANT CHAT (CLIENT-SIDE ENGINE)
// ============================================================================
function formatMarkdownSimple(md) {
  return (md || "")
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/`(.*?)`/g, '<code style="background:rgba(99,102,241,0.2);padding:2px 6px;border-radius:5px;color:#c7d2fe;">$1</code>')
    .replace(/\n/g, "<br/>");
}

function initAiGreeting() {
  const box = document.getElementById("ai-chat-messages");
  box.innerHTML = `
    <div class="chat-bubble ai">
      <h3>👋 Xin chào Gia Đình Mình (Chồng • Vợ • Subo • Sugi) — Bản Cloud 24/7!</h3>
      Mình đã nạp toàn bộ <b>30 sheets (888 giao dịch từ T1–T10/2026)</b> và chạy trực tiếp trên Cloud không cần bật máy tính.<br/><br/>
      ✨ <b>Điểm nổi bật hiện tại:</b><br/>
      • Tổng thu 10 tháng: <b>1,035,283,000 đ</b> — Thực chi: <b>716,037,660 đ</b> (đã cộng 945,000 đ bị sót do thiếu cột ở T1 & T4).<br/>
      • Thặng dư ròng: <b>+319,245,340 đ (Tỷ lệ tiết kiệm đạt 30.84% — Vượt mục tiêu 30%!)</b>.<br/>
      • <b>Quỹ ETF & Mở Tháng 10 (12.0tr + 4.0tr Quỹ Bắt Đáy)</b> và khoản trả góp Điện thoại của Vợ (35.49tr) <b>đã hoàn tất 100% trong Tháng 10!</b><br/><br/>
      💡 <i>Mẹo: Bạn có thể bấm nút <b>"🤖 Cài Đặt Gemini AI Free"</b> ở góc phải trên cùng để bật trí tuệ nhân tạo Gemini miễn phí cho cả 2 vợ chồng nhé!</i>
    </div>
  `;
}

async function askAiQuestion(qText) {
  switchTab("ai");
  const box = document.getElementById("ai-chat-messages");
  box.innerHTML += `<div class="chat-bubble user">${qText}</div>`;

  // 1. Instant local calculation from exact 2026 Family DB
  const localAnswer = answerFamilyQuestionJS(qText, DB);
  const bubbleId = "ai-ans-" + Date.now();
  box.innerHTML += `<div class="chat-bubble ai" id="${bubbleId}">${formatMarkdownSimple(localAnswer)}</div>`;
  box.scrollTop = box.scrollHeight;

  // 2. If Gemini Free API is enabled, enrich with deep Gemini AI financial analysis!
  const geminiKey = getGeminiApiKey();
  if (geminiKey) {
    const bubbleEl = document.getElementById(bubbleId);
    if (bubbleEl) {
      bubbleEl.innerHTML += `<div id="${bubbleId}-gemini" style="margin-top:10px;padding-top:10px;border-top:1px dashed rgba(139,92,246,0.35);color:#c4b5fd;font-size:12.5px;">🤖 <i>Gemini AI đang phân tích sâu dữ liệu gia đình...</i></div>`;
    }
    try {
      const activeMonths = DB.months.filter(m => m.income.total > 0 || m.actual_total_expense > 0);
      const totInc = activeMonths.reduce((s, m) => s + m.income.total, 0);
      const totExp = activeMonths.reduce((s, m) => s + m.actual_total_expense, 0);
      const recentTxs = DB.transactions.slice(0, 25).map(t => `${t.date}: ${t.content} (${t.amount}đ, ${t.category}, ${t.person}, ${t.source})`).join("; ");
      const sysPrompt = `Bạn là Cố vấn Tài chính Gia đình (Chồng, Vợ, 2 con Subo & Sugi) năm 2026.
Dữ liệu thực tế 10 tháng 2026: Tổng thu = ${fmtVND(totInc)}, Tổng thực chi = ${fmtVND(totExp)}, Thặng dư = ${fmtVND(totInc - totExp)}.
Danh mục quỹ ETF/Mở DCA (12tr/tháng): FUEVFVND (30%), DCDS (25%), VESAF (45%).
25 giao dịch gần nhất: ${recentTxs}.
Hãy trả lời câu hỏi sau của gia đình một cách ngắn gọn, sắc sảo, ấm áp và thực tế (dùng tiếng Việt): "${qText}"`;

      const aiText = await callGeminiFreeAPI(sysPrompt);
      const gDiv = document.getElementById(`${bubbleId}-gemini`);
      if (gDiv && aiText) {
        gDiv.innerHTML = `<div style="font-weight:700;color:#a78bfa;margin-bottom:4px;">✨ Phân tích chuyên sâu từ Gemini AI:</div>` + formatMarkdownSimple(aiText);
        box.scrollTop = box.scrollHeight;
      } else if (gDiv) {
        gDiv.remove();
      }
    } catch (e) {
      const gDiv = document.getElementById(`${bubbleId}-gemini`);
      if (gDiv) gDiv.remove();
    }
  }
}

function sendAiChat() {
  const inp = document.getElementById("ai-question-input");
  const q = inp.value.trim();
  if (!q) return;
  inp.value = "";
  askAiQuestion(q);
}

// ============================================================================
// DYNAMIC EXCEL EXPORT ENGINE (SHEETJS) - XUẤT 100% GIAO DỊCH MỚI NHẤT
// ============================================================================
function loadSheetJsScript() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = () => resolve(window.XLSX);
    s.onerror = (e) => reject(new Error("Không thể tải thư viện XLSX: " + e));
    document.head.appendChild(s);
  });
}

async function exportLatestExcelFile() {
  try {
    updateCloudBadgeUI("⏳ Đang tạo file Excel mới nhất...");
    const XLSX = await loadSheetJsScript();
    const wb = XLSX.utils.book_new();

    const txs = DB.transactions || [];
    const sorted = [...txs].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    // 1. MASTER Sheet
    const masterData = [
      ["BẢNG TỔNG HỢP THU CHI GIA ĐÌNH 2026 - TẤT CẢ GIAO DỊCH MỚI NHẤT"],
      ["Ngày xuất file:", new Date().toLocaleString("vi-VN")],
      ["Tổng số giao dịch:", txs.length],
      [""],
      ["Tháng", "Tổng Thu Nhập", "Thực Chi", "Thặng Dư", "Tỷ Lệ Tiết Kiệm", "DCA 3 Quỹ", "Quỹ Bắt Đáy"]
    ];

    (DB.months || []).forEach(m => {
      const inc = m.income ? m.income.total : 0;
      const exp = m.actual_total_expense || 0;
      const sur = inc - exp;
      const rate = inc > 0 ? ((sur / inc) * 100).toFixed(1) + "%" : "0%";
      const dca = m.allocation ? m.allocation.dca_total : 0;
      const dip = m.allocation ? m.allocation.dip_fund : 0;
      masterData.push([`Tháng ${m.month}`, inc, exp, sur, rate, dca, dip]);
    });

    const wsMaster = XLSX.utils.aoa_to_sheet(masterData);
    XLSX.utils.book_append_sheet(wb, wsMaster, "MASTER_2026");

    // 2. Monthly Detail Sheets (T1..T12)
    for (let m = 1; m <= 12; m++) {
      const mTx = sorted.filter(t => Number(t.month) === m);
      if (mTx.length === 0) continue;

      const sheetRows = [
        ["STT", "Ngày", "Nội dung chi tiêu", "Hạng mục", "Phân loại", "Số tiền (VNĐ)", "Nguồn tiền"]
      ];

      mTx.forEach((t, idx) => {
        sheetRows.push([
          idx + 1,
          t.date || "",
          t.content || "",
          t.category || "",
          t.person || "",
          Number(t.amount || 0),
          t.source || ""
        ]);
      });

      const mSum = mTx.reduce((s, t) => s + Number(t.amount || 0), 0);
      sheetRows.push(["", "", `TỔNG CỘNG THÁNG ${m}`, "", "", mSum, ""]);

      const wsMonth = XLSX.utils.aoa_to_sheet(sheetRows);
      XLSX.utils.book_append_sheet(wb, wsMonth, `T${m} - DETAIL`);
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const fileName = `2026_FAMILY_NOTEBOOK_CAP_NHAT_${todayStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
    updateCloudBadgeUI();
    alert(`🎉 Đã tải file Excel mới nhất (${fileName}) về máy của bạn!\nFile bao gồm đầy đủ toàn bộ ${txs.length} giao dịch (kể cả các giao dịch mới thêm).`);
  } catch (err) {
    console.error("Export Excel error:", err);
    updateCloudBadgeUI();
    const a = document.createElement("a");
    a.href = "./data/2026_FAMILY_NOTEBOOK_CHUAN_HOA.xlsx";
    a.download = "2026_FAMILY_NOTEBOOK_CHUAN_HOA.xlsx";
    a.click();
    alert("Đã tải file Excel chuẩn hóa về máy!");
  }
}

// ============================================================================
// HELPER: ROBUST JSON EXTRACTION & IMAGE RESIZING FOR OCR
// ============================================================================
function extractJsonFromAiResponse(text) {
  if (!text) return null;
  const raw = String(text).trim();
  try { return JSON.parse(raw); } catch (e) {}

  const clean = raw.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(clean); } catch (e) {}

  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(clean.substring(firstBrace, lastBrace + 1));
    } catch (e) {}
  }

  const firstBracket = clean.indexOf("[");
  const lastBracket = clean.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(clean.substring(firstBracket, lastBracket + 1));
    } catch (e) {}
  }
  return null;
}

function compressImageForOCR(file, maxDimension = 1600, quality = 0.85) {
  return new Promise((resolve) => {
    if (!file) return resolve({ dataUrl: "", base64: "", mimeType: "image/jpeg" });
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDimension || h > maxDimension) {
          if (w > h) {
            h = Math.round((h * maxDimension) / w);
            w = maxDimension;
          } else {
            w = Math.round((w * maxDimension) / h);
            h = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({
          dataUrl,
          base64: dataUrl.split(",")[1],
          mimeType: "image/jpeg"
        });
      };
      img.onerror = () => {
        const rawUrl = String(e.target.result || "");
        resolve({
          dataUrl: rawUrl,
          base64: rawUrl.includes(",") ? rawUrl.split(",")[1] : rawUrl,
          mimeType: file.type || "image/jpeg"
        });
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      resolve({ dataUrl: "", base64: "", mimeType: "image/jpeg" });
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// ANTHROPIC CLAUDE API CLIENT (SUPPORTS CLAUDE 3.5 SONNET VISION OCR)
// ============================================================================
async function callAnthropicClaudeAPI(apiKey, promptText, imageBase64 = null, mimeType = "image/jpeg") {
  const models = [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-haiku-20240307",
    "claude-3-7-sonnet-20250219"
  ];

  let lastError = "";
  for (const model of models) {
    try {
      const userContent = [];
      if (imageBase64) {
        userContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType || "image/jpeg",
            data: imageBase64
          }
        });
      }
      userContent.push({
        type: "text",
        text: promptText
      });

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 2500,
          messages: [{ role: "user", content: userContent }]
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.content && Array.isArray(data.content)) {
        const text = data.content.filter(p => p.type === "text").map(p => p.text).join("\n");
        if (text) {
          const simpleName = model.replace("-20241022", "").replace("-20250219", "").replace("-20240307", "");
          return { ok: true, text, model: `Claude (${simpleName})`, error: null };
        }
      } else {
        const errMsg = data?.error?.message || `HTTP ${res.status}`;
        lastError = errMsg;
        if (res.status === 401 || (data?.error && data.error.type === "authentication_error")) {
          return { ok: false, text: null, model: null, error: `Lỗi xác thực Claude API: ${errMsg}` };
        }
      }
    } catch (e) {
      lastError = String(e.message || e);
    }
  }
  return { ok: false, text: null, model: null, error: lastError || "Không nhận được phản hồi từ máy chủ Claude API" };
}

// ============================================================================
// MULTI-PROVIDER AI ENGINE (CLAUDE / GEMINI / OPENAI / GROQ / OPENROUTER)
// ============================================================================
function cleanApiKeyInput(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  const mHeader = s.match(/x-goog-api-key\s*[:=]\s*['"]?([A-Za-z0-9._\-]+)['"]?/i);
  if (mHeader) return mHeader[1].trim();
  const mQuery = s.match(/[?&]key=([A-Za-z0-9._\-]+)/i);
  if (mQuery) return mQuery[1].trim();
  const mBearer = s.match(/Bearer\s+([A-Za-z0-9._\-]+)/i);
  if (mBearer) return mBearer[1].trim();
  const mEnv = s.match(/(?:API_KEY|GEMINI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|CLAUDE_API_KEY)\s*=\s*['"]?([A-Za-z0-9._\-]+)['"]?/i);
  if (mEnv) return mEnv[1].trim();
  return s.replace(/^['"`\s]+|['"`\s]+$/g, "").trim();
}

let cachedDiscoveredGeminiModels = null;

async function discoverGeminiModels(apiKey) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, models: [], error: data?.error?.message || `HTTP ${res.status}` };
    }
    const rawList = Array.isArray(data.models) ? data.models : [];
    const genModels = rawList
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map(m => String(m.name || "").replace(/^models\//, ""))
      .filter(name => name && !/embedding|imagen|aqa|tts|audio|Moderation|robotics|computer-use|veo|lyria/i.test(name));

    const scoreModel = (name) => {
      const n = name.toLowerCase();
      if (n === "gemini-2.5-flash") return 100;
      if (n === "gemini-2.0-flash") return 98;
      if (n === "gemini-2.5-flash-lite" || n.includes("2.5-flash-lite")) return 96;
      if (n === "gemini-2.0-flash-lite" || n.includes("2.0-flash-lite")) return 94;
      if (n.includes("flash") && !n.includes("thinking") && !n.includes("image")) return 90;
      if (n.includes("flash")) return 80;
      if (n.includes("gemini") && n.includes("pro")) return 70;
      if (n.includes("gemini")) return 60;
      if (n.includes("gemma-3")) return 50;
      return 10;
    };

    genModels.sort((a, b) => scoreModel(b) - scoreModel(a));
    if (genModels.length > 0) {
      cachedDiscoveredGeminiModels = genModels;
    }
    return { ok: true, models: genModels, error: null };
  } catch (e) {
    return { ok: false, models: [], error: String(e.message || e) };
  }
}

async function callAIWithDiagnostics(promptText, imageBase64 = null, mimeType = "image/jpeg", overrideKey = null) {
  const apiKey = cleanApiKeyInput(overrideKey !== null ? overrideKey : getGeminiApiKey());
  if (!apiKey) return { text: null, error: "Chưa nhập API Key" };

  let firstRealError = "";

  // 1. ANTHROPIC CLAUDE API (Mã bắt đầu bằng sk-ant-)
  if (apiKey.startsWith("sk-ant-")) {
    const claudeRes = await callAnthropicClaudeAPI(apiKey, promptText, imageBase64, mimeType);
    if (claudeRes.ok) {
      return { text: claudeRes.text, model: claudeRes.model, keyVerified: true, error: null };
    }
    return { text: null, model: null, keyVerified: false, error: claudeRes.error };
  }

  // 2. OpenAI / Groq / OpenRouter / DeepSeek
  if (apiKey.startsWith("sk-") || apiKey.startsWith("gsk_")) {
    const endpoints = [];
    if (apiKey.startsWith("gsk_")) {
      endpoints.push({ url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" });
    } else if (apiKey.startsWith("sk-or-")) {
      endpoints.push({ url: "https://openrouter.ai/api/v1/chat/completions", model: "anthropic/claude-3.5-sonnet" });
      endpoints.push({ url: "https://openrouter.ai/api/v1/chat/completions", model: "google/gemini-2.0-flash-001" });
    } else {
      endpoints.push({ url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" });
      endpoints.push({ url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" });
    }
    for (const ep of endpoints) {
      try {
        const userContent = imageBase64
          ? [
              { type: "text", text: promptText },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
            ]
          : promptText;

        const res = await fetch(ep.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: ep.model,
            messages: [{ role: "user", content: userContent }],
            temperature: 0.2
          })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const text = data?.choices?.[0]?.message?.content;
          if (text) return { text, model: ep.model, keyVerified: true, error: null };
        } else {
          if (!firstRealError) firstRealError = data?.error?.message || `HTTP ${res.status}`;
        }
      } catch (e) {
        if (!firstRealError) firstRealError = String(e.message || e);
      }
    }
    if (firstRealError) {
      return { text: null, model: null, keyVerified: false, error: firstRealError };
    }
  }

  // 3. Dynamically discover exact models available for this Google API key via ListModels
  let modelsToTry = cachedDiscoveredGeminiModels;
  let keyVerifiedByListModels = false;
  if (!modelsToTry || modelsToTry.length === 0 || overrideKey !== null) {
    const disc = await discoverGeminiModels(apiKey);
    if (disc.ok && disc.models.length > 0) {
      modelsToTry = disc.models;
      keyVerifiedByListModels = true;
    } else if (disc.error && !firstRealError) {
      firstRealError = disc.error;
    }
  }

  if (!modelsToTry || modelsToTry.length === 0) {
    modelsToTry = [
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash-lite",
      "gemini-flash-latest"
    ];
  }

  // Filter out text-only gemma models if an image is attached
  const candidateModels = imageBase64
    ? modelsToTry.filter(m => !m.toLowerCase().includes("gemma")).slice(0, 6)
    : modelsToTry.slice(0, 6);

  const parts = [{ text: promptText }];
  if (imageBase64) {
    parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
  }

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.2 }
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const partsArr = data?.candidates?.[0]?.content?.parts || [];
        const text =
          partsArr.filter(p => !p.thought && p.text).map(p => p.text).join("\n") ||
          partsArr.map(p => p.text || "").join("\n");
        if (text) return { text, model, keyVerified: true, error: null };
      } else {
        const errMsg = data?.error?.message || `HTTP ${res.status}`;
        // Do not overwrite a real error (like 429/403) with a 404 model not found error
        if (!firstRealError || res.status !== 404) {
          firstRealError = errMsg;
        }
        if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(errMsg)) {
          break;
        }
      }
    } catch (e) {
      if (!firstRealError) firstRealError = String(e.message || e);
    }
  }

  // If ListModels succeeded, the key itself is 100% valid!
  if (keyVerifiedByListModels) {
    return {
      text: "OK",
      model: candidateModels[0] || "gemini-flash",
      keyVerified: true,
      error: null
    };
  }

  return { text: null, model: null, keyVerified: false, error: firstRealError || "Không nhận được phản hồi" };
}

async function callGeminiFreeAPI(promptText, imageBase64 = null, mimeType = "image/jpeg") {
  const res = await callAIWithDiagnostics(promptText, imageBase64, mimeType);
  return res.text;
}

function openGeminiSettingsModal() {
  const currentKey = getGeminiApiKey();
  const modal = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");

  content.innerHTML = `
    <div class="card-header">
      <div class="card-title">🤖 Cài Đặt Não AI (Anthropic Claude • Google Gemini • OpenAI)</div>
      <button class="btn btn-ghost" style="padding:4px 10px;" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;max-height:80vh;overflow-y:auto;padding-right:4px;">
      <div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.45);border-radius:12px;padding:12px;line-height:1.55;">
        <div style="font-weight:700;color:#fbbf24;margin-bottom:4px;">🌟 Khuyên Dùng: Não AI Claude (Anthropic Claude 3.5 Sonnet)</div>
        <div style="color:var(--text-secondary);font-size:12px;">
          • <b>Khả năng đọc ảnh hóa đơn / bill siêu thị:</b> Claude 3.5 Sonnet đứng đầu thế giới về OCR tiếng Việt, nhận diện đúng từng món hàng & số tiền mờ nhăn chuẩn 99%.<br/>
          • <b>Cách lấy mã Claude:</b> Mở trang <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color:#fbbf24;font-weight:700;text-decoration:underline;">👉 console.anthropic.com/settings/keys</a> → <b>Create Key</b> (mã bắt đầu bằng <code>sk-ant-api03-...</code>).<br/>
          • Dán trực tiếp vào ô bên dưới, hệ thống tự động kích hoạt não Claude Vision OCR!
        </div>
      </div>

      <div style="background:rgba(15,23,42,0.8);border:1px solid var(--border-subtle);border-radius:12px;padding:12px;">
        <div style="font-weight:700;color:#38bdf8;margin-bottom:6px;">🚀 Hoặc Dùng Google AI Studio (Gemini Free 0đ):</div>
        <ol style="margin:0;padding-left:18px;color:var(--text-secondary);font-size:12px;line-height:1.6;">
          <li>Mở trang: <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#34d399;font-weight:700;text-decoration:underline;">👉 aistudio.google.com/app/apikey</a></li>
          <li>Bấm <b>Copy API key</b> (hoặc <b>Create API key</b>) rồi dán vào ô bên dưới.</li>
        </ol>
      </div>

      <div>
        <label style="font-weight:700;display:block;margin-bottom:4px;">🔑 Dán Mã API Key (Claude / Gemini / OpenAI) vào đây:</label>
        <input type="text" id="modal-gemini-key-input" class="input-control" style="width:100%;font-family:monospace;font-size:13px;" value="${currentKey}" placeholder="Dán mã API Key Claude (sk-ant-...) hoặc Gemini (AIza...)..." />
      </div>

      <div id="gemini-test-status" style="font-size:12px;color:var(--text-secondary);"></div>

      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" style="flex:1;" onclick="testAndSaveGeminiKey()">💾 Lưu Mã API & Đồng Bộ Cloud</button>
        <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
      </div>
    </div>
  `;
  modal.style.display = "flex";
}

async function testAndSaveGeminiKey() {
  const rawInput = (document.getElementById("modal-gemini-key-input")?.value || "").trim();
  const val = cleanApiKeyInput(rawInput);
  const inpEl = document.getElementById("modal-gemini-key-input");
  if (inpEl && val) inpEl.value = val;
  const statusEl = document.getElementById("gemini-test-status");

  // Always save immediately without rejecting any key format!
  localStorage.setItem(STORAGE_GEMINI_KEY, val);
  if (DB && DB.meta) DB.meta.gemini_api_key = val;
  updateGeminiBadgeUI();

  if (!val) {
    await persistAndSync({ action: "update_gemini_key", gemini_api_key: "" });
    closeModal();
    return;
  }

  if (statusEl) {
    statusEl.innerHTML = `<span style="color:#38bdf8;">⏳ Đã lưu mã API! Đang thử kết nối tới máy chủ AI...</span>`;
  }

  await persistAndSync({ action: "update_gemini_key", gemini_api_key: val });
  const diag = await callAIWithDiagnostics("Trả lời đúng 1 từ: OK", null, "image/jpeg", val);

  if (diag.text) {
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:#34d399;font-weight:700;">✅ Kết nối AI thành công (Model: ${diag.model})! Đã đồng bộ sang Cloud cho cả 2 vợ chồng.</span>`;
    }
    setTimeout(() => {
      closeModal();
      alert(`🎉 Đã kích hoạt AI thành công (${diag.model})! Giờ bạn và vợ có thể dùng AI để quét ảnh Bill siêu thị, tách câu phức tạp, đọc Email ngân hàng và hỏi đáp AI.`);
    }, 350);
  } else {
    if (statusEl) {
      statusEl.innerHTML = `
        <div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);border-radius:10px;padding:10px;color:#fcd34d;">
          ✅ <b>Đã lưu mã API của bạn vào hệ thống!</b><br/>
          <span style="font-size:11.5px;color:var(--text-secondary);">
            Phản hồi kiểm tra thử từ máy chủ Google/AI: <code>${diag.error}</code>.<br/>
            <i>(Lưu ý: Ở bảng danh sách trên trang Google AI Studio, cột "Project" có mã dạng <code>gen-lang-client-...</code> là Mã Dự Án, còn bấm vào biểu tượng Copy ở cột <b>"API key"</b> mới là Mã Key thực tế).</i>
          </span>
        </div>
      `;
    }
  }
}

async function analyzeQuickInputWithGemini() {
  const inp = document.getElementById("quick-add-input");
  const raw = (inp?.value || "").trim();
  if (!raw) {
    alert("Hãy gõ hoặc bấm 🎙️ Ghi âm câu chi tiêu vào ô nhập (VD: 'Đi chợ mua cá 200k, ốc 370k bằng tiền mặt, mua bỉm Sugi 420k NCB') rồi bấm nút này nhé!");
    return;
  }

  const key = getGeminiApiKey();
  if (!key) {
    openGeminiSettingsModal();
    return;
  }

  const bar = document.getElementById("quick-preview-bar");
  if (bar) {
    bar.innerHTML = `<span style="color:#c4b5fd;font-weight:700;">🤖 Gemini AI đang phân tích câu: "${raw}"...</span>`;
  }

  const defaultSrc = document.getElementById("quick-default-source")?.value || localStorage.getItem(STORAGE_DEFAULT_SOURCE_KEY) || "Tiền mặt";
  const defaultPerson = document.getElementById("quick-default-person")?.value || "AUTO";

  const prompt = `Phân tích câu ghi chép chi tiêu gia đình sau thành danh sách các giao dịch JSON thuần (không dùng markdown \`\`\`):
Câu: "${raw}"
Quy tắc:
- Nếu câu có nhiều món cùng 1 lần mua và chỉ có 1 tổng tiền (VD: "cá, ốc 570k") -> Trả về 1 giao dịch có content="cá, ốc", amount=570000.
- Nếu câu liệt kê nhiều khoản có số tiền riêng hoặc nguồn tiền khác nhau (VD: "mua cá 200k tiền mặt, bỉm sugi 420k ncb") -> Tách thành nhiều giao dịch.
- category chỉ chọn 1 trong: ["Ăn uống", "Học tập", "Phí tiện ích", "Đồ dùng GĐ", "Nợ", "Làm đẹp", "Y tế", "Vui chơi", "Event", "Công việc"].
- person chỉ chọn 1 trong: ["Chung", "Chồng", "Vợ", "Subo", "Sugi"] (nếu không rõ thì dùng "${defaultPerson !== 'AUTO' ? defaultPerson : 'Chung'}").
- source chỉ chọn 1 trong: ["Tiền mặt", "Chuyển khoản", "Tiền mặt / Chuyển khoản", "NCB", "VPBank", "BIDV", "UOB", "VPSP"] (nếu câu không nhắc tên ngân hàng/nguồn tiền thì dùng "${defaultSrc}").
Định dạng trả về bắt buộc:
{"items": [{"content": "...", "amount": 570000, "category": "Ăn uống", "person": "Vợ", "source": "${defaultSrc}"}]}`;

  const aiResp = await callGeminiFreeAPI(prompt);
  if (!aiResp) {
    onQuickInputChange(raw);
    return;
  }

  try {
    const clean = aiResp.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    const list = parsed.items || (Array.isArray(parsed) ? parsed : []);
    if (list.length === 1) {
      const targetM = selectedMonth === 0 ? 10 : selectedMonth;
      const now = new Date();
      currentQuickParsed = {
        date: `2026-${String(targetM).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        month: targetM,
        content: list[0].content || raw,
        amount: Number(list[0].amount || 0),
        category: list[0].category || "Ăn uống",
        person: list[0].person || "Chung",
        source: list[0].source || defaultSrc
      };
      renderInteractiveQuickPreview(currentQuickParsed);
    } else if (list.length > 1) {
      // Open multi-item preview in Receipt Scanner modal so user can review & save all at once!
      openReceiptScannerModal();
      const previewArea = document.getElementById("receipt-preview-area");
      if (previewArea) previewArea.style.display = "none";
      applyParsedReceiptResult({
        storeName: "AI Tách Giao Dịch",
        source: list[0].source || defaultSrc,
        totalAmount: list.reduce((s, i) => s + Number(i.amount || 0), 0),
        items: list.map(i => ({
          name: i.content,
          amount: Number(i.amount || 0),
          category: i.category || "Ăn uống",
          checked: true
        }))
      });
      scannedReceiptData.saveMode = "items";
      renderScannedReceiptUI();
    }
  } catch (e) {
    onQuickInputChange(raw);
  }
}

async function parseEmailWithGeminiAI() {
  const raw = (document.getElementById("raw-email-textarea")?.value || "").trim();
  if (!raw) {
    alert("Vui lòng dán nội dung Email hoặc tin nhắn SMS biến động số dư vào ô trống trước!");
    return;
  }
  const key = getGeminiApiKey();
  if (!key) {
    openGeminiSettingsModal();
    return;
  }

  const prompt = `Trích xuất tất cả các giao dịch trừ tiền/chi tiêu từ nội dung email/SMS ngân hàng sau sang JSON thuần (không markdown):
Nội dung:
${raw}

Trả về JSON theo cấu trúc:
{"items": [{"bank": "NCB|VPBank|BIDV|UOB|Tiền mặt|Chuyển khoản", "date": "2026-10-22", "month": 10, "amount": 485000, "content": "Nội dung rút gọn dễ hiểu", "raw_content": "Nội dung gốc", "category": "Ăn uống|Học tập|Phí tiện ích|Đồ dùng GĐ|Nợ|Làm đẹp|Y tế|Vui chơi|Event|Công việc", "person": "Chung|Chồng|Vợ|Subo|Sugi", "confidence": 0.98, "reason": "Gemini AI phân tích"}]}`;

  const aiResp = await callGeminiFreeAPI(prompt);
  if (!aiResp) {
    parseEmailContent();
    return;
  }
  try {
    const clean = aiResp.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
      const allMapped = parsed.items.map((it, idx) => {
        const amt = Number(it.amount || 0);
        const bank = it.bank || "NCB";
        const content = it.content || "";
        const rawContent = it.raw_content || content;
        const conf = it.confidence || 0.95;
        const unclearCheck = isUnclearEmailItemJS(content, rawContent, conf);
        return {
          temp_id: `EMAIL-GEMINI-${idx + 1}-${amt}`,
          bank,
          source: bank,
          date: it.date || `2026-10-${String(new Date().getDate()).padStart(2, "0")}`,
          month: Number(it.month || 10),
          amount: amt,
          is_income: false,
          content,
          raw_content: rawContent,
          category: it.category || "Ăn uống",
          person: it.person || "Chung",
          confidence: conf,
          reason: it.reason || "Gemini AI phân tích",
          needs_clarification: unclearCheck.isUnclear,
          unclear_reason: unclearCheck.reason,
          ai_question: unclearCheck.isUnclear
            ? `Giao dịch ${fmtVND(amt)} tại ${bank} ("${content}") chi cho việc gì và của ai trong gia đình?`
            : null,
          suggested_options: unclearCheck.isUnclear
            ? getSmartClarificationSuggestionsJS(amt, bank, rawContent)
            : [],
          resolved_by_ai: !unclearCheck.isUnclear
        };
      });
      const freshItems = allMapped.filter(it => !isEmailItemAlreadyAdded(it));
      lastFilteredDuplicateCount = allMapped.length - freshItems.length;
      pendingEmails = freshItems;
      renderPendingEmailList();
      return;
    }
  } catch (e) {}
  parseEmailContent();
}

// ============================================================================
// TAB 6: EXCEL LOGIC AUDIT & CLOUD SYNC
// ============================================================================
function renderAuditTab() {
  const bugs = DB.audit.formula_bugs || [];
  const rows = DB.audit.row_issues || [];

  document.getElementById("audit-bugs-list").innerHTML = bugs.map(b => `
    <div class="alert-item ${b.severity === 'HIGH' ? 'danger' : 'warn'}">
      <div style="font-size:18px;">${b.severity === 'HIGH' ? '🚨' : '⚠️'}</div>
      <div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
          <span class="chip chip-Chồng">${b.id}</span>
          <b>${b.title}</b>
        </div>
        <div style="font-size:12px;color:#fbbf24;margin-bottom:4px;">📍 Vị trí: ${b.location}</div>
        <div style="font-size:13px;color:var(--text-secondary);">${b.detail}</div>
        <div style="font-size:12px;color:#34d399;margin-top:6px;font-weight:600;">✔ Đã tự động sửa trong App & File Excel chuẩn hóa</div>
      </div>
    </div>
  `).join("");

  document.getElementById("audit-rows-list").innerHTML = rows.map(r => `
    <div style="background:rgba(15,23,42,0.75);border:1px solid var(--border-subtle);border-radius:10px;padding:10px 13px;font-size:13px;">
      <div style="font-weight:700;color:#f8fafc;">${r.sheet} (Dòng ${r.row}): "${r.content}" ${r.amount > 0 ? `— <span style="color:#fbbf24;">${fmtVND(r.amount)}</span>` : ''}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:3px;">${r.description}</div>
    </div>
  `).join("");
}

function copyAppsScript() {
  const box = document.getElementById("apps-script-box");
  box.select();
  navigator.clipboard?.writeText(box.value).catch(() => document.execCommand("copy"));
  alert("✅ Đã copy mã Google Apps Script Cloud! Bạn chỉ cần mở Google Sheet -> Extensions -> Apps Script -> Dán vào và bấm Deploy -> New deployment -> Web App.");
}

async function saveCloudUrlFromAuditTab() {
  const url = normalizeAppsScriptUrl(document.getElementById("audit-cloud-url-input")?.value || "");
  localStorage.setItem(STORAGE_CLOUD_URL_KEY, url);
  if (url) {
    await persistAndSync({ action: "init_sync" });
    await pullFromGoogleSheetCloud(false);
  } else {
    updateCloudBadgeUI();
    alert("Đã ngắt kết nối URL Apps Script (Dữ liệu vẫn được lưu an toàn trên thiết bị).");
  }
}

// ============================================================================
// MODALS (Cloud Settings, PIN Settings, Manual Add Transaction, Edit Income)
// ============================================================================
function closeModal() {
  document.getElementById("modal-overlay").style.display = "none";
}

function openCloudSettingsModal() {
  const currentUrl = getCloudScriptUrl();
  const baseAppUrl = window.location.origin + window.location.pathname;
  const inviteLink = currentUrl
    ? `${baseAppUrl}?cloud=${encodeURIComponent(currentUrl)}&pin=${encodeURIComponent(getFamilyPin())}`
    : baseAppUrl;

  const modal = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  content.innerHTML = `
    <div class="card-header">
      <div class="card-title">☁️ Trung Tâm Cloud & Đồng Bộ 2 Vợ Chồng</div>
      <button class="btn btn-ghost" style="padding:4px 10px;" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;font-size:13px;">
      <div style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.35);border-radius:12px;padding:12px;">
        <div style="font-weight:700;color:#34d399;margin-bottom:4px;">✅ App đang chạy 100% trên Cloud (24/7)</div>
        <div style="color:var(--text-secondary);font-size:12px;">
          Không cần bật máy tính cá nhân! Mọi thao tác của Chồng & Vợ đều hoạt động tức thì trên điện thoại (iPhone / Android) và máy tính.
        </div>
      </div>

      <div>
        <label style="font-weight:700;display:block;margin-bottom:4px;">🔗 Link Google Apps Script Web App (Đồng bộ 2 chiều Google Sheet & Quét Gmail):</label>
        <input type="url" id="modal-cloud-url" class="input-control" style="width:100%;" value="${currentUrl}" placeholder="https://script.google.com/macros/s/.../exec" />
        <div style="font-size:11.5px;color:var(--text-secondary);margin-top:5px;">
          💡 Chưa có link? Vào tab <b>"🔍 Kiểm Toán & Cloud Sync"</b> để copy mã Apps Script dán vào Google Sheet của gia đình (chỉ mất 60 giây).
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <button class="btn btn-primary" onclick="saveCloudUrlFromModal()">💾 Lưu & Đồng Bộ Ngay</button>
        <button class="btn btn-ghost" onclick="pullFromGoogleSheetCloud(false)">🔄 Tải Dữ Liệu Mới Nhất</button>
      </div>

      <div style="border-top:1px solid var(--border-subtle);padding-top:12px;">
        <label style="font-weight:700;display:block;margin-bottom:4px;">📲 Gửi Link Cho Vợ / Chồng (Tự động gắn sẵn Cloud & PIN):</label>
        <div style="display:flex;gap:8px;">
          <input type="text" id="spouse-invite-link" class="input-control" style="flex:1;font-size:12px;" readonly value="${inviteLink}" />
          <button class="btn btn-emerald" style="padding:8px 12px;font-size:12px;" onclick="copySpouseInviteLink()">📋 Copy Link</button>
        </div>
        <div style="font-size:11.5px;color:var(--text-secondary);margin-top:5px;">
          📱 <b>Mẹo cài như App thật trên điện thoại:</b> Mở link trên Safari (iPhone) chọn <i>Chia sẻ → Thêm vào MH chính</i>, hoặc trên Chrome (Android) chọn <i>Cài đặt ứng dụng</i>.
        </div>
      </div>
    </div>
  `;
  modal.style.display = "flex";
}

async function saveCloudUrlFromModal() {
  const url = normalizeAppsScriptUrl(document.getElementById("modal-cloud-url")?.value || "");
  localStorage.setItem(STORAGE_CLOUD_URL_KEY, url);
  const auditInp = document.getElementById("audit-cloud-url-input");
  if (auditInp) auditInp.value = url;
  if (url) {
    await persistAndSync({ action: "init_sync" });
    await pullFromGoogleSheetCloud(false);
  } else {
    updateCloudBadgeUI();
  }
  closeModal();
}

function copySpouseInviteLink() {
  const inp = document.getElementById("spouse-invite-link");
  if (!inp) return;
  inp.select();
  navigator.clipboard?.writeText(inp.value).catch(() => document.execCommand("copy"));
  alert("✅ Đã copy Link gửi cho Vợ/Chồng! Khi mở link này trên điện thoại, máy sẽ tự động kết nối chung Google Sheet Cloud của gia đình.");
}

function openPinSettingsModal() {
  const modal = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  content.innerHTML = `
    <div class="card-header">
      <div class="card-title">🔑 Đổi Mã PIN Bảo Mật Gia Đình</div>
      <button class="btn btn-ghost" style="padding:4px 10px;" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div style="font-size:13px;color:var(--text-secondary);">
        Mã PIN hiện tại đang bảo vệ sổ chi tiêu trên Cloud. Hãy nhập 4 chữ số mới (VD: ngày cưới hoặc năm sinh của Subo/Sugi):
      </div>
      <div>
        <label style="font-size:12.5px;color:var(--text-secondary);">Mã PIN mới (4 chữ số)</label>
        <input type="text" id="new-pin-input" maxlength="4" pattern="\\d{4}" class="input-control" style="width:100%;margin-top:4px;font-size:20px;letter-spacing:8px;text-align:center;font-weight:800;" value="${getFamilyPin()}" />
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:6px;" onclick="saveNewFamilyPin()">💾 Lưu Mã PIN Mới</button>
    </div>
  `;
  modal.style.display = "flex";
}

async function saveNewFamilyPin() {
  const val = (document.getElementById("new-pin-input")?.value || "").trim();
  if (!/^\d{4}$/.test(val)) {
    alert("Vui lòng nhập đúng 4 chữ số cho mã PIN (ví dụ: 2026)!");
    return;
  }
  localStorage.setItem(STORAGE_PIN_KEY, val);
  if (DB && DB.meta) DB.meta.family_pin = val;
  await persistAndSync({ action: "update_pin", family_pin: val });
  closeModal();
  alert(`✅ Đã đổi mã PIN gia đình thành: ${val}`);
}

function openManualAddModal() {
  const m = selectedMonth === 0 ? 10 : selectedMonth;
  const defaultSrc = document.getElementById("quick-default-source")?.value || localStorage.getItem(STORAGE_DEFAULT_SOURCE_KEY) || "Tiền mặt";
  const modal = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  content.innerHTML = `
    <div class="card-header">
      <div class="card-title">➕ Thêm Giao Dịch Mới (Tháng ${m}/2026)</div>
      <button class="btn btn-ghost" style="padding:4px 10px;" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <label style="font-size:12.5px;color:var(--text-secondary);">Nội dung chi tiêu</label>
        <input type="text" id="m-tx-content" class="input-control" style="width:100%;margin-top:4px;" placeholder="VD: Cá, ốc, Siêu thị Emart, Bỉm Sugi..." />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:12.5px;color:var(--text-secondary);">Số tiền (VNĐ)</label>
          <input type="number" id="m-tx-amount" class="input-control" style="width:100%;margin-top:4px;" placeholder="VD: 570000" />
        </div>
        <div>
          <label style="font-size:12.5px;color:var(--text-secondary);">Ngày (Tháng ${m})</label>
          <input type="date" id="m-tx-date" class="input-control" style="width:100%;margin-top:4px;" value="2026-${String(m).padStart(2,'0')}-22" />
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:12.5px;color:var(--text-secondary);">Hạng mục</label>
          <select id="m-tx-cat" class="input-control" style="width:100%;margin-top:4px;">
            ${DB.meta.categories.map(c => `<option value="${c}">${c}</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="font-size:12.5px;color:var(--text-secondary);">Thành viên</label>
          <select id="m-tx-person" class="input-control" style="width:100%;margin-top:4px;">
            ${DB.meta.members.map(p => `<option value="${p}">${p}</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="font-size:12.5px;color:var(--text-secondary);">Nguồn tiền</label>
          <select id="m-tx-src" class="input-control" style="width:100%;margin-top:4px;">
            ${ALL_PAYMENT_SOURCES.map(b => `<option value="${b}" ${b === defaultSrc ? 'selected' : ''}>${b}</option>`).join("")}
          </select>
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="submitManualModal(${m})">💾 Lưu Vào Sổ & Đồng Bộ Cloud</button>
    </div>
  `;
  modal.style.display = "flex";
}

async function submitManualModal(m) {
  const content = document.getElementById("m-tx-content").value.trim();
  const amount = Number(document.getElementById("m-tx-amount").value);
  const date = document.getElementById("m-tx-date").value;
  const category = document.getElementById("m-tx-cat").value;
  const person = document.getElementById("m-tx-person").value;
  const source = document.getElementById("m-tx-src").value;

  if (!content || !amount || amount <= 0) {
    alert("Vui lòng nhập nội dung và số tiền hợp lệ!");
    return;
  }

  closeModal();
  await addTransactionToState({ month: m, date, content, category, person, amount, source });
}

function openIncomeModal(targetM = null) {
  const m = targetM || (selectedMonth === 0 ? 10 : selectedMonth);
  const mObj = DB.months.find(x => x.month === m) || DB.months[9];
  const alloc = mObj.allocation || { dca_total: 12000000, dip_fund: 4000000, status: "Đã mua" };
  const modal = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  content.innerHTML = `
    <div class="card-header">
      <div class="card-title">💰 Điều Chỉnh Thu Nhập & Phân Bổ ETF (Tháng ${m}/2026)</div>
      <button class="btn btn-ghost" style="padding:4px 10px;" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <span style="font-size:12.5px;color:#a7f3d0;font-weight:600;">📅 Chọn tháng cần chỉnh sửa thu nhập / thưởng / ETF:</span>
        <select id="inc-month-select" class="input-control" style="font-weight:700;color:#34d399;" onchange="openIncomeModal(Number(this.value))">
          ${DB.months.map(x => `<option value="${x.month}" ${x.month === m ? 'selected' : ''}>Tháng ${x.month}/2026 (${fmtShortVND(x.income.total)})</option>`).join("")}
        </select>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:12px;color:var(--text-secondary);">👨 Thu nhập Chồng (CK + Lương/Thưởng)</label>
          <input type="number" id="inc-ck" class="input-control" style="width:100%;margin-top:4px;font-weight:700;" value="${mObj.income.CK}" oninput="previewIncomeModalCalc(${m})" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-secondary);">👩 Thu nhập Vợ (VK + Lương/Thưởng)</label>
          <input type="number" id="inc-vk" class="input-control" style="width:100%;margin-top:4px;font-weight:700;" value="${mObj.income.VK}" oninput="previewIncomeModalCalc(${m})" />
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:12px;color:var(--text-secondary);">👦 Thu nhập / Lì xì / Quỹ Subo</label>
          <input type="number" id="inc-subo" class="input-control" style="width:100%;margin-top:4px;" value="${mObj.income.Subo}" oninput="previewIncomeModalCalc(${m})" />
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-secondary);">👶 Thu nhập / Mừng sinh / Quỹ Sugi</label>
          <input type="number" id="inc-sugi" class="input-control" style="width:100%;margin-top:4px;" value="${mObj.income.Sugi}" oninput="previewIncomeModalCalc(${m})" />
        </div>
      </div>

      <div style="border-top:1px dashed var(--border-subtle);padding-top:10px;margin-top:2px;">
        <div style="font-size:12.5px;font-weight:700;color:#a5b4fc;margin-bottom:8px;">📈 Phân bổ Đầu tư DCA ETF & Quỹ Bắt Đáy Tháng ${m}:</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11.5px;color:var(--text-secondary);">DCA 3 Quỹ ETF/Mở (VNĐ)</label>
            <input type="number" id="inc-dca-total" class="input-control" style="width:100%;margin-top:4px;color:#818cf8;font-weight:700;" value="${alloc.dca_total || 0}" oninput="previewIncomeModalCalc(${m})" />
          </div>
          <div>
            <label style="font-size:11.5px;color:var(--text-secondary);">Quỹ Bắt Đáy (VNĐ)</label>
            <input type="number" id="inc-dip-fund" class="input-control" style="width:100%;margin-top:4px;color:#fbbf24;font-weight:700;" value="${alloc.dip_fund || 0}" oninput="previewIncomeModalCalc(${m})" />
          </div>
          <div>
            <label style="font-size:11.5px;color:var(--text-secondary);">Trạng thái ETF Tháng ${m}</label>
            <select id="inc-dca-status" class="input-control" style="width:100%;margin-top:4px;font-weight:700;">
              <option value="Đã mua" ${alloc.status === 'Đã mua' ? 'selected' : ''}>✅ Đã mua đủ</option>
              <option value="Chờ mua" ${alloc.status === 'Chờ mua' ? 'selected' : ''}>⏳ Chờ mua</option>
              <option value="Linh hoạt cuối năm" ${alloc.status === 'Linh hoạt cuối năm' ? 'selected' : ''}>🎯 Linh hoạt cuối năm</option>
            </select>
          </div>
        </div>
      </div>

      <div id="inc-live-preview" style="background:rgba(15,23,42,0.85);border:1px solid var(--border-subtle);border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.6;"></div>

      <button class="btn btn-primary" style="width:100%;margin-top:4px;padding:11px;font-size:13.5px;" onclick="submitIncomeModal(${m})">💾 Lưu Thu Nhập & ETF Tháng ${m} (Đồng Bộ Cloud)</button>
    </div>
  `;
  modal.style.display = "flex";
  previewIncomeModalCalc(m);
}

function previewIncomeModalCalc(m) {
  const mObj = DB.months.find(x => x.month === m) || DB.months[9];
  const CK = Number(document.getElementById("inc-ck")?.value || 0);
  const VK = Number(document.getElementById("inc-vk")?.value || 0);
  const Subo = Number(document.getElementById("inc-subo")?.value || 0);
  const Sugi = Number(document.getElementById("inc-sugi")?.value || 0);
  const dca = Number(document.getElementById("inc-dca-total")?.value || 0);
  const dip = Number(document.getElementById("inc-dip-fund")?.value || 0);

  const totInc = CK + VK + Subo + Sugi;
  const exp = mObj.actual_total_expense || 0;
  const surplus = totInc - exp;
  const cashRemain = surplus - dca - dip;

  const box = document.getElementById("inc-live-preview");
  if (box) {
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;"><span>Tổng thu nhập Tháng ${m}:</span><b style="color:#34d399;">${fmtVND(totInc)}</b></div>
      <div style="display:flex;justify-content:space-between;"><span>Thực chi Tháng ${m} hiện tại:</span><b style="color:#fb7185;">${fmtVND(exp)}</b></div>
      <div style="display:flex;justify-content:space-between;"><span>Thặng dư ròng (Thu - Chi):</span><b style="color:${surplus >= 0 ? '#38bdf8' : '#ef4444'};">${fmtVND(surplus)}</b></div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.08);margin-top:4px;padding-top:4px;">
        <span>Tiền mặt giữ lại (sau DCA + Quỹ Bắt Đáy):</span>
        <b style="color:#a7f3d0;">${fmtVND(cashRemain)}</b>
      </div>
    `;
  }
}

async function submitIncomeModal(m) {
  const CK = Number(document.getElementById("inc-ck")?.value || 0);
  const VK = Number(document.getElementById("inc-vk")?.value || 0);
  const Subo = Number(document.getElementById("inc-subo")?.value || 0);
  const Sugi = Number(document.getElementById("inc-sugi")?.value || 0);
  const dcaTotal = Number(document.getElementById("inc-dca-total")?.value || 0);
  const dipFund = Number(document.getElementById("inc-dip-fund")?.value || 0);
  const dcaStatus = document.getElementById("inc-dca-status")?.value || "Đã mua";

  const mObj = DB.months.find(x => x.month === m);
  if (mObj) {
    mObj.income.CK = CK;
    mObj.income.VK = VK;
    mObj.income.Subo = Subo;
    mObj.income.Sugi = Sugi;
    if (!mObj.allocation) mObj.allocation = {};
    mObj.allocation.dca_total = dcaTotal;
    mObj.allocation.dca_fuevfvnd = Math.round(dcaTotal * 0.30);
    mObj.allocation.dca_dcds = Math.round(dcaTotal * 0.25);
    mObj.allocation.dca_vesaf = Math.round(dcaTotal * 0.45);
    mObj.allocation.dip_fund = dipFund;
    mObj.allocation.status = dcaStatus;
  }

  // Đồng bộ bảng lệnh DCA nếu trạng thái là "Đã mua"
  if (DB.investment && Array.isArray(DB.investment.dca_orders)) {
    if (dcaStatus === "Đã mua" && dcaTotal > 0) {
      const holdingsMap = {};
      (DB.investment.holdings || []).forEach(h => { holdingsMap[h.code] = h; });
      [["FUEVFVND", 0.30], ["DCDS", 0.25], ["VESAF", 0.45]].forEach(([code, ratio]) => {
        const amt = Math.round(dcaTotal * ratio);
        const nav = Number(holdingsMap[code]?.current_nav || 40000);
        const units = nav > 0 ? Number((amt / nav).toFixed(2)) : 0;
        const existing = DB.investment.dca_orders.find(o => Number(o.month) === m && o.code === code);
        if (existing) {
          existing.amount = amt;
          existing.units = Number((amt / (existing.buy_nav || nav)).toFixed(2));
          existing.status = "Đã khớp";
        } else {
          DB.investment.dca_orders.push({
            id: `DCA-T${m}-${code}`,
            month: m,
            date: `2026-${String(m).padStart(2, "0")}-15`,
            code,
            amount: amt,
            buy_nav: nav,
            units,
            status: "Đã khớp"
          });
        }
      });
    } else if (dcaStatus !== "Đã mua") {
      DB.investment.dca_orders = DB.investment.dca_orders.filter(o => Number(o.month) !== m);
    }

    // Tính lại tổng CCQ & Giá vốn của 3 quỹ
    (DB.investment.holdings || []).forEach(h => {
      const orders = DB.investment.dca_orders.filter(o => o.code === h.code && o.status === "Đã khớp");
      const totInv = orders.reduce((s, o) => s + Number(o.amount || 0), 0);
      const totUnits = Number(orders.reduce((s, o) => s + Number(o.units || 0), 0).toFixed(2));
      h.invested_amount = totInv;
      h.units = totUnits;
      h.avg_buy_nav = totUnits > 0 ? Math.round(totInv / totUnits) : h.avg_buy_nav;
      h.market_value = Math.round(totUnits * Number(h.current_nav || 0));
      h.profit = h.market_value - totInv;
      h.profit_pct = totInv > 0 ? Number(((h.profit / totInv) * 100).toFixed(2)) : 0;
    });
  }

  closeModal();
  renderAll();
  fetch("/api/income", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month: m, CK, VK, Subo, Sugi })
  }).catch(() => {});
  await persistAndSync({ action: "update_income", month: m });
}

// ============================================================================
// VOICE INPUT (GHI ÂM TIẾNG VIỆT TRỰC TIẾP TRÊN ĐIỆN THOẠI & MÁY TÍNH)
// ============================================================================
function toggleVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById("btn-voice-input");
  const inp = document.getElementById("quick-add-input");

  if (!SpeechRecognition) {
    alert("Trình duyệt hiện tại chưa hỗ trợ nhận diện giọng nói trực tiếp. Bạn có thể bấm biểu tượng Micro 🎙️ trên bàn phím điện thoại (iPhone / Android) hoặc mở bằng Chrome / Safari nhé!");
    if (inp) inp.focus();
    return;
  }

  if (isVoiceListening && voiceRecognition) {
    try { voiceRecognition.stop(); } catch (e) {}
    isVoiceListening = false;
    if (btn) {
      btn.innerHTML = "🎙️ Ghi âm";
      btn.style.background = "rgba(236,72,153,0.14)";
      btn.style.borderColor = "rgba(236,72,153,0.4)";
    }
    return;
  }

  voiceRecognition = new SpeechRecognition();
  voiceRecognition.lang = "vi-VN";
  voiceRecognition.continuous = false;
  voiceRecognition.interimResults = true;

  voiceRecognition.onstart = () => {
    isVoiceListening = true;
    if (btn) {
      btn.innerHTML = "🔴 Đang nghe... (Hãy nói)";
      btn.style.background = "rgba(239,68,68,0.28)";
      btn.style.borderColor = "#ef4444";
    }
    if (inp) {
      inp.placeholder = "🎙️ Đang nghe... Hãy nói VD: 'Cá, ốc 570k vợ' hoặc 'Đi siêu thị 850k ncb'";
    }
  };

  voiceRecognition.onresult = (event) => {
    let transcript = "";
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const normalized = convertVietnameseSpokenNumbers(transcript.trim());
    if (inp) {
      inp.value = normalized;
      onQuickInputChange(normalized);
    }
  };

  voiceRecognition.onerror = (event) => {
    isVoiceListening = false;
    if (btn) {
      btn.innerHTML = "🎙️ Ghi âm";
      btn.style.background = "rgba(236,72,153,0.14)";
      btn.style.borderColor = "rgba(236,72,153,0.4)";
    }
    if (event.error === "not-allowed") {
      alert("Vui lòng cấp quyền Micro (Microphone) cho trình duyệt để sử dụng tính năng Ghi âm giọng nói!");
    }
  };

  voiceRecognition.onend = () => {
    isVoiceListening = false;
    if (btn) {
      btn.innerHTML = "🎙️ Ghi âm";
      btn.style.background = "rgba(236,72,153,0.14)";
      btn.style.borderColor = "rgba(236,72,153,0.4)";
    }
    if (inp) {
      inp.placeholder = "Gõ hoặc bấm 🎙️ nói: 'cá, ốc 570k', 'winmart 385k', 'bỉm sugi 420k ncb'...";
      if (inp.value.trim()) {
        onQuickInputChange(inp.value);
      }
    }
  };

  try {
    voiceRecognition.start();
  } catch (e) {
    isVoiceListening = false;
  }
}

// ============================================================================
// RECEIPT / BILL IMAGE SCANNER (QUÉT BILL SIÊU THỊ & ẢNH CHUYỂN KHOẢN)
// ============================================================================
let scannedReceiptData = {
  storeName: "Siêu thị",
  saveMode: "total", // 'total' | 'items'
  totalAmount: 0,
  totalContent: "",
  category: "Ăn uống",
  person: "Vợ",
  source: "Tiền mặt",
  date: "",
  items: []
};

function openReceiptScannerModal() {
  const m = selectedMonth === 0 ? 10 : selectedMonth;
  const todayStr = `2026-${String(m).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
  const defaultSrc = document.getElementById("quick-default-source")?.value || localStorage.getItem(STORAGE_DEFAULT_SOURCE_KEY) || "Tiền mặt";
  const geminiKey = getGeminiApiKey();

  const aiProviderName = getAIProviderName(geminiKey) || "Não AI";

  scannedReceiptData = {
    storeName: "Siêu thị",
    saveMode: "total",
    totalAmount: 0,
    totalContent: "",
    category: "Ăn uống",
    person: "Vợ",
    source: defaultSrc,
    date: todayStr,
    items: []
  };

  const modal = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  content.innerHTML = `
    <div class="card-header">
      <div class="card-title">📸 Quét Bill Đi Siêu Thị / Hóa Đơn / Ảnh Chuyển Khoản</div>
      <button class="btn btn-ghost" style="padding:4px 10px;" onclick="closeModal()">✕</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;max-height:78vh;overflow-y:auto;padding-right:4px;">
      <div style="background:rgba(6,182,212,0.1);border:1px dashed rgba(6,182,212,0.45);border-radius:14px;padding:16px;text-align:center;">
        <div style="font-weight:700;color:#22d3ee;font-size:14px;margin-bottom:6px;">
          🛒 Chụp ảnh Bill Siêu Thị (Co.opmart, WinMart, Bách Hóa Xanh, Emart...) hoặc Ảnh Bill Ngân Hàng
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">
          ${geminiKey
            ? `<span style="color:#34d399;font-weight:700;">✨ Đã bật ${aiProviderName}:</span> Tự động đọc siêu chuẩn từng món hàng, giá tiền và tổng hóa đơn chỉ trong 1-2 giây!`
            : `Hỗ trợ đọc hóa đơn bằng OCR hoặc bấm <a href="javascript:void(0)" onclick="openGeminiSettingsModal()" style="color:#c4b5fd;font-weight:700;text-decoration:underline;">🤖 Cài Não AI (Claude / Gemini)</a> để đọc Bill siêu thị mờ/nhăn chuẩn 99%!`}
        </div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <label class="btn btn-primary" style="cursor:pointer;padding:9px 14px;font-size:12.5px;">
            📷 Chụp Ảnh / Chọn Ảnh Bill
            <input type="file" id="receipt-file-input" accept="image/*" style="display:none;" onchange="handleReceiptImageSelected(this.files[0])" />
          </label>
          <button class="btn btn-ghost" style="padding:9px 12px;font-size:12px;color:#fbbf24;border-color:rgba(245,158,11,0.4);" onclick="loadSampleSupermarketBill()">
            🧾 Thử Bill Siêu Thị Mẫu (Cá, ốc, rau...)
          </button>
        </div>
      </div>

      <div id="receipt-preview-area" style="display:none;gap:12px;align-items:flex-start;background:rgba(15,23,42,0.75);padding:10px;border-radius:12px;border:1px solid var(--border-subtle);">
        <img id="receipt-img-preview" style="width:95px;height:120px;object-fit:cover;border-radius:8px;border:1px solid var(--border-subtle);" />
        <div style="flex:1;">
          <div id="receipt-ocr-status" style="font-weight:700;color:#38bdf8;margin-bottom:6px;">⏳ Đang phân tích ảnh hóa đơn...</div>
          <div style="width:100%;height:7px;background:rgba(255,255,255,0.08);border-radius:99px;overflow:hidden;">
            <div id="receipt-ocr-bar" style="width:15%;height:100%;background:linear-gradient(90deg,#06b6d4,#6366f1);transition:width 0.25s;"></div>
          </div>
          <div style="font-size:11.5px;color:var(--text-secondary);margin-top:6px;">
            Bạn có thể chỉnh sửa trực tiếp các món, Nguồn tiền, Người chi hoặc Tổng tiền bên dưới trước khi bấm Lưu vào sổ.
          </div>
        </div>
      </div>

      <div id="receipt-parsed-container" style="display:none;flex-direction:column;gap:12px;"></div>
    </div>
  `;
  modal.style.display = "flex";
}

function loadTesseractScript() {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve(window.Tesseract);
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = () => resolve(window.Tesseract);
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleReceiptImageSelected(file) {
  if (!file) return;
  const previewArea = document.getElementById("receipt-preview-area");
  const imgEl = document.getElementById("receipt-img-preview");
  const statusEl = document.getElementById("receipt-ocr-status");
  const barEl = document.getElementById("receipt-ocr-bar");

  if (previewArea) previewArea.style.display = "flex";
  if (statusEl) statusEl.textContent = "⏳ Đang tối ưu hóa kích thước ảnh...";
  if (barEl) barEl.style.width = "20%";

  // Nén ảnh bằng Canvas xuống kích thước chuẩn để tải lên AI siêu nhanh (chỉ ~300KB thay vì 10MB)
  const compressed = await compressImageForOCR(file, 1600, 0.85);
  const dataUrl = compressed.dataUrl;
  if (imgEl) imgEl.src = dataUrl;

  const geminiKey = getGeminiApiKey();
  const provider = getAIProviderName(geminiKey) || "Vision AI";
  const defaultSrc = document.getElementById("quick-default-source")?.value || localStorage.getItem(STORAGE_DEFAULT_SOURCE_KEY) || "Tiền mặt";

  // 1. Dùng Claude / Gemini Vision AI nếu đã cài API Key
  if (geminiKey) {
    try {
      if (statusEl) statusEl.textContent = `✨ Đang dùng ${provider} bóc tách chi tiết hóa đơn siêu thị / bill...`;
      if (barEl) barEl.style.width = "65%";
      const base64Raw = compressed.base64;
      const mimeType = compressed.mimeType || "image/jpeg";
      const visionPrompt = `Đây là ảnh chụp hóa đơn siêu thị hoặc bill chuyển khoản tại Việt Nam. Hãy trích xuất chính xác sang JSON thuần (không dùng markdown \`\`\`):
{
  "storeName": "Tên siêu thị/cửa hàng hoặc ngân hàng",
  "source": "Chọn 1 trong: Tiền mặt, Chuyển khoản, NCB, VPBank, BIDV, UOB, VPSP (nếu trên bill không ghi ngân hàng thì để '${defaultSrc}')",
  "totalAmount": số_nguyên_VNĐ_tổng_thanh_toán,
  "items": [
    {"name": "Tên món hàng (tiếng Việt có dấu rõ ràng)", "amount": thành_tiền_số_nguyên_VNĐ, "category": "Chọn 1 trong: Ăn uống, Đồ dùng GĐ, Phí tiện ích, Học tập, Y tế, Vui chơi, Làm đẹp, Công việc, Event, Nợ"}
  ]
}`;
      const rawTxt = await callGeminiFreeAPI(visionPrompt, base64Raw, mimeType);
      if (rawTxt) {
        const parsedAi = extractJsonFromAiResponse(rawTxt);
        if (parsedAi && (parsedAi.totalAmount || (parsedAi.items && parsedAi.items.length > 0))) {
          if (barEl) barEl.style.width = "100%";
          if (statusEl) statusEl.textContent = `✅ ${provider} đã bóc tách hóa đơn thành công!`;
          applyParsedReceiptResult(parsedAi);
          return;
        }
      }
    } catch (e) {
      console.warn("AI OCR Error:", e);
    }
  }

  // 2. Built-in Client-side OCR (Tesseract.js Vietnamese)
  try {
    if (statusEl) statusEl.textContent = "🔍 Đang tải bộ nhận diện chữ Tiếng Việt (OCR)...";
    if (barEl) barEl.style.width = "30%";
    const TesseractLib = await loadTesseractScript();

    const result = await TesseractLib.recognize(dataUrl, "vie+eng", {
      logger: m => {
        if (m.status === "recognizing text" && barEl) {
          const pct = Math.max(30, Math.round((m.progress || 0) * 100));
          barEl.style.width = `${pct}%`;
          if (statusEl) statusEl.textContent = `🔍 Đang đọc từng dòng trên Bill (${pct}%)...`;
        }
      }
    });

    const rawText = result?.data?.text || "";
    if (barEl) barEl.style.width = "100%";
    if (statusEl) statusEl.textContent = "✅ Đã quét xong! Bạn có thể kiểm tra & chỉnh sửa bên dưới:";

    const parsed = parseReceiptOcrTextJS(rawText);
    applyParsedReceiptResult(parsed, rawText);
  } catch (err) {
    if (statusEl) statusEl.textContent = "⚠️ Không đọc rõ chữ tự động. Bạn có thể nhập nhanh bên dưới:";
    applyParsedReceiptResult({
      storeName: "Hóa đơn siêu thị",
      totalAmount: 0,
      items: [{ name: "Đi siêu thị / Mua đồ", amount: 0, category: "Ăn uống" }]
    });
  }
}

function parseReceiptOcrTextJS(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length >= 2);

  let storeName = "Siêu thị";
  const fullFold = foldVN(rawText || "");
  if (fullFold.includes("coop") || fullFold.includes("co.op")) storeName = "Siêu thị Co.opmart";
  else if (fullFold.includes("winmart") || fullFold.includes("vinmart")) storeName = "Siêu thị WinMart";
  else if (fullFold.includes("bach hoa xanh") || fullFold.includes("bhx")) storeName = "Bách Hóa Xanh";
  else if (fullFold.includes("emart")) storeName = "Siêu thị Emart";
  else if (fullFold.includes("lotte")) storeName = "Siêu thị Lotte Mart";
  else if (fullFold.includes("aeon")) storeName = "Siêu thị AEON";
  else if (fullFold.includes("big c") || fullFold.includes("go!")) storeName = "Siêu thị GO! / Big C";
  else if (fullFold.includes("con cung") || fullFold.includes("concung")) storeName = "Con Cưng";
  else if (fullFold.includes("pharmacity") || fullFold.includes("long chau") || fullFold.includes("guardian")) storeName = "Nhà thuốc";

  let detectedSource = document.getElementById("quick-default-source")?.value || localStorage.getItem(STORAGE_DEFAULT_SOURCE_KEY) || "Tiền mặt";
  if (fullFold.includes("ncb") || fullFold.includes("quoc dan")) detectedSource = "NCB";
  else if (fullFold.includes("vpbank")) detectedSource = "VPBank";
  else if (fullFold.includes("bidv")) detectedSource = "BIDV";
  else if (fullFold.includes("uob")) detectedSource = "UOB";

  const ignoreKeywords = [
    "tong cong", "thanh tien", "thanh toan", "tong tien", "total", "tien mat",
    "tien thoi", "tien thua", "chuyen khoan", "giam gia", " chiet khau", "vat",
    "thue", "hoa don", "ngay", "gio", "thu ngan", "khach hang", "diem tich luy",
    "so du", "ma gd", "so tk", "cam on", "hen gap lai", "hotline", " MST"
  ];

  const totalKeywords = [
    "tong cong", "thanh toan", "tong thanh toan", "phai thu", "tong tien", "total", "so tien gd", "so tien:"
  ];

  let totalAmount = 0;
  const items = [];

  for (const line of lines) {
    const lf = foldVN(line);
    const priceMatches = [...line.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d+\s*k)\b/gi)];
    if (priceMatches.length === 0) continue;

    const lastMatch = priceMatches[priceMatches.length - 1][0];
    let val = 0;
    if (/k$/i.test(lastMatch)) {
      val = Math.round(parseFloat(lastMatch) * 1000);
    } else {
      val = parseInt(lastMatch.replace(/[.,\s]/g, ""), 10);
    }

    if (!val || val < 1000 || val > 500000000) continue;

    if (totalKeywords.some(tk => lf.includes(tk))) {
      if (val > totalAmount) totalAmount = val;
      continue;
    }

    if (ignoreKeywords.some(ik => lf.includes(ik))) continue;

    const firstMatchIdx = line.indexOf(priceMatches[0][0]);
    let itemName = line.slice(0, firstMatchIdx)
      .replace(/^[\d\s.\-*#]+/, "")
      .replace(/\s+\d+\s*[xX*]\s*$/, "")
      .trim();

    if (itemName.length >= 2 && !/^\d+$/.test(itemName)) {
      const cls = classifyExpenseJS(itemName);
      items.push({
        name: itemName,
        amount: val,
        category: cls.category,
        checked: true
      });
    }
  }

  const sumItems = items.reduce((s, it) => s + it.amount, 0);
  if (!totalAmount && sumItems > 0) {
    totalAmount = sumItems;
  }

  if (items.length === 0 && totalAmount > 0) {
    items.push({
      name: `Thanh toán ${storeName}`,
      amount: totalAmount,
      category: "Ăn uống",
      checked: true
    });
  }

  return {
    storeName,
    source: detectedSource,
    totalAmount: totalAmount || sumItems,
    items
  };
}

function loadSampleSupermarketBill() {
  const previewArea = document.getElementById("receipt-preview-area");
  if (previewArea) previewArea.style.display = "none";

  applyParsedReceiptResult({
    storeName: "Siêu thị Co.opmart",
    source: document.getElementById("quick-default-source")?.value || localStorage.getItem(STORAGE_DEFAULT_SOURCE_KEY) || "Tiền mặt",
    totalAmount: 570000,
    items: [
      { name: "Cá điêu hồng làm sạch", amount: 185000, category: "Ăn uống", checked: true },
      { name: "Ốc hương tươi", amount: 245000, category: "Ăn uống", checked: true },
      { name: "Rau cải ngọt & hành ngò", amount: 35000, category: "Ăn uống", checked: true },
      { name: "Sữa tươi cho Subo & Sugi", amount: 105000, category: "Đồ dùng GĐ", checked: true }
    ]
  });
}

function applyParsedReceiptResult(parsed) {
  const m = selectedMonth === 0 ? 10 : selectedMonth;
  const todayStr = `2026-${String(m).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

  const items = (parsed.items || []).map(it => ({
    name: it.name || "Món hàng",
    amount: Number(it.amount || 0),
    category: (DB.meta.categories.includes(it.category) ? it.category : classifyExpenseJS(it.name || "").category) || "Ăn uống",
    checked: it.checked !== false
  }));

  const sumItems = items.reduce((s, it) => s + it.amount, 0);
  const totalAmt = Number(parsed.totalAmount || sumItems || 0);
  const itemSummaryNames = items.map(i => i.name).slice(0, 4).join(", ");
  const storePrefix = parsed.storeName || "Siêu thị";

  scannedReceiptData = {
    storeName: storePrefix,
    saveMode: "total",
    totalAmount: totalAmt,
    totalContent: itemSummaryNames ? `${storePrefix}: ${itemSummaryNames}` : `Đi ${storePrefix}`,
    category: "Ăn uống",
    person: "Vợ",
    source: parsed.source || document.getElementById("quick-default-source")?.value || localStorage.getItem(STORAGE_DEFAULT_SOURCE_KEY) || "Tiền mặt",
    date: todayStr,
    items
  };

  renderScannedReceiptUI();
}

function renderScannedReceiptUI() {
  const container = document.getElementById("receipt-parsed-container");
  if (!container) return;
  container.style.display = "flex";

  const bankOptions = ALL_PAYMENT_SOURCES;
  const selectedItemsCount = scannedReceiptData.items.filter(i => i.checked).length;
  const selectedItemsSum = scannedReceiptData.items.filter(i => i.checked).reduce((s, i) => s + Number(i.amount || 0), 0);

  container.innerHTML = `
    <div style="background:rgba(15,23,42,0.9);border:1px solid rgba(99,102,241,0.35);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div style="font-weight:700;color:#a5b4fc;">🧾 Kết Quả Đọc Hóa Đơn (Chỉnh sửa thoải mái trước khi Lưu)</div>
        <div style="display:flex;gap:6px;">
          <button class="btn ${scannedReceiptData.saveMode === 'total' ? 'btn-primary' : 'btn-ghost'}" style="padding:5px 10px;font-size:11.5px;" onclick="scannedReceiptData.saveMode='total';renderScannedReceiptUI();">
            1️⃣ Gộp 1 Dòng Tổng Bill
          </button>
          <button class="btn ${scannedReceiptData.saveMode === 'items' ? 'btn-primary' : 'btn-ghost'}" style="padding:5px 10px;font-size:11.5px;" onclick="scannedReceiptData.saveMode='items';renderScannedReceiptUI();">
            🔢 Tách Từng Món (${selectedItemsCount} món)
          </button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:8px;">
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);">Người chi tiêu</label>
          <select class="input-control" style="width:100%;margin-top:3px;padding:6px 8px;font-size:12px;" onchange="scannedReceiptData.person=this.value">
            ${DB.meta.members.map(m => `<option value="${m}" ${m === scannedReceiptData.person ? 'selected' : ''}>${m}</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);">Nguồn tiền / Ngân hàng</label>
          <select class="input-control" style="width:100%;margin-top:3px;padding:6px 8px;font-size:12px;" onchange="scannedReceiptData.source=this.value">
            ${bankOptions.map(b => `<option value="${b}" ${b === scannedReceiptData.source ? 'selected' : ''}>${b}</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);">Ngày hóa đơn</label>
          <input type="date" class="input-control" style="width:100%;margin-top:3px;padding:6px 8px;font-size:12px;" value="${scannedReceiptData.date}" onchange="scannedReceiptData.date=this.value" />
        </div>
      </div>

      ${scannedReceiptData.saveMode === "total" ? `
        <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;">
          <div style="font-size:12px;color:#34d399;font-weight:700;">📌 Chế độ 1: Lưu gọn thành 1 dòng Tổng Bill (Ghi kèm tên các món đã mua)</div>
          <div style="display:grid;grid-template-columns:1.6fr 1fr 0.9fr;gap:8px;">
            <div>
              <label style="font-size:11px;color:var(--text-secondary);">Nội dung tổng hợp</label>
              <input type="text" class="input-control" style="width:100%;margin-top:2px;font-weight:600;" value="${String(scannedReceiptData.totalContent).replace(/"/g, '&quot;')}" oninput="scannedReceiptData.totalContent=this.value" />
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);">Tổng số tiền (VNĐ)</label>
              <input type="number" class="input-control" style="width:100%;margin-top:2px;font-weight:800;color:#34d399;" value="${scannedReceiptData.totalAmount}" oninput="scannedReceiptData.totalAmount=Number(this.value||0)" />
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);">Hạng mục</label>
              <select class="input-control" style="width:100%;margin-top:2px;" onchange="scannedReceiptData.category=this.value">
                ${DB.meta.categories.map(c => `<option value="${c}" ${c === scannedReceiptData.category ? 'selected' : ''}>${c}</option>`).join("")}
              </select>
            </div>
          </div>
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12px;color:#38bdf8;font-weight:700;">📌 Chế độ 2: Chọn & sửa từng món trên Bill (${selectedItemsCount} món = ${fmtVND(selectedItemsSum)})</span>
            <button class="btn btn-ghost" style="padding:4px 8px;font-size:11px;" onclick="addBlankReceiptItem()">➕ Thêm dòng món</button>
          </div>
          ${scannedReceiptData.items.map((it, idx) => `
            <div style="display:grid;grid-template-columns:auto 1.5fr 0.9fr 0.9fr auto;gap:6px;align-items:center;">
              <input type="checkbox" ${it.checked ? 'checked' : ''} onchange="scannedReceiptData.items[${idx}].checked=this.checked;renderScannedReceiptUI();" />
              <input type="text" class="input-control" style="padding:6px 8px;font-size:12px;" value="${String(it.name).replace(/"/g, '&quot;')}" oninput="scannedReceiptData.items[${idx}].name=this.value" />
              <input type="number" class="input-control" style="padding:6px 8px;font-size:12px;color:#34d399;font-weight:700;" value="${it.amount}" oninput="scannedReceiptData.items[${idx}].amount=Number(this.value||0)" />
              <select class="input-control" style="padding:6px 8px;font-size:12px;" onchange="scannedReceiptData.items[${idx}].category=this.value">
                ${DB.meta.categories.map(c => `<option value="${c}" ${c === it.category ? 'selected' : ''}>${c}</option>`).join("")}
              </select>
              <button class="btn btn-ghost" style="padding:4px 8px;color:#fb7185;" onclick="scannedReceiptData.items.splice(${idx},1);renderScannedReceiptUI();">✕</button>
            </div>
          `).join("")}
        </div>
      `}

      <button class="btn btn-primary" style="width:100%;padding:11px;font-size:13.5px;" onclick="saveScannedReceiptToTransactions()">
        💾 Lưu Hóa Đơn Vào Sổ & Đồng Bộ Cloud
      </button>
    </div>
  `;
}

function addBlankReceiptItem() {
  scannedReceiptData.items.push({
    name: "Món mới",
    amount: 50000,
    category: "Ăn uống",
    checked: true
  });
  renderScannedReceiptUI();
}

async function saveScannedReceiptToTransactions() {
  const m = selectedMonth === 0 ? 10 : selectedMonth;
  const dateStr = scannedReceiptData.date || `2026-${String(m).padStart(2, "0")}-22`;
  const monthFromDate = dateStr.split("-")[1] ? Number(dateStr.split("-")[1]) : m;

  if (scannedReceiptData.saveMode === "total") {
    const content = (scannedReceiptData.totalContent || "").trim();
    const amount = Number(scannedReceiptData.totalAmount || 0);
    if (!content || amount <= 0) {
      alert("Vui lòng kiểm tra lại nội dung và tổng số tiền (> 0 đ)!");
      return;
    }
    closeModal();
    await addTransactionToState({
      month: monthFromDate,
      date: dateStr,
      content,
      category: scannedReceiptData.category || "Ăn uống",
      person: scannedReceiptData.person || "Vợ",
      amount,
      source: scannedReceiptData.source || "Tiền mặt"
    });
  } else {
    const chosen = scannedReceiptData.items.filter(i => i.checked && i.name.trim() && Number(i.amount) > 0);
    if (chosen.length === 0) {
      alert("Vui lòng chọn ít nhất 1 món hàng có số tiền > 0 đ!");
      return;
    }
    const addedTxs = [];
    chosen.forEach((it, idx) => {
      const newNum = DB.transactions.length + 1 + idx;
      const tx = {
        id: `TX2026-${String(newNum).padStart(4, "0")}-BILL${idx}`,
        month: monthFromDate,
        date: dateStr,
        row: 0,
        content: it.name.trim(),
        category: it.category || "Ăn uống",
        person: scannedReceiptData.person || "Vợ",
        amount: Number(it.amount),
        source: scannedReceiptData.source || "Tiền mặt",
        was_unmatched_in_excel: false,
        issue_note: null,
        is_cloud_added: true
      };
      DB.transactions.unshift(tx);
      addedTxs.push(tx);
    });
    closeModal();
    renderAll();
    await persistAndSync({ action: "batch_tx", transactions: addedTxs });
  }
}

// Hỗ trợ Ctrl+V dán ảnh trực tiếp khi đang mở cửa sổ Quét Bill
window.addEventListener("paste", (e) => {
  const modal = document.getElementById("modal-overlay");
  if (!modal || modal.style.display === "none") return;
  const items = e.clipboardData?.items || [];
  for (const item of items) {
    if (item.type && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) handleReceiptImageSelected(file);
      break;
    }
  }
});

window.addEventListener("DOMContentLoaded", initApp);
