# 📊 Data Flow Diagram (DFD) — Hệ thống Quản lý Cho thuê SaaS

> Tài liệu mô tả luồng dữ liệu **toàn bộ hệ thống** `rental-saas-backend` (NestJS + MongoDB).
> Tuân theo quy ước **Gane-Sarson**, phân cấp: **Mức Context (ngữ cảnh) → Mức 0 (tiến trình chính) → Mức 1 (chi tiết luồng) → Mức 2 (chi tiết luồng con)**.

---

## 1. Ký hiệu (Notation)

| Hình | Ý nghĩa | Ghi chú |
|---|---|---|
| ⭕ **Hình tròn** | **Tiến trình xử lý (Process)** | Một chức năng xử lý dữ liệu |
| ▭ **Hình chữ nhật** | **Thực thể ngoài (External Entity)** | Người dùng / hệ thống bên ngoài |
| 🛢 **Hình trụ (Cylinder)** | **Kho dữ liệu (Data Store)** | `[( … )]` — shape database chuẩn của Mermaid |
| → **Mũi tên 1 chiều** | **Dòng dữ liệu (Data Flow)** | Nhãn là **danh từ** chỉ dữ liệu truyền đi |

```mermaid
flowchart LR
  classDef proc fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef ext fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef ds fill:#fff8e1,stroke:#b58900,color:#6b5400

  P(("Tiến trình xử lý")):::proc
  E["Thực thể ngoài"]:::ext
  D[("KHO DỮ LIỆU")]:::ds
  P -->|"Dòng dữ liệu (danh từ)"| D
  E --> P
```

> ✅ Toàn bộ sơ đồ dùng **Mermaid thuần** (không HTML) — tương thích draw.io, VS Code, GitHub, Mermaid Live.

---

## 2. Mức Context — Sơ đồ ngữ cảnh (Context Diagram)

Toàn hệ thống được xem như **một tiến trình duy nhất**, giao tiếp với các thực thể ngoài.

```mermaid
flowchart LR
  classDef proc fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef ext fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20

  OWNER["Chủ nhà"]
  STAFF["Nhân viên"]
  TENANT["Khách thuê"]
  ADMIN["Quản trị viên"]
  MOMO["MoMo"]
  VNPAY["VNPay"]
  TELEGRAM["Telegram Bot"]
  EMAIL["Email / SMTP"]
  OPENAI["OpenAI LLM"]
  R2["Cloudflare R2"]

  SYS(("Hệ thống Quản lý<br/>Cho thuê SaaS"))

  OWNER -->|"Thông tin đăng nhập"| SYS
  SYS -->|"Token truy cập & dữ liệu phản hồi"| OWNER
  OWNER -->|"Dữ liệu tòa nhà / phòng / khách / hóa đơn"| SYS
  STAFF -->|"Thông tin đăng nhập"| SYS
  SYS -->|"Token truy cập & dữ liệu phản hồi"| STAFF
  STAFF -->|"Dữ liệu quản lý"| SYS
  TENANT -->|"Thông tin đăng nhập khách thuê"| SYS
  SYS -->|"Hợp đồng / hóa đơn / xác nhận thanh toán"| TENANT
  TENANT -->|"Yêu cầu thanh toán hóa đơn"| SYS
  ADMIN -->|"Lệnh quản trị"| SYS
  SYS -->|"Thống kê & nhật ký kiểm toán"| ADMIN
  SYS -->|"Yêu cầu tạo thanh toán"| MOMO
  MOMO -->|"URL thanh toán"| SYS
  MOMO -->|"Thông báo IPN"| SYS
  SYS -->|"Yêu cầu tạo thanh toán"| VNPAY
  VNPAY -->|"URL thanh toán"| SYS
  VNPAY -->|"Thông báo IPN"| SYS
  SYS -->|"Tin nhắn thông báo"| TELEGRAM
  TELEGRAM -->|"Tin nhắn người dùng / webhook"| SYS
  SYS -->|"Email xác thực / OTP / hợp đồng / hóa đơn"| EMAIL
  SYS -->|"Prompt & lời gọi tool"| OPENAI
  OPENAI -->|"Phản hồi LLM"| SYS
  SYS -->|"File báo cáo Excel / PDF"| R2
  R2 -->|"File đã lưu trữ"| SYS

  class SYS proc
  class OWNER,STAFF,TENANT,ADMIN,MOMO,VNPAY,TELEGRAM,EMAIL,OPENAI,R2 ext
```

---

## 3. Mức 0 — Phân rã các tiến trình chính

Hệ thống được phân rã thành **9 tiến trình**, giao tiếp với **10 thực thể ngoài** và đọc/ghi **16 kho dữ liệu** (collection MongoDB).

```mermaid
flowchart LR
  classDef proc fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef ext fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef ds fill:#fff8e1,stroke:#b58900,color:#6b5400

  OWNER["Chủ nhà"]
  STAFF["Nhân viên"]
  TENANT["Khách thuê"]
  ADMIN["Quản trị viên"]
  MOMO["MoMo"]
  VNPAY["VNPay"]
  TELEGRAM["Telegram"]
  EMAIL["Email / SMTP"]
  OPENAI["OpenAI LLM"]
  R2["Cloudflare R2"]

  P1(("Xác thực &<br/>Tài khoản"))
  P2(("Quản lý<br/>Tòa nhà / Phòng"))
  P3(("Khách thuê &<br/>Hợp đồng"))
  P4(("Hóa đơn &<br/>Thanh toán"))
  P5(("Gói đăng ký &<br/>Quản trị"))
  P6(("Cổng thông tin<br/>Khách thuê"))
  P7(("AI Agent"))
  P8(("Báo cáo &<br/>Xuất file"))
  P9(("Thông báo &<br/>Định kỳ"))

  DS_USERS[("USERS")]
  DS_AUTH[("AUTH")]
  DS_OTPS[("OTPS")]
  DS_PROPERTIES[("PROPERTIES")]
  DS_ROOMS[("ROOMS")]
  DS_TENANTS[("TENANTS")]
  DS_CONTRACTS[("CONTRACTS")]
  DS_BILLS[("BILLS")]
  DS_PAYMENTS[("PAYMENTS")]
  DS_PAYSETTINGS[("PAYSETTINGS")]
  DS_SUBS[("SUBSCRIPTIONS")]
  DS_UPGRADES[("UPGRADES")]
  DS_BANKS[("BANKS")]
  DS_NOTIFS[("NOTIFS")]
  DS_AUDIT[("AUDIT")]
  DS_AI[("AI DATA")]

  OWNER -->|"Thông tin đăng nhập"| P1
  STAFF -->|"Thông tin đăng nhập"| P1
  P1 -->|"Token truy cập"| OWNER
  P1 -->|"Token truy cập"| STAFF
  OWNER -->|"Dữ liệu tòa nhà & phòng"| P2
  P2 -->|"Danh sách & trạng thái phòng"| OWNER
  OWNER -->|"Hồ sơ khách thuê"| P3
  P3 -->|"Hợp đồng & link Telegram"| OWNER
  OWNER -->|"Yêu cầu hóa đơn / thanh toán"| P4
  P4 -->|"Hóa đơn & lịch sử thanh toán"| OWNER
  OWNER -->|"Yêu cầu nâng cấp gói"| P5
  P5 -->|"Trạng thái gói & hạn mức"| OWNER
  OWNER -->|"Câu hỏi AI"| P7
  P7 -->|"Trả lời AI (SSE)"| OWNER
  OWNER -->|"Yêu cầu báo cáo / xuất file"| P8
  P8 -->|"Báo cáo & file tải xuống"| OWNER
  TENANT -->|"Đăng nhập / yêu cầu thanh toán"| P6
  P6 -->|"Hóa đơn & trạng thái thanh toán"| TENANT
  TENANT -->|"Token kích hoạt"| P3
  ADMIN -->|"Lệnh quản trị"| P5
  P5 -->|"Thống kê & nhật ký"| ADMIN
  TELEGRAM -->|"Tin nhắn webhook"| P9
  P9 -->|"Tin nhắn thông báo"| TELEGRAM
  P9 -->|"Email thông báo"| EMAIL

  P4 -->|"Yêu cầu tạo thanh toán (MoMo)"| MOMO
  MOMO -->|"URL thanh toán / IPN"| P4
  P4 -->|"Yêu cầu tạo thanh toán (VNPay)"| VNPAY
  VNPAY -->|"URL thanh toán / IPN"| P4
  P5 -->|"Thanh toán gói qua MoMo"| MOMO
  MOMO -->|"URL thanh toán gói / IPN"| P5

  P7 -->|"Prompt & lời gọi tool"| OPENAI
  OPENAI -->|"Phản hồi LLM"| P7
  P8 -->|"File báo cáo Excel / PDF"| R2
  R2 -->|"File đã lưu trữ"| P8

  P2 -->|"Trạng thái phòng OCCUPIED / AVAILABLE"| P3
  P6 -->|"Yêu cầu thanh toán hóa đơn"| P4
  P4 -->|"Kết quả thanh toán"| P6
  P1 -->|"Yêu cầu email OTP / xác thực"| P9
  P3 -->|"Yêu cầu email hợp đồng / kích hoạt"| P9
  P4 -->|"Yêu cầu email xác nhận / hóa đơn quá hạn"| P9
  P7 -->|"Kiểm tra hạn mức gói"| P5
  P4 -->|"Kiểm tra hạn mức gói"| P5

  P1 -->|"Hồ sơ người dùng / xác thực"| DS_USERS
  P1 -->|"Mã refresh token"| DS_AUTH
  P1 -->|"Mã OTP"| DS_OTPS
  P2 -->|"Dữ liệu tòa nhà"| DS_PROPERTIES
  P2 -->|"Dữ liệu phòng"| DS_ROOMS
  P3 -->|"Hồ sơ khách thuê"| DS_TENANTS
  P3 -->|"Hợp đồng"| DS_CONTRACTS
  P4 -->|"Hóa đơn"| DS_BILLS
  P4 -->|"Ghi nhận thanh toán"| DS_PAYMENTS
  P4 -->|"Cấu hình cổng thanh toán"| DS_PAYSETTINGS
  P4 -->|"Tài khoản ngân hàng VietQR"| DS_BANKS
  P5 -->|"Hồ sơ gói đăng ký"| DS_SUBS
  P5 -->|"Yêu cầu nâng cấp"| DS_UPGRADES
  P6 -->|"Hóa đơn theo hợp đồng"| DS_BILLS
  P7 -->|"Hội thoại / tin nhắn / dùng"| DS_AI
  P7 -->|"Hạn mức gói"| DS_SUBS
  P7 -->|"Nhật ký thực thi tool"| DS_AUDIT
  P7 -->|"Dữ liệu phòng (tool)"| DS_ROOMS
  P7 -->|"Hồ sơ khách thuê (tool)"| DS_TENANTS
  P7 -->|"Hợp đồng (tool)"| DS_CONTRACTS
  P7 -->|"Hóa đơn & doanh thu (tool)"| DS_BILLS
  P8 -->|"Dữ liệu báo cáo"| DS_BILLS
  P8 -->|"Dữ liệu thanh toán"| DS_PAYMENTS
  P8 -->|"Dữ liệu hợp đồng"| DS_CONTRACTS
  P8 -->|"Dữ liệu phòng"| DS_ROOMS
  P8 -->|"Dữ liệu khách thuê"| DS_TENANTS
  P8 -->|"Dữ liệu tòa nhà"| DS_PROPERTIES
  P9 -->|"Thông báo trong ứng dụng"| DS_NOTIFS
  P9 -->|"Nhật ký kiểm toán"| DS_AUDIT
  P9 -->|"Gói hết hạn → downgrade"| DS_SUBS
  P9 -->|"Hóa đơn tháng (định kỳ)"| DS_BILLS

  class OWNER,STAFF,TENANT,ADMIN,MOMO,VNPAY,TELEGRAM,EMAIL,OPENAI,R2 ext
  class P1,P2,P3,P4,P5,P6,P7,P8,P9 proc
  class DS_USERS,DS_AUTH,DS_OTPS,DS_PROPERTIES,DS_ROOMS,DS_TENANTS,DS_CONTRACTS,DS_BILLS,DS_PAYMENTS,DS_PAYSETTINGS,DS_SUBS,DS_UPGRADES,DS_BANKS,DS_NOTIFS,DS_AUDIT,DS_AI ds
```

> 📌 **Kho dữ liệu**: `USERS`, `AUTH`, `OTPS`, `PROPERTIES`, `ROOMS`, `TENANTS`, `CONTRACTS`, `BILLS`, `PAYMENTS`, `PAYSETTINGS`, `SUBSCRIPTIONS`, `UPGRADES`, `BANKS`, `NOTIFS`, `AUDIT`, `AI DATA`.

---
## 4. Mức 1 — Chi tiết luồng quan trọng

### 4.1 Xác thực & Tài khoản

```mermaid
flowchart TB
  classDef proc fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef ext fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef ds fill:#fff8e1,stroke:#b58900,color:#6b5400

  OWNER["Chủ nhà"]
  EMAIL["Email / SMTP"]
  DS_USERS[("USERS")]
  DS_AUTH[("AUTH<br/>(refresh token)")]
  DS_OTPS[("OTPS")]
  DS_SUBS[("SUBSCRIPTIONS")]

  A1(("Đăng ký"))
  A2(("Đăng nhập"))
  A3(("Làm mới token"))
  A4(("Quên / Đổi<br/>mật khẩu"))
  A5(("Xác thực<br/>email"))
  A6(("Tạo gói FREE<br/>& trial"))

  OWNER -->|"Email & mật khẩu"| A1
  A1 -->|"Hồ sơ người dùng mới"| DS_USERS
  A1 -->|"Email OTP đăng ký"| EMAIL
  OWNER -->|"Mã OTP"| A1
  A1 -->|"Token truy cập & mã refresh"| OWNER
  A1 -->|"Yêu cầu tạo gói miễn phí"| A6
  A6 -->|"Hồ sơ gói FREE / trial"| DS_SUBS

  OWNER -->|"Email & mật khẩu"| A2
  A2 -->|"Thông tin xác thực"| DS_USERS
  A2 -->|"Mã refresh token"| DS_AUTH
  A2 -->|"Token truy cập & mã refresh"| OWNER

  OWNER -->|"Mã refresh token"| A3
  A3 -->|"Mã refresh đã lưu"| DS_AUTH
  A3 -->|"Cặp token mới"| OWNER

  OWNER -->|"Yêu cầu OTP quên / đổi mật khẩu"| A4
  A4 -->|"Email OTP"| EMAIL
  OWNER -->|"Mã OTP & mật khẩu mới"| A4
  A4 -->|"Mật khẩu đã băm"| DS_USERS

  OWNER -->|"Token xác thực email"| A5
  A5 -->|"Trạng thái xác thực"| DS_USERS
  A5 -->|"Kết quả xác thực"| OWNER

  class OWNER ext
  class EMAIL ext
  class A1,A2,A3,A4,A5,A6 proc
  class DS_USERS,DS_AUTH,DS_OTPS,DS_SUBS ds
```

### 4.2 Hợp đồng & Kích hoạt khách thuê

```mermaid
flowchart TB
  classDef proc fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef ext fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef ds fill:#fff8e1,stroke:#b58900,color:#6b5400

  OWNER["Chủ nhà"]
  TENANT["Khách thuê"]
  EMAIL["Email / SMTP"]
  DS_ROOMS[("ROOMS")]
  DS_TENANTS[("TENANTS")]
  DS_CONTRACTS[("CONTRACTS")]

  C1(("Tạo hợp đồng"))
  C2(("Kích hoạt<br/>khách thuê"))
  C3(("Kết thúc<br/>hợp đồng"))
  C4(("Đổi mật khẩu<br/>lần đầu"))

  OWNER -->|"Chọn phòng & khách thuê"| C1
  C1 -->|"Kiểm tra phòng khả dụng"| DS_ROOMS
  C1 -->|"Hồ sơ khách thuê"| DS_TENANTS
  C1 -->|"Hợp đồng mới (ACTIVE)"| DS_CONTRACTS
  C1 -->|"Trạng thái phòng OCCUPIED"| DS_ROOMS
  C1 -->|"Email hợp đồng & link kích hoạt"| EMAIL

  TENANT -->|"Token kích hoạt"| C2
  C2 -->|"Xác nhận hồ sơ khách thuê"| DS_TENANTS
  C2 -->|"Mật khẩu khởi tạo & trạng thái kích hoạt"| DS_TENANTS
  C2 -->|"Thông tin tài khoản đã kích hoạt"| TENANT

  TENANT -->|"Mật khẩu mới"| C4
  C4 -->|"Cờ phải đổi mật khẩu (mustChangePassword)"| DS_TENANTS

  OWNER -->|"Lệnh kết thúc hợp đồng"| C3
  C3 -->|"Trạng thái hợp đồng TERMINATED"| DS_CONTRACTS
  C3 -->|"Trạng thái phòng AVAILABLE"| DS_ROOMS

  class OWNER,TENANT ext
  class EMAIL ext
  class C1,C2,C3,C4 proc
  class DS_ROOMS,DS_TENANTS,DS_CONTRACTS ds
```

### 4.3 Hóa đơn & Thanh toán (MoMo / VNPay / VietQR / IPN)

```mermaid
flowchart TB
  classDef proc fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef ext fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef ds fill:#fff8e1,stroke:#b58900,color:#6b5400

  OWNER["Chủ nhà"]
  TENANT["Khách thuê"]
  MOMO["MoMo"]
  VNPAY["VNPay"]
  EMAIL["Email / SMTP"]
  DS_BILLS[("BILLS")]
  DS_CONTRACTS[("CONTRACTS")]
  DS_PAYMENTS[("PAYMENTS")]
  DS_PAYSETTINGS[("PAYMENT SETTINGS<br/>(mã hóa)")]
  DS_BANKS[("BANK ACCOUNTS")]

  B1(("Tạo / cập nhật<br/>hóa đơn"))
  B2(("Ghi nhận thanh toán<br/>trực tiếp"))
  B3(("Thanh toán<br/>MoMo"))
  B4(("Thanh toán<br/>VNPay"))
  B5(("Thanh toán<br/>VietQR"))
  B6(("Xử lý IPN"))
  B7(("Sinh hóa đơn<br/>định kỳ"))

  OWNER -->|"Số điện / nước / phí mới"| B1
  B1 -->|"Giá phòng từ hợp đồng"| DS_CONTRACTS
  B1 -->|"Hóa đơn tháng"| DS_BILLS

  OWNER -->|"Ghi nhận tiền mặt / chuyển khoản"| B2
  B2 -->|"Ghi nhận thanh toán"| DS_PAYMENTS
  B2 -->|"Số tiền đã trả & trạng thái hóa đơn"| DS_BILLS
  B2 -->|"Email xác nhận thanh toán"| EMAIL

  TENANT -->|"Yêu cầu thanh toán MoMo"| B3
  B3 -->|"Cấu hình MoMo (mã hóa)"| DS_PAYSETTINGS
  B3 -->|"Số tiền còn nợ của hóa đơn"| DS_BILLS
  B3 -->|"Yêu cầu tạo thanh toán"| MOMO
  MOMO -->|"URL thanh toán"| B3
  B3 -->|"URL thanh toán MoMo"| TENANT

  TENANT -->|"Yêu cầu thanh toán VNPay"| B4
  B4 -->|"Cấu hình VNPay (mã hóa)"| DS_PAYSETTINGS
  B4 -->|"Số tiền còn nợ của hóa đơn"| DS_BILLS
  B4 -->|"Yêu cầu tạo thanh toán"| VNPAY
  VNPAY -->|"URL thanh toán"| B4
  B4 -->|"URL thanh toán VNPay"| TENANT

  TENANT -->|"Quét mã VietQR"| B5
  B5 -->|"Tài khoản ngân hàng mặc định"| DS_BANKS
  B5 -->|"Số tiền còn nợ của hóa đơn"| DS_BILLS
  B5 -->|"Mã VietQR"| TENANT

  MOMO -->|"Thông báo IPN"| B6
  VNPAY -->|"Thông báo IPN"| B6
  B6 -->|"Chữ ký cấu hình cổng thanh toán"| DS_PAYSETTINGS
  B6 -->|"Ghi nhận thanh toán (transactionId)"| DS_PAYMENTS
  B6 -->|"Cập nhật số tiền đã trả & trạng thái"| DS_BILLS
  B6 -->|"Kết quả xác nhận IPN"| MOMO
  B6 -->|"Kết quả xác nhận IPN"| VNPAY

  B7 -->|"Hợp đồng đang hoạt động"| DS_CONTRACTS
  B7 -->|"Hóa đơn tháng mới"| DS_BILLS

  class OWNER,TENANT ext
  class MOMO,VNPAY ext
  class EMAIL ext
  class B1,B2,B3,B4,B5,B6,B7 proc
  class DS_BILLS,DS_CONTRACTS,DS_PAYMENTS,DS_PAYSETTINGS,DS_BANKS ds
```

### 4.4 Gói đăng ký & Nâng cấp

```mermaid
flowchart TB
  classDef proc fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef ext fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef ds fill:#fff8e1,stroke:#b58900,color:#6b5400

  OWNER["Chủ nhà"]
  ADMIN["Quản trị viên"]
  MOMO["MoMo"]
  DS_SUBS[("SUBSCRIPTIONS")]
  DS_UPGRADES[("UPGRADE REQUESTS")]
  DS_PAYSETTINGS[("PAYMENT SETTINGS<br/>(mã hóa)")]
  DS_PROPERTIES[("PROPERTIES")]
  DS_ROOMS[("ROOMS")]
  DS_USERS[("USERS")]

  S1(("Kiểm tra gói & hạn mức"))
  S2(("Yêu cầu nâng cấp"))
  S3(("Thanh toán nâng cấp<br/>qua MoMo"))
  S4(("Xử lý IPN<br/>nâng cấp"))
  S5(("Quản trị viên<br/>kích hoạt gói"))
  S6(("Định kỳ hết hạn<br/>gói"))

  OWNER -->|"Yêu cầu xem gói & hạn mức"| S1
  S1 -->|"Hồ sơ gói đăng ký"| DS_SUBS
  S1 -->|"Số lượng tòa nhà / phòng / nhân viên"| DS_PROPERTIES
  S1 -->|"Số lượng tòa nhà / phòng / nhân viên"| DS_ROOMS
  S1 -->|"Số lượng tòa nhà / phòng / nhân viên"| DS_USERS
  S1 -->|"Hạn mức & danh sách tính năng"| OWNER

  OWNER -->|"Yêu cầu nâng cấp gói"| S2
  S2 -->|"Gói hiện tại của chủ trọ"| DS_SUBS
  S2 -->|"Yêu cầu nâng cấp PENDING"| DS_UPGRADES

  OWNER -->|"Thanh toán gói qua MoMo"| S3
  S3 -->|"Cấu hình MoMo của admin (mã hóa)"| DS_PAYSETTINGS
  S3 -->|"Yêu cầu tạo thanh toán gói"| MOMO
  MOMO -->|"URL thanh toán"| S3
  S3 -->|"URL thanh toán MoMo"| OWNER

  MOMO -->|"Thông báo IPN gói"| S4
  S4 -->|"Chữ ký cấu hình MoMo"| DS_PAYSETTINGS
  S4 -->|"Kích hoạt gói (plan & số tháng)"| DS_SUBS
  S4 -->|"Cập nhật yêu cầu APPROVED"| DS_UPGRADES

  ADMIN -->|"Lệnh kích hoạt gói"| S5
  S5 -->|"Hồ sơ gói đăng ký"| DS_SUBS
  S5 -->|"Cập nhật cấu hình MoMo admin"| DS_PAYSETTINGS

  S6 -->|"Gói hết hạn / kết thúc trial"| DS_SUBS
  S6 -->|"Downgrade về gói FREE"| DS_SUBS

  class OWNER,ADMIN ext
  class MOMO ext
  class S1,S2,S3,S4,S5,S6 proc
  class DS_SUBS,DS_UPGRADES,DS_PAYSETTINGS,DS_PROPERTIES,DS_ROOMS,DS_USERS ds
```

### 4.5 AI Agent (LLM + Tool Execution)

```mermaid
flowchart TB
  classDef proc fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef ext fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef ds fill:#fff8e1,stroke:#b58900,color:#6b5400

  OWNER["Chủ nhà"]
  OPENAI["OpenAI LLM"]
  DS_AI[("AI DATA<br/>(hội thoại / dùng)")]
  DS_SUBS[("SUBSCRIPTIONS")]
  DS_ROOMS[("ROOMS")]
  DS_TENANTS[("TENANTS")]
  DS_CONTRACTS[("CONTRACTS")]
  DS_BILLS[("BILLS")]
  DS_AUDIT[("AUDIT LOGS")]

  I1(("Quản lý<br/>hội thoại"))
  I2(("Vòng lặp Agent"))
  I3(("Thực thi<br/>tool"))
  I4(("Theo dõi<br/>hạn mức AI"))

  OWNER -->|"Câu hỏi / lời nhắn"| I1
  I1 -->|"Hội thoại & tin nhắn"| DS_AI
  OWNER -->|"Tin nhắn mới"| I2
  I2 -->|"Lịch sử hội thoại"| DS_AI
  I2 -->|"Kiểm tra hạn mức"| I4
  I4 -->|"Gói đăng ký & hạn mức AI"| DS_SUBS
  I4 -->|"Lượt dùng AI đã ghi nhận"| DS_AI
  I2 -->|"Prompt & lời gọi tool"| OPENAI
  OPENAI -->|"Phản hồi LLM / lời gọi tool"| I2
  I2 -->|"Lệnh thực thi tool"| I3
  I3 -->|"Dữ liệu phòng"| DS_ROOMS
  I3 -->|"Hồ sơ khách thuê"| DS_TENANTS
  I3 -->|"Hợp đồng"| DS_CONTRACTS
  I3 -->|"Hóa đơn & doanh thu"| DS_BILLS
  I3 -->|"Phòng / khách / hóa đơn mới (tool ghi)"| DS_ROOMS
  I3 -->|"Phòng / khách / hóa đơn mới (tool ghi)"| DS_TENANTS
  I3 -->|"Phòng / khách / hóa đơn mới (tool ghi)"| DS_BILLS
  I3 -->|"Nhật ký thực thi tool"| DS_AUDIT
  I2 -->|"Trả lời AI (SSE)"| OWNER

  class OWNER ext
  class OPENAI ext
  class I1,I2,I3,I4 proc
  class DS_AI,DS_SUBS,DS_ROOMS,DS_TENANTS,DS_CONTRACTS,DS_BILLS,DS_AUDIT ds
```

### 4.6 Cổng thông tin Khách thuê

```mermaid
flowchart TB
  classDef proc fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef ext fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef ds fill:#fff8e1,stroke:#b58900,color:#6b5400

  TENANT["Khách thuê"]
  MOMO["MoMo"]
  VNPAY["VNPay"]
  DS_TENANTS[("TENANTS")]
  DS_CONTRACTS[("CONTRACTS")]
  DS_BILLS[("BILLS")]
  DS_PAYMENTS[("PAYMENTS")]
  DS_PAYSETTINGS[("PAYMENT SETTINGS<br/>(mã hóa)")]

  T1(("Đăng nhập<br/>khách thuê"))
  T2(("Xem hóa đơn &<br/>lịch sử thanh toán"))
  T3(("Thanh toán<br/>hóa đơn"))

  TENANT -->|"Thông tin đăng nhập"| T1
  T1 -->|"Hồ sơ khách thuê"| DS_TENANTS
  T1 -->|"Token truy cập khách thuê"| TENANT
  TENANT -->|"Yêu cầu danh sách hóa đơn"| T2
  T2 -->|"Hợp đồng của khách thuê"| DS_CONTRACTS
  T2 -->|"Hóa đơn theo hợp đồng"| DS_BILLS
  T2 -->|"Lịch sử thanh toán"| DS_PAYMENTS
  T2 -->|"Hóa đơn & trạng thái thanh toán"| TENANT
  TENANT -->|"Yêu cầu thanh toán hóa đơn"| T3
  T3 -->|"Danh sách phương thức thanh toán khả dụng"| DS_PAYSETTINGS
  T3 -->|"Yêu cầu tạo thanh toán MoMo / VNPay"| MOMO
  T3 -->|"Yêu cầu tạo thanh toán MoMo / VNPay"| VNPAY
  MOMO -->|"URL thanh toán"| T3
  VNPAY -->|"URL thanh toán"| T3
  T3 -->|"URL thanh toán"| TENANT

  class TENANT ext
  class MOMO,VNPAY ext
  class T1,T2,T3 proc
  class DS_TENANTS,DS_CONTRACTS,DS_BILLS,DS_PAYMENTS,DS_PAYSETTINGS ds
```

---

## 5. Mức 2 — Chi tiết luồng con

### 5.1 Luồng Đăng ký & Đăng nhập (OTP + Token)

```mermaid
flowchart TB
  classDef proc fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef ext fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef ds fill:#fff8e1,stroke:#b58900,color:#6b5400

  OWNER["Chủ nhà"]
  EMAIL["Email / SMTP"]
  DS_OTPS[("OTPS")]
  DS_USERS[("USERS")]
  DS_AUTH[("AUTH<br/>(refresh token)")]
  DS_SUBS[("SUBSCRIPTIONS")]

  R1(("Nhận yêu cầu<br/>đăng ký"))
  R2(("Xác minh OTP<br/>đăng ký"))
  R3(("Tạo gói<br/>FREE / trial"))
  L1(("Đăng nhập"))
  L2(("Làm mới<br/>token"))

  OWNER -->|"Email, mật khẩu, họ tên"| R1
  R1 -->|"Mã OTP đăng ký (5 phút)"| DS_OTPS
  R1 -->|"Email chứa mã OTP"| EMAIL
  OWNER -->|"Mã OTP + email"| R2
  R2 -->|"Mã OTP hợp lệ"| DS_OTPS
  R2 -->|"Xóa mã OTP đã dùng"| DS_OTPS
  R2 -->|"Hồ sơ người dùng mới (emailVerified)"| DS_USERS
  R2 -->|"Yêu cầu tạo gói miễn phí"| R3
  R3 -->|"Hồ sơ gói FREE / trial 14 ngày"| DS_SUBS
  R2 -->|"Token truy cập & mã refresh"| OWNER

  OWNER -->|"Email & mật khẩu"| L1
  L1 -->|"Thông tin xác thực (kèm mật khẩu băm)"| DS_USERS
  L1 -->|"Mã refresh token"| DS_AUTH
  L1 -->|"Token truy cập & mã refresh"| OWNER

  OWNER -->|"Mã refresh token"| L2
  L2 -->|"Mã refresh chưa thu hồi & còn hạn"| DS_AUTH
  L2 -->|"Thu hồi mã refresh cũ"| DS_AUTH
  L2 -->|"Cặp token mới"| OWNER

  class OWNER ext
  class EMAIL ext
  class R1,R2,R3,L1,L2 proc
  class DS_OTPS,DS_USERS,DS_AUTH,DS_SUBS ds
```

### 5.2 Luồng Thanh toán hóa đơn qua MoMo (tạo + IPN)

```mermaid
flowchart TB
  classDef proc fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef ext fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef ds fill:#fff8e1,stroke:#b58900,color:#6b5400

  TENANT["Khách thuê"]
  MOMO["MoMo"]
  DS_BILLS[("BILLS")]
  DS_PAYSETTINGS[("PAYMENT SETTINGS<br/>(mã hóa)")]
  DS_PAYMENTS[("PAYMENTS")]

  M1(("Tạo yêu cầu<br/>thanh toán MoMo"))
  M2(("Xử lý IPN<br/>MoMo"))

  TENANT -->|"Yêu cầu thanh toán hóa đơn"| M1
  M1 -->|"Hóa đơn còn nợ (chưa PAID)"| DS_BILLS
  M1 -->|"Cấu hình MoMo của chủ trọ (giải mã)"| DS_PAYSETTINGS
  M1 -->|"Yêu cầu tạo thanh toán (orderId = billId + thời gian)"| MOMO
  MOMO -->|"payUrl / deeplink / QR"| M1
  M1 -->|"URL thanh toán MoMo"| TENANT

  MOMO -->|"Thông báo IPN (orderId, transId, resultCode)"| M2
  M2 -->|"Cấu hình theo partnerCode (giải mã)"| DS_PAYSETTINGS
  M2 -->|"Kiểm tra trùng transId"| DS_PAYMENTS
  M2 -->|"Ghi nhận thanh toán (transactionId)"| DS_PAYMENTS
  M2 -->|"Cập nhật paidAmount & trạng thái hóa đơn"| DS_BILLS
  M2 -->|"Kết quả xác nhận IPN"| MOMO

  class TENANT ext
  class MOMO ext
  class M1,M2 proc
  class DS_BILLS,DS_PAYSETTINGS,DS_PAYMENTS ds
```

### 5.3 Luồng Thanh toán hóa đơn qua VNPay (tạo + IPN + return)

```mermaid
flowchart TB
  classDef proc fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef ext fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef ds fill:#fff8e1,stroke:#b58900,color:#6b5400

  TENANT["Khách thuê"]
  VNPAY["VNPay"]
  DS_BILLS[("BILLS")]
  DS_PAYSETTINGS[("PAYMENT SETTINGS<br/>(mã hóa)")]
  DS_PAYMENTS[("PAYMENTS")]

  V1(("Tạo URL thanh toán<br/>VNPay"))
  V2(("Xử lý IPN<br/>VNPay"))
  V3(("Xác nhận kết quả<br/>(return)"))

  TENANT -->|"Yêu cầu thanh toán hóa đơn"| V1
  V1 -->|"Hóa đơn còn nợ"| DS_BILLS
  V1 -->|"Cấu hình VNPay (giải mã hashSecret)"| DS_PAYSETTINGS
  V1 -->|"Yêu cầu tạo thanh toán (vnp_TxnRef, secureHash)"| VNPAY
  VNPAY -->|"URL thanh toán"| V1
  V1 -->|"URL thanh toán VNPay"| TENANT

  VNPAY -->|"Thông báo IPN (vnp_ResponseCode, vnp_TransactionNo)"| V2
  V2 -->|"Tìm cấu hình theo vnp_TmnCode"| DS_PAYSETTINGS
  V2 -->|"Kiểm tra trùng transactionId"| DS_PAYMENTS
  V2 -->|"Ghi nhận thanh toán (vnpay + transactionNo)"| DS_PAYMENTS
  V2 -->|"Cập nhật paidAmount & trạng thái hóa đơn"| DS_BILLS
  V2 -->|"Kết quả xác nhận (RspCode)"| VNPAY

  TENANT -->|"Quay lại sau thanh toán"| V3
  V3 -->|"Xác minh vnp_SecureHash"| DS_PAYSETTINGS
  V3 -->|"Kết quả thanh toán"| TENANT

  class TENANT ext
  class VNPAY ext
  class V1,V2,V3 proc
  class DS_BILLS,DS_PAYSETTINGS,DS_PAYMENTS ds
```

### 5.4 Luồng Nâng cấp gói qua MoMo (tạo + IPN)

```mermaid
flowchart TB
  classDef proc fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef ext fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef ds fill:#fff8e1,stroke:#b58900,color:#6b5400

  OWNER["Chủ nhà"]
  MOMO["MoMo"]
  DS_SUBS[("SUBSCRIPTIONS")]
  DS_UPGRADES[("UPGRADE REQUESTS")]
  DS_PAYSETTINGS[("PAYMENT SETTINGS<br/>(mã hóa)")]

  U1(("Tạo thanh toán<br/>nâng cấp gói"))
  U2(("Xử lý IPN<br/>nâng cấp gói"))
  U3(("Kích hoạt<br/>gói"))

  OWNER -->|"Yêu cầu nâng cấp (plan, months)"| U1
  U1 -->|"Giá & gói hiện tại"| DS_SUBS
  U1 -->|"Cấu hình MoMo của admin (giải mã)"| DS_PAYSETTINGS
  U1 -->|"Yêu cầu tạo thanh toán (orderId = sub + owner + plan + months)"| MOMO
  MOMO -->|"payUrl"| U1
  U1 -->|"URL thanh toán"| OWNER
  U1 -->|"Yêu cầu nâng cấp PENDING"| DS_UPGRADES

  MOMO -->|"Thông báo IPN gói"| U2
  U2 -->|"Xác minh chữ ký (cấu hình admin)"| DS_PAYSETTINGS
  U2 -->|"Yêu cầu kích hoạt gói"| U3
  U3 -->|"Kích hoạt gói (plan & số tháng)"| DS_SUBS
  U3 -->|"Cập nhật yêu cầu APPROVED"| DS_UPGRADES

  class OWNER ext
  class MOMO ext
  class U1,U2,U3 proc
  class DS_SUBS,DS_UPGRADES,DS_PAYSETTINGS ds
```

### 5.5 Vòng lặp AI Agent & Thực thi tool

```mermaid
flowchart TB
  classDef proc fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef ext fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef ds fill:#fff8e1,stroke:#b58900,color:#6b5400

  OWNER["Chủ nhà"]
  OPENAI["OpenAI LLM"]
  DS_AI[("AI DATA<br/>(hội thoại / dùng)")]
  DS_SUBS[("SUBSCRIPTIONS")]
  DS_AUDIT[("AUDIT LOGS")]
  DS_ROOMS[("ROOMS")]
  DS_TENANTS[("TENANTS")]
  DS_CONTRACTS[("CONTRACTS")]
  DS_BILLS[("BILLS")]

  A1(("Phân tích<br/>yêu cầu"))
  A2(("Gọi LLM"))
  A3(("Thực thi<br/>tool"))
  A4(("Ghi nhận<br/>lượt dùng"))
  A5(("Tạo câu trả lời"))

  OWNER -->|"Tin nhắn mới"| A1
  A1 -->|"Kiểm tra hạn mức gói"| DS_SUBS
  A1 -->|"Lưu tin nhắn người dùng"| DS_AI
  A1 -->|"Lịch sử hội thoại"| DS_AI
  A1 -->|"Prompt & tool definitions"| A2
  A2 -->|"Prompt & tool definitions"| OPENAI
  OPENAI -->|"Phản hồi / lời gọi tool"| A2
  A2 -->|"Lệnh thực thi tool"| A3
  A3 -->|"Dữ liệu phòng"| DS_ROOMS
  A3 -->|"Hồ sơ khách thuê"| DS_TENANTS
  A3 -->|"Hợp đồng"| DS_CONTRACTS
  A3 -->|"Hóa đơn & doanh thu"| DS_BILLS
  A3 -->|"Nhật ký thực thi tool"| DS_AUDIT
  A3 -->|"Kết quả tool"| A2
  A2 -->|"Kết quả tool (chuỗi tra cứu)"| OPENAI
  A2 -->|"Kết quả cuối"| A5
  A5 -->|"Lưu câu trả lời"| DS_AI
  A5 -->|"Trả lời AI (SSE)"| OWNER
  A2 -->|"Lượt dùng & token"| A4
  A4 -->|"Ghi nhận lượt dùng AI"| DS_AI

  class OWNER ext
  class OPENAI ext
  class A1,A2,A3,A4,A5 proc
  class DS_AI,DS_SUBS,DS_AUDIT,DS_ROOMS,DS_TENANTS,DS_CONTRACTS,DS_BILLS ds
```

---

## 6. Ánh xạ DFD → Module / Collection

| DFD | Nhóm module | Collection MongoDB |
|---|---|---|
| P1 — Xác thực & Tài khoản | `auth`, `users`, `tenant-auth` | `users`, `auth` (refresh token), `otps`, `tenanttokens` |
| P2 — Tòa nhà / Phòng | `properties`, `rooms` | `properties`, `rooms` |
| P3 — Khách thuê & Hợp đồng | `tenants`, `contracts` | `tenants`, `contracts` |
| P4 — Hóa đơn & Thanh toán | `bills`, `payments`, `momo`, `vnpay`, `bank-accounts`, `payment-settings` | `bills`, `payments`, `paymentsettings`, `bankaccounts` |
| P5 — Gói đăng ký & Quản trị | `subscription`, `admin`, `onboarding` | `subscriptions`, `upgraderequests` |
| P6 — Cổng thông tin Khách thuê | `tenant-portal` | — (đọc qua `bills`, `payments`) |
| P7 — AI Agent | `ai-agent` | `conversations`, `messages`, `toolexecutions`, `aiusages` |
| P8 — Báo cáo & Xuất file | `report`, `analytics`, `invoice` | (đọc tổng hợp + file trên R2) |
| P9 — Thông báo & Định kỳ | `telegram`, `mail`, `notifications`, `cron`, `audit` | `notifications`, `auditlogs` |
