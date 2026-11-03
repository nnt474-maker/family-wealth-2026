# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Chồng (CK) và Vợ (VK) trong gia đình trẻ tại Việt Nam cùng 2 con nhỏ (Subo và Sugi). Truy cập hàng ngày trên điện thoại (PWA) và máy tính để ghi chép chi tiêu nhanh, kiểm soát ngân sách 10 hạng mục gia đình, đối soát biến động số dư qua email ngân hàng và theo dõi danh mục đầu tư cổ phiếu tích sản (DCA).

## Product Purpose

Sổ cái tài chính và tích sản gia đình (Family Wealth Ledger 2026) giúp hai vợ chồng minh bạch dòng tiền thu-chi thực tế theo từng tháng (T1–T12), cảnh báo vượt trần ngân sách sớm, tự động hóa bóc tách giao dịch từ giọng nói/văn bản tự nhiên hoặc email ngân hàng (Shinhan, Vietcombank, NCB, MoMo, ZaloPay), và duy trì kỷ luật đầu tư DCA cổ phiếu hàng tháng (MBB, SSI, HPG, FPT).

## Positioning

Khác với các ứng dụng quản lý chi tiêu cá nhân đại trà, Family Wealth 2026 được thiết kế riêng cho cấu trúc tài chính hộ gia đình Việt Nam: gắn kết chặt chẽ 4 đối tượng (Chồng, Vợ, Subo, Sugi), kết hợp sổ thu-chi gia đình với quỹ tích sản chứng khoán (DCA 18 triệu/tháng + Quỹ bắt đáy cổ tức), và đồng bộ 4 chiều (Web, PWA, Server Python nội bộ, Google Sheet Cloud).

## Operating Context

- Ghi nhanh chi tiêu bằng câu lệnh tiếng Việt tự nhiên ("ăn sáng 50k", "học phí subo 5.5tr", "tiền điện 1.2tr 15/11") hoặc giọng nói ngay khi phát sinh giao dịch.
- Cuối ngày hoặc cuối tuần: quét hòm thư ngân hàng của Chồng & Vợ để đối soát giao dịch thẻ/chuyển khoản.
- Hàng tháng (T1–T12): nhập thu nhập thực tế (Lương CK, Lương VK, Phụ cấp, Cho thuê), kiểm tra phân bổ 50/30/20 và ghi nhận lệnh khớp DCA cổ phiếu theo giá thị trường Vietcap/Simplize.

## Capabilities and Constraints

- 6 không gian làm việc chính: Tổng quan (Dashboard), Sổ giao dịch (Transactions), Đọc Email Ngân hàng (Email Sync), Danh mục Đầu tư (Investment DCA), Cố vấn AI (Claude/Gemini), và Kiểm toán Dữ liệu (Audit).
- Toàn bộ giao diện, nhãn, đơn vị tiền tệ (`đ`, `triệu`) bằng tiếng Việt rõ ràng, chính xác tuyệt đối tới từng đồng.
- Hoạt động mượt mà trên cả màn hình máy tính (1440px/1280px) và điện thoại (390px) không cần framework nặng (Vanilla HTML/CSS/JS + Python Local Server + Google Apps Script Cloud).

## Evidence on Hand

- Dữ liệu thực tế trong `app/data/family_db.json`: 888 giao dịch thực tế của gia đình từ Tháng 1 đến Tháng 10/2026, danh mục cổ phiếu thực (MBB, SSI, HPG, FPT), cấu trúc thu nhập và ngân sách 10 nhóm.

## Product Principles

1. Con số là trung tâm: Mọi con số tiền tệ đều dùng `tabular-nums`, căn phải trong bảng, tổng khớp tuyệt đối với từng dòng thành phần.
2. Không trang trí thừa ("No AI Slop"): Không dùng dải màu tím/indigo công nghiệp, không lạm dụng emoji lòe loẹt, không đổ bóng phát sáng (glow) hay viền màu dày bên cạnh thẻ.
3. Tốc độ thao tác 1 chạm: Việc chuyển tháng (T1–T12), thêm giao dịch, sửa trực tiếp trên dòng (inline edit) và khởi tạo tháng mới luôn nằm ngay trong tầm tay.
