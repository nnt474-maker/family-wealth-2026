/**
 * ============================================================================
 * ☁️ GOOGLE APPS SCRIPT — CLOUD BACKEND & ĐỒNG BỘ 2 VỢ CHỒNG (FAMILY WEALTH 2026)
 * ============================================================================
 * Tác dụng:
 *   1. Đồng bộ 2 chiều thời gian thực giữa Điện thoại Chồng, Điện thoại Vợ & Máy tính
 *   2. Tự động ghi mọi giao dịch mới vào đúng Sheet [T1 - DETAIL] .. [T12 - DETAIL]
 *   3. Tự động đọc Email biến động số dư VPBank, BIDV, NCB, UOB, Shopee ngay trong
 *      tài khoản Gmail (KHÔNG cần nhập App Password, chạy 100% trên mây Google)
 *
 * HƯỚNG DẪN CÀI ĐẶT (Chỉ làm 1 lần — mất 60 giây):
 *   Bước 1: Mở Google Sheet [2026 - FAMILY NOTE BOOK] của gia đình:
 *           https://docs.google.com/spreadsheets/d/1FtjpyD-DP4HS8z7uJoYDw9TKwBh3qSCwdXqy1eaQEEk/edit
 *   Bước 2: Trên thanh menu chọn: Tiện ích mở rộng (Extensions) -> Apps Script
 *   Bước 3: Xóa mã cũ, dán toàn bộ mã này vào và bấm biểu tượng Lưu (Ctrl+S)
 *   Bước 4: Bấm nút "Triển khai" (Deploy) ở góc phải trên -> "Tùy chọn triển khai mới" (New deployment)
 *           - Chọn loại (Select type): "Ứng dụng web" (Web app)
 *           - Thực thi dưới dạng (Execute as): "Tôi" (Me)
 *           - Ai có quyền truy cập (Who has access): "Bất kỳ ai" (Anyone)
 *           - Bấm "Triển khai" (Deploy) -> Cấp quyền (Authorize access) -> Copy URL Web App
 *   Bước 5: Dán URL Web App (`https://script.google.com/macros/s/.../exec`) vào mục
 *           "☁️ Cài đặt Cloud" trên ứng dụng Family Wealth 2026!
 * ============================================================================
 */

const SHEET_ID = '1FtjpyD-DP4HS8z7uJoYDw9TKwBh3qSCwdXqy1eaQEEk';
const CLOUD_STATE_SHEET = '_CLOUD_DB';

const CAT_EXCEL_MAP = {
  "Ăn uống": "Ăn uống",
  "Vui chơi": "vui chơi",
  "Công việc": "Công việc",
  "Học tập": "học tập",
  "Đồ dùng GĐ": "đồ dùng GĐ",
  "Phí tiện ích": "phí tiện ích",
  "Làm đẹp": "Làm đẹp",
  "Y tế": "Y tế",
  "Event": "event",
  "Nợ": "Nợ"
};

const PERSON_EXCEL_MAP = {
  "Chung": "Chung",
  "Chồng": "chồng",
  "Vợ": "vợ",
  "Subo": "SUBO",
  "Sugi": "SUGI"
};

function getOrCreateCloudSheet(ss) {
  let sh = ss.getSheetByName(CLOUD_STATE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CLOUD_STATE_SHEET);
    sh.hideSheet();
    sh.getRange('A1').setValue('UPDATED_AT');
    sh.getRange('B1').setValue('STATE_JSON');
  }
  return sh;
}

function appendTxToMonthSheet(ss, tx) {
  const m = Number(tx.month || 10);
  const sheetName = 'T' + m + ' - DETAIL';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: false, reason: 'Không tìm thấy sheet ' + sheetName };

  const colC = sheet.getRange('C4:C830').getValues();
  const colF = sheet.getRange('F4:F830').getValues();
  let targetRow = 4;
  for (let i = 0; i < colC.length; i++) {
    if (!colC[i][0] && !colF[i][0]) {
      targetRow = i + 4;
      break;
    }
  }

  sheet.getRange(targetRow, 2, 1, 6).setValues([[
    tx.date || new Date(),
    tx.content || '',
    CAT_EXCEL_MAP[tx.category] || tx.category || 'Ăn uống',
    PERSON_EXCEL_MAP[tx.person] || tx.person || 'Chung',
    Number(tx.amount || 0),
    tx.source || 'VPBank'
  ]]);
  return { ok: true, sheet: sheetName, row: targetRow };
}

function scanRecentBankEmails(maxThreads) {
  const limit = maxThreads || 15;
  const query = '(from:vpbank OR from:bidv OR from:ncb OR from:uob OR "VPBank" OR "BIDV" OR "NCB" OR "biến động số dư" OR "Giao dịch thẻ") newer_than:30d';
  const threads = GmailApp.search(query, 0, limit);
  const blocks = [];

  for (let i = 0; i < threads.length; i++) {
    const msgs = threads[i].getMessages();
    const msg = msgs[msgs.length - 1];
    const sender = msg.getFrom();
    const subj = msg.getSubject();
    const dateStr = Utilities.formatDate(msg.getDate(), 'GMT+7', 'dd/MM/yyyy HH:mm');
    const body = msg.getPlainBody() || msg.getBody().replace(/<[^>]+>/g, ' ');
    blocks.push('From: ' + sender + '\nSubject: ' + subj + '\nDate: ' + dateStr + '\n' + body.substring(0, 1200));
  }
  return blocks.join('\n---\n');
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'pull';
    const ss = SpreadsheetApp.openById(SHEET_ID);

    if (action === 'scan_gmail') {
      const rawEmails = scanRecentBankEmails(15);
      return jsonResponse({ ok: true, raw_text: rawEmails });
    }

    const sh = getOrCreateCloudSheet(ss);
    const updatedAt = sh.getRange('A2').getValue();
    const rawState = sh.getRange('B2').getValue();
    let cloudState = null;
    if (rawState) {
      try { cloudState = JSON.parse(rawState); } catch (err) {}
    }

    return jsonResponse({
      ok: true,
      updated_at: updatedAt,
      cloud_state: cloudState
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const action = payload.action || 'sync';
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = getOrCreateCloudSheet(ss);
    const nowIso = new Date().toISOString();

    let appendedRows = [];
    if (payload.transaction) {
      appendedRows.push(appendTxToMonthSheet(ss, payload.transaction));
    }
    if (payload.transactions && Array.isArray(payload.transactions)) {
      for (let i = 0; i < payload.transactions.length; i++) {
        appendedRows.push(appendTxToMonthSheet(ss, payload.transactions[i]));
      }
    }

    if (payload.cloud_state) {
      sh.getRange('A2').setValue(nowIso);
      sh.getRange('B2').setValue(JSON.stringify(payload.cloud_state));
    }

    if (action === 'scan_gmail') {
      const rawEmails = scanRecentBankEmails(15);
      return jsonResponse({ ok: true, raw_text: rawEmails });
    }

    return jsonResponse({
      ok: true,
      updated_at: nowIso,
      appended: appendedRows
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}
