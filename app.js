let DB = null;
let selectedMonth = 10; // Default to current month T10 (or 0 for full year)
let pendingEmails = [];
let quickParseTimer = null;
let currentQuickParsed = null;
let enteredPin = "";

const STORAGE_DB_KEY = "FAMILY_WEALTH_2026_DB_V2";
const STORAGE_PIN_KEY = "FAMILY_WEALTH_2026_PIN";
const STORAGE_UNLOCK_KEY = "FAMILY_WEALTH_2026_UNLOCK_UNTIL";
const STORAGE_CLOUD_URL_KEY = "FAMILY_WEALTH_2026_GAS_URL";

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
Nội dung: Nhà thuốc Long Châu mua thuốc ho và vitamin cho Subo.`;

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
      if (!colC[i][0] && !colF[i][0]) { targetRow = i + 4; break; }
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
    const q = '(from:vpbank OR from:bidv OR from:ncb OR from:uob OR "VPBank" OR "BIDV" OR "NCB" OR "Quoc Dan" OR "biến động số dư") newer_than:30d';
    const threads = GmailApp.search(q, 0, 20);
    const blocks = [];
    for (let i = 0; i < threads.length; i++) {
      const msgs = threads[i].getMessages();
      const msg = msgs[msgs.length - 1];
      const dt = Utilities.formatDate(msg.getDate(), "GMT+7", "dd/MM/yyyy HH:mm");
      const body = msg.getPlainBody() || msg.getBody().replace(/<[^>]+>/g, " ");
      blocks.push("From: " + msg.getFrom() + "\\nSubject: " + msg.getSubject() + "\\nDate: " + dt + "\\n" + body.substring(0, 1000));
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
  [["tini", "khu vui chơi", "lego", "đồ chơi", "tô tượng", "super wing", "con cưng", "concung"], "Vui chơi", "Subo"],
  [["bỉm", "sữa thanh", "kem hăm", "kem bôi hăm", "bình sữa", "túi trữ sữa", "tiêm chủng sugi"], "Đồ dùng GĐ", "Sugi"],
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
    if (tLow.includes(cKey)) {
      cat = cVal;
      confidence = 0.98;
      break;
    }
  }

  return { cat, person, confidence, reason };
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

  // Default payment source is "Tiền mặt / Chuyển khoản" unless user explicitly types a bank keyword (ncb, vp, bidv, uob, vpsp)
  let source = localStorage.getItem("FAMILY_DEFAULT_SOURCE_2026") || "Tiền mặt / Chuyển khoản";
  let matchedBankToken = null;

  const bankRules = [
    { re: /(?:^|[\s,.;])(vpsp|vp\s*sp|vpbank\s*shopee)(?=$|[\s,.;])/i, name: "VPBank Shopee" },
    { re: /(?:^|[\s,.;])(vpbank|vp)(?=$|[\s,.;])/i, name: "VPBank" },
    { re: /(?:^|[\s,.;])(bidv)(?=$|[\s,.;])/i, name: "BIDV" },
    { re: /(?:^|[\s,.;])(ncb)(?=$|[\s,.;])/i, name: "NCB" },
    { re: /(?:^|[\s,.;])(uob)(?=$|[\s,.;])/i, name: "UOB" },
    { re: /(?:^|[\s,.;])(tiền\s*mặt|tien\s*mat|chuyển\s*khoản|chuyen\s*khoan|tm)(?=$|[\s,.;])/i, name: "Tiền mặt / Chuyển khoản" }
  ];

  for (const rule of bankRules) {
    const mB = text.match(rule.re);
    if (mB) {
      source = rule.name;
      matchedBankToken = mB[1];
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

  const { cat, person, confidence, reason } = classifyTransactionTextJS(text);
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

    const { cat, person, confidence, reason } = classifyTransactionTextJS(block + " " + friendlyNote);

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
        reason
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
  const sideTxt = document.getElementById("sidebar-sync-text");
  const url = getCloudScriptUrl();
  const label = statusText || (url ? "☁️ Đã nối Google Sheet (2 chiều)" : "☁️ Cloud Active (Lưu thiết bị)");
  if (topLbl) topLbl.textContent = label;
  if (sideTxt) sideTxt.textContent = label;
}

function getDefaultMailboxes() {
  return [
    {
      id: "MB-CHONG",
      label: "👨 Email của Chồng (VPBank • BIDV)",
      email: "nnt474@gmail.com",
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
  if (DB && DB.meta && Array.isArray(DB.meta.mailboxes) && DB.meta.mailboxes.length > 0) {
    return DB.meta.mailboxes;
  }
  const saved = localStorage.getItem("FAMILY_MAILBOXES_2026");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (DB && DB.meta) DB.meta.mailboxes = parsed;
        return parsed;
      }
    } catch (e) {}
  }
  const defs = getDefaultMailboxes();
  if (DB && DB.meta) DB.meta.mailboxes = defs;
  return defs;
}

function saveFamilyMailboxes(list) {
  if (DB && DB.meta) DB.meta.mailboxes = list;
  localStorage.setItem("FAMILY_MAILBOXES_2026", JSON.stringify(list));
}

function buildCompactCloudState() {
  // Store custom added transactions, edited transactions, deleted IDs, mailboxes, months income/allocation, and investment state
  const customTxs = (DB.transactions || []).filter(t => t.is_cloud_added || Number((t.id || "").split("-")[1]) > 888);
  const editedTxs = (DB.transactions || []).filter(t => t.is_cloud_edited && !t.is_cloud_added);
  const deletedIds = DB.meta.deleted_tx_ids || [];
  return {
    updated_at: new Date().toISOString(),
    family_pin: getFamilyPin(),
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
    navigator.serviceWorker.register("./sw.js").catch(() => {});
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
    const res = await fetch("./data/family_db.json");
    if (res.ok) baseDb = await res.json();
  } catch (e) {}

  if (!baseDb) {
    try {
      const res = await fetch("/api/data");
      if (res.ok) baseDb = await res.json();
    } catch (e) {}
  }

  // Restore local cached modifications if present
  const cachedRaw = localStorage.getItem(STORAGE_DB_KEY);
  if (cachedRaw) {
    try {
      const cachedDb = JSON.parse(cachedRaw);
      if (cachedDb && cachedDb.transactions && cachedDb.months) {
        DB = cachedDb;
      }
    } catch (e) {}
  }
  if (!DB) DB = baseDb;

  if (!DB.sample_bank_emails) DB.sample_bank_emails = SAMPLE_BANK_EMAILS_DEFAULT;
  DB.apps_script_code = APPS_SCRIPT_CLOUD_CODE;

  recomputeMonthsJS(DB);
  checkPinLockOnStartup();
  renderAll();
  updateCloudBadgeUI();

  const emailBox = document.getElementById("raw-email-textarea");
  if (emailBox && DB.sample_bank_emails) {
    emailBox.value = DB.sample_bank_emails;
    parseEmailContent(true);
  }
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
  const banks = ["Tiền mặt / Chuyển khoản", "NCB", "VPBank", "BIDV", "VPBank Shopee", "UOB"];

  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%;">
      <span style="color:#a5b4fc;font-weight:700;">🤖 Sửa nhanh trước khi lưu:</span>
      <input type="text" id="qp-content" class="input-control" style="padding:4px 9px;font-size:12.5px;min-width:150px;flex:1;" value="${(p.content || "").replace(/"/g, '&quot;')}" oninput="if(currentQuickParsed) currentQuickParsed.content=this.value" title="Nội dung chi tiêu" />
      <input type="number" id="qp-amount" class="input-control" style="padding:4px 9px;font-size:12.5px;width:115px;color:#34d399;font-weight:700;" value="${p.amount || 0}" oninput="if(currentQuickParsed) currentQuickParsed.amount=Number(this.value)" title="Số tiền (VNĐ)" />
      <select id="qp-category" class="input-control" style="padding:4px 8px;font-size:12px;" onchange="if(currentQuickParsed) currentQuickParsed.category=this.value">
        ${cats.map(c => `<option value="${c}" ${c === p.category ? 'selected' : ''}>🗂️ ${c}</option>`).join("")}
      </select>
      <select id="qp-person" class="input-control" style="padding:4px 8px;font-size:12px;" onchange="if(currentQuickParsed) currentQuickParsed.person=this.value">
        ${members.map(m => `<option value="${m}" ${m === p.person ? 'selected' : ''}>👤 ${m}</option>`).join("")}
      </select>
      <select id="qp-source" class="input-control" style="padding:4px 8px;font-size:12px;border-color:rgba(168,85,247,0.45);color:#e9d5ff;" onchange="if(currentQuickParsed){currentQuickParsed.source=this.value;localStorage.setItem('FAMILY_DEFAULT_SOURCE_2026',this.value);}">
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
    bar.innerHTML = `<span>💡 <b>Nhập gõ chữ, 🎙️ Giọng nói hoặc 📸 Chụp Bill siêu thị:</b> Mặc định <b>Tiền mặt / Chuyển khoản</b> (gõ kèm <code>ncb</code>, <code>vp</code>, <code>bidv</code> nếu quẹt thẻ/bank). Chỉnh sửa trực tiếp bên dưới trước hoặc sau khi lưu!</span>`;
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
    source: payload.source || "Tiền mặt / Chuyển khoản",
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
  // Always parse fresh from `val` first so fast typing + Enter never uses stale text,
  // then merge any user edits from the interactive preview bar if present
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
    alert("Vui lòng nhập kèm số tiền (ví dụ: 'cá, ốc 570k' hoặc 'bỉm sugi 420k ncb')!");
    return;
  }

  const tx = await addTransactionToState(payload);
  inp.value = "";
  currentQuickParsed = null;
  document.getElementById("quick-preview-bar").innerHTML = `
    <span style="color:#34d399;font-weight:700;">✅ Đã lưu '${tx.content}' (${fmtVND(tx.amount)} • ${tx.category} • ${tx.person} • ${tx.source}) vào Tháng ${tx.month}!</span>
    <button class="btn btn-ghost" style="padding:3px 9px;font-size:11.5px;margin-left:8px;" onclick="openEditTransactionModal('${tx.id}')">✏️ Sửa lại</button>
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
      <div class="kpi-label"><span>TỔNG THU NHẬP (${periodLabel})</span><span>💰</span></div>
      <div class="kpi-val" style="color:#34d399;">${fmtVND(incTotal)}</div>
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
        <td class="num">${fmtShortVND(m.income.total)}</td>
        <td class="num">${fmtShortVND(m.actual_total_expense)}</td>
        <td class="num" style="color:${m.remaining_actual >= 0 ? '#34d399' : '#fb7185'};">${fmtShortVND(m.remaining_actual)}</td>
        <td class="num">${savPct}</td>
        <td class="num" style="color:#a5b4fc;">${m.allocation.dca_total > 0 ? fmtShortVND(m.allocation.dca_total) : '—'}</td>
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

function renderEarlyWarnings() {
  const m10 = DB.months.find(m => m.month === 10);
  const m9 = DB.months.find(m => m.month === 9);
  const warnings = [
    {
      type: "success",
      icon: "☁️",
      title: "App Gia Đình đã chạy trên Cloud 24/7 (Không cần bật máy tính)!",
      desc: "Cả Chồng & Vợ có thể mở link trên điện thoại bất cứ lúc nào, thêm vào Màn hình chính (PWA) và đồng bộ 2 chiều với Google Sheet."
    },
    {
      type: "success",
      icon: "🎉",
      title: "Tin vui: Vợ đã tất toán 100% khoản trả góp Điện thoại (35,490,000 đ)!",
      desc: "Kỳ Tháng 10/2026 (2,490,000 đ) là kỳ cuối cùng trong 12 kỳ. Từ Tháng 11/2026, ngân sách cố định hàng tháng giảm được 3,000,000 đ."
    },
    {
      type: "warn",
      icon: "📅",
      title: "Nhắc lịch khớp lệnh DCA Tháng 10/2026 (12,000,000 đ)",
      desc: `Tháng 10 hiện đang thặng dư +${fmtVND(m10.remaining_actual)}. Hãy giải ngân định kỳ: 3.6tr FUEVFVND • 3.0tr DCDS • 5.4tr VESAF.`
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

  document.getElementById("early-warnings-list").innerHTML = warnings.map(w => `
    <div class="alert-item ${w.type}">
      <div style="font-size:20px;">${w.icon}</div>
      <div>
        <div style="font-weight:700;margin-bottom:2px;">${w.title}</div>
        <div style="color:var(--text-secondary);font-size:12.5px;">${w.desc}</div>
      </div>
    </div>
  `).join("");
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

  document.getElementById("tx-table-body").innerHTML = filtered.slice(0, 250).map(t => `
    <tr>
      <td style="white-space:nowrap;color:var(--text-secondary);font-size:12.5px;">${t.date} <span style="opacity:0.6;">(T${t.month})</span></td>
      <td>
        <div style="font-weight:600;cursor:pointer;" onclick="openEditTransactionModal('${t.id}')" title="Bấm để chỉnh sửa giao dịch này">${t.content}</div>
        ${t.was_unmatched_in_excel ? `<div style="font-size:11px;color:#fbbf24;">🔧 Đã khôi phục từ dòng sót trong Excel</div>` : ''}
      </td>
      <td><span class="chip chip-cat" style="cursor:pointer;" onclick="openEditTransactionModal('${t.id}')">${t.category}</span></td>
      <td><span class="chip chip-${t.person}" style="cursor:pointer;" onclick="openEditTransactionModal('${t.id}')">${t.person}</span></td>
      <td><span class="chip chip-bank" style="cursor:pointer;" onclick="openEditTransactionModal('${t.id}')">${t.source}</span></td>
      <td class="num" style="color:#f8fafc;cursor:pointer;" onclick="openEditTransactionModal('${t.id}')">${fmtVND(t.amount)}</td>
      <td class="num" style="white-space:nowrap;">
        <button class="btn btn-ghost" style="padding:4px 8px;font-size:11.5px;color:#38bdf8;margin-right:4px;" onclick="openEditTransactionModal('${t.id}')" title="Sửa giao dịch">✏️ Sửa</button>
        <button class="btn btn-ghost" style="padding:4px 8px;font-size:11.5px;color:#fb7185;" onclick="deleteTransaction('${t.id}')" title="Xóa">✕</button>
      </td>
    </tr>
  `).join("");
}

function openEditTransactionModal(txId) {
  const tx = DB.transactions.find(t => t.id === txId);
  if (!tx) return;

  const bankOptions = DB.meta.banks || ["Tiền mặt / Chuyển khoản", "VPBank", "BIDV", "NCB", "UOB", "VPSP"];
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
  }

  tx.content = content;
  tx.amount = amount;
  tx.date = date;
  tx.month = month;
  tx.category = category;
  tx.person = person;
  tx.source = source;

  if (!DB.meta.edited_transactions) DB.meta.edited_transactions = {};
  DB.meta.edited_transactions[tx.id] = {
    content,
    amount,
    date,
    month,
    category,
    person,
    source,
    updated_at: new Date().toISOString()
  };

  closeModal();
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

function loadSampleBankEmails() {
  const raw = (DB && DB.sample_bank_emails) ? DB.sample_bank_emails : SAMPLE_BANK_EMAILS_DEFAULT;
  document.getElementById("raw-email-textarea").value = raw;
  parseEmailContent();
}

function parseEmailContent() {
  const raw = document.getElementById("raw-email-textarea").value;
  pendingEmails = parseBankEmailsJS(raw);
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
  document.getElementById("pending-email-count").textContent = pendingEmails.length;
  const box = document.getElementById("parsed-email-list");
  if (pendingEmails.length === 0) {
    box.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-secondary);">🎉 Không có giao dịch email nào chờ duyệt!</div>`;
    return;
  }

  const bankOptions = DB.meta.banks || ["Tiền mặt / Chuyển khoản", "VPBank", "BIDV", "NCB", "UOB", "VPSP"];

  box.innerHTML = pendingEmails.map((item, idx) => `
    <div style="background:rgba(15,23,42,0.85);border:1px solid var(--border-subtle);border-radius:14px;padding:14px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;">
        <div>
          <span class="chip chip-bank">🏦 ${item.source || item.bank}</span>
          <span style="font-size:12px;color:var(--text-secondary);margin-left:6px;">📅 ${item.date} (Tháng ${item.month})</span>
        </div>
        <div style="font-size:17px;font-weight:800;color:#34d399;">${fmtVND(item.amount)}</div>
      </div>

      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Gốc: "${item.raw_content}"</div>

      <div style="display:grid;grid-template-columns:1.3fr 0.9fr 0.8fr 0.9fr auto;gap:8px;align-items:center;">
        <input type="text" class="input-control" value="${String(item.content || '').replace(/"/g, '&quot;')}" onchange="pendingEmails[${idx}].content=this.value" />
        <select class="input-control" onchange="pendingEmails[${idx}].category=this.value">
          ${DB.meta.categories.map(c => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`).join("")}
        </select>
        <select class="input-control" onchange="pendingEmails[${idx}].person=this.value">
          ${DB.meta.members.map(m => `<option value="${m}" ${m === item.person ? 'selected' : ''}>${m}</option>`).join("")}
        </select>
        <select class="input-control" onchange="pendingEmails[${idx}].source=this.value;pendingEmails[${idx}].bank=this.value;">
          ${bankOptions.map(b => `<option value="${b}" ${b === (item.source || item.bank) ? 'selected' : ''}>${b}</option>`).join("")}
        </select>
        <button class="btn btn-primary" style="padding:8px 12px;font-size:12px;" onclick="approveSingleEmail(${idx})">
          ✔ Duyệt
        </button>
      </div>
      <div style="font-size:11.5px;color:#818cf8;margin-top:6px;">✨ AI (${Math.round(item.confidence * 100)}%): ${item.reason}</div>
    </div>
  `).join("");
}

async function approveSingleEmail(idx) {
  const item = pendingEmails[idx];
  if (!item) return;
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
  const itemsToApprove = [...pendingEmails];
  const addedTxs = [];
  itemsToApprove.forEach((item, idx) => {
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
      • Khoản trả góp Điện thoại của Vợ (35.49tr) <b>vừa chính thức tất toán xong 100% trong Tháng 10!</b><br/><br/>
      Bạn có thể bấm vào các câu hỏi gợi ý phía trên hoặc gõ câu hỏi bất kỳ bên dưới nhé!
    </div>
  `;
}

function askAiQuestion(qText) {
  switchTab("ai");
  const box = document.getElementById("ai-chat-messages");
  box.innerHTML += `<div class="chat-bubble user">${qText}</div>`;
  const answer = answerFamilyQuestionJS(qText, DB);
  box.innerHTML += `<div class="chat-bubble ai">${formatMarkdownSimple(answer)}</div>`;
  box.scrollTop = box.scrollHeight;
}

function sendAiChat() {
  const inp = document.getElementById("ai-question-input");
  const q = inp.value.trim();
  if (!q) return;
  inp.value = "";
  askAiQuestion(q);
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
        <input type="text" id="m-tx-content" class="input-control" style="width:100%;margin-top:4px;" placeholder="VD: Siêu thị Emart, Bỉm Sugi, Đổ xăng..." />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:12.5px;color:var(--text-secondary);">Số tiền (VNĐ)</label>
          <input type="number" id="m-tx-amount" class="input-control" style="width:100%;margin-top:4px;" placeholder="VD: 350000" />
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
            ${DB.meta.banks.map(b => `<option value="${b}">${b}</option>`).join("")}
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

function openIncomeModal() {
  const m = selectedMonth === 0 ? 10 : selectedMonth;
  const mObj = DB.months.find(x => x.month === m) || DB.months[9];
  const modal = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  content.innerHTML = `
    <div class="card-header">
      <div class="card-title">💰 Cập Nhật Thu Nhập Tháng ${m}/2026</div>
      <button class="btn btn-ghost" style="padding:4px 10px;" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <label style="font-size:12.5px;color:var(--text-secondary);">👨 Thu nhập Chồng (CK)</label>
        <input type="number" id="inc-ck" class="input-control" style="width:100%;margin-top:4px;" value="${mObj.income.CK}" />
      </div>
      <div>
        <label style="font-size:12.5px;color:var(--text-secondary);">👩 Thu nhập Vợ (VK)</label>
        <input type="number" id="inc-vk" class="input-control" style="width:100%;margin-top:4px;" value="${mObj.income.VK}" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:12.5px;color:var(--text-secondary);">👦 Thu nhập / Quỹ Subo</label>
          <input type="number" id="inc-subo" class="input-control" style="width:100%;margin-top:4px;" value="${mObj.income.Subo}" />
        </div>
        <div>
          <label style="font-size:12.5px;color:var(--text-secondary);">👶 Thu nhập / Quỹ Sugi</label>
          <input type="number" id="inc-sugi" class="input-control" style="width:100%;margin-top:4px;" value="${mObj.income.Sugi}" />
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="submitIncomeModal(${m})">💾 Cập Nhật Thu Nhập Tháng ${m}</button>
    </div>
  `;
  modal.style.display = "flex";
}

async function submitIncomeModal(m) {
  const CK = Number(document.getElementById("inc-ck").value || 0);
  const VK = Number(document.getElementById("inc-vk").value || 0);
  const Subo = Number(document.getElementById("inc-subo").value || 0);
  const Sugi = Number(document.getElementById("inc-sugi").value || 0);

  const mObj = DB.months.find(x => x.month === m);
  if (mObj) {
    mObj.income.CK = CK;
    mObj.income.VK = VK;
    mObj.income.Subo = Subo;
    mObj.income.Sugi = Sugi;
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
  const inp = document.getElementById("quick-input");

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
      inp.placeholder = "⚡ Nhập nhanh hoặc bấm 🎙️ Ghi âm: 'cá, ốc 570k' hoặc 'bỉm sugi 420k ncb'...";
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
  source: "Tiền mặt / Chuyển khoản",
  date: "",
  items: []
};

function openReceiptScannerModal() {
  const m = selectedMonth === 0 ? 10 : selectedMonth;
  const todayStr = `2026-${String(m).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
  const defaultSrc = localStorage.getItem(STORAGE_DEFAULT_SOURCE_KEY) || "Tiền mặt / Chuyển khoản";
  const geminiKey = localStorage.getItem(STORAGE_GEMINI_KEY) || "";

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
          Hỗ trợ tự động đọc tên món hàng, giá tiền từng món và tổng hóa đơn. Bạn cũng có thể bấm <b>Ctrl+V</b> để dán ảnh chụp màn hình.
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

        <details style="margin-top:10px;text-align:left;font-size:11.5px;color:var(--text-secondary);">
          <summary style="cursor:pointer;color:#a5b4fc;font-weight:600;">✨ Nâng cao: Cài Gemini AI Key miễn phí để đọc Bill chữ mờ / viết tay siêu chuẩn (Tùy chọn)</summary>
          <div style="margin-top:6px;display:flex;gap:6px;">
            <input type="password" id="gemini-api-key-input" class="input-control" style="flex:1;padding:6px 10px;font-size:11.5px;" value="${geminiKey}" placeholder="Dán Gemini API Key (AIzaSy...) từ aistudio.google.com" onchange="saveGeminiKey(this.value)" />
            <button class="btn btn-ghost" style="padding:6px 10px;font-size:11.5px;" onclick="saveGeminiKey(document.getElementById('gemini-api-key-input').value)">Lưu Key</button>
          </div>
        </details>
      </div>

      <div id="receipt-preview-area" style="display:none;gap:12px;align-items:flex-start;background:rgba(15,23,42,0.75);padding:10px;border-radius:12px;border:1px solid var(--border-subtle);">
        <img id="receipt-img-preview" style="width:95px;height:120px;object-fit:cover;border-radius:8px;border:1px solid var(--border-subtle);" />
        <div style="flex:1;">
          <div id="receipt-ocr-status" style="font-weight:700;color:#38bdf8;margin-bottom:6px;">⏳ Đang phân tích ảnh hóa đơn...</div>
          <div style="width:100%;height:7px;background:rgba(255,255,255,0.08);border-radius:99px;overflow:hidden;">
            <div id="receipt-ocr-bar" style="width:15%;height:100%;background:linear-gradient(90deg,#06b6d4,#6366f1);transition:width 0.25s;"></div>
          </div>
          <div style="font-size:11.5px;color:var(--text-secondary);margin-top:6px;">
            Bạn có thể chỉnh sửa trực tiếp các món hoặc Tổng tiền bên dưới trước khi bấm Lưu vào sổ.
          </div>
        </div>
      </div>

      <div id="receipt-parsed-container" style="display:none;flex-direction:column;gap:12px;"></div>
    </div>
  `;
  modal.style.display = "flex";
}

function saveGeminiKey(val) {
  const k = (val || "").trim();
  localStorage.setItem(STORAGE_GEMINI_KEY, k);
  alert(k ? "✅ Đã lưu Gemini Vision AI Key! Khi chọn ảnh Bill, App sẽ ưu tiên dùng AI để đọc chính xác từng món hàng." : "Đã xóa Gemini Key (App sẽ dùng bộ đọc OCR tích hợp sẵn).");
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
  const dataUrl = await fileToBase64(file);
  if (imgEl) imgEl.src = dataUrl;

  const geminiKey = (localStorage.getItem(STORAGE_GEMINI_KEY) || "").trim();

  // 1. Try Gemini Vision AI if key is configured
  if (geminiKey) {
    try {
      if (statusEl) statusEl.textContent = "✨ Đang dùng Gemini Vision AI bóc tách hóa đơn siêu thị...";
      if (barEl) barEl.style.width = "60%";
      const base64Raw = dataUrl.split(",")[1];
      const mimeType = file.type || "image/jpeg";
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `Đây là hóa đơn siêu thị hoặc bill thanh toán tại Việt Nam. Hãy trích xuất chính xác sang JSON thuần (không có markdown):
{"storeName": "Tên siêu thị/cửa hàng", "source": "Tiền mặt / Chuyển khoản hoặc NCB/VPBank/BIDV", "totalAmount": số_nguyên_VNĐ, "items": [{"name": "Tên món hàng", "amount": số_nguyên_VNĐ, "category": "Ăn uống|Cho con|Hóa đơn|Gia đình|Mặc|Đi lại|Khác"}]}`
              },
              { inline_data: { mime_type: mimeType, data: base64Raw } }
            ]
          }]
        })
      });
      if (resp.ok) {
        const json = await resp.json();
        const rawTxt = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const cleanJson = rawTxt.replace(/```json|```/g, "").trim();
        const parsedAi = JSON.parse(cleanJson);
        if (parsedAi && (parsedAi.totalAmount || (parsedAi.items && parsedAi.items.length > 0))) {
          if (barEl) barEl.style.width = "100%";
          if (statusEl) statusEl.textContent = "✅ Đã bóc tách hóa đơn bằng AI thành công!";
          applyParsedReceiptResult(parsedAi);
          return;
        }
      }
    } catch (e) {}
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

  let detectedSource = localStorage.getItem(STORAGE_DEFAULT_SOURCE_KEY) || "Tiền mặt / Chuyển khoản";
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
    // Tìm số tiền ở cuối dòng (VD: 185,000 hoặc 185.000 hoặc 570k)
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

    // Kiểm tra có phải dòng Tổng tiền không
    if (totalKeywords.some(tk => lf.includes(tk))) {
      if (val > totalAmount) totalAmount = val;
      continue;
    }

    if (ignoreKeywords.some(ik => lf.includes(ik))) continue;

    // Lấy tên món hàng phía trước số tiền
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
    source: localStorage.getItem(STORAGE_DEFAULT_SOURCE_KEY) || "Tiền mặt / Chuyển khoản",
    totalAmount: 570000,
    items: [
      { name: "Cá điêu hồng làm sạch", amount: 185000, category: "Ăn uống", checked: true },
      { name: "Ốc hương tươi", amount: 245000, category: "Ăn uống", checked: true },
      { name: "Rau cải ngọt & hành ngò", amount: 35000, category: "Ăn uống", checked: true },
      { name: "Sữa tươi cho Subo & Sugi", amount: 105000, category: "Cho con", checked: true }
    ]
  });
}

function applyParsedReceiptResult(parsed) {
  const m = selectedMonth === 0 ? 10 : selectedMonth;
  const todayStr = `2026-${String(m).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

  const items = (parsed.items || []).map(it => ({
    name: it.name || "Món hàng",
    amount: Number(it.amount || 0),
    category: it.category || classifyExpenseJS(it.name || "").category || "Ăn uống",
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
    source: parsed.source || localStorage.getItem(STORAGE_DEFAULT_SOURCE_KEY) || "Tiền mặt / Chuyển khoản",
    date: todayStr,
    items
  };

  renderScannedReceiptUI();
}

function renderScannedReceiptUI() {
  const container = document.getElementById("receipt-parsed-container");
  if (!container) return;
  container.style.display = "flex";

  const bankOptions = DB.meta.banks || ["Tiền mặt / Chuyển khoản", "VPBank", "BIDV", "NCB", "UOB", "VPSP"];
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
      source: scannedReceiptData.source || "Tiền mặt / Chuyển khoản"
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
        source: scannedReceiptData.source || "Tiền mặt / Chuyển khoản",
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
