# 🗄️ Entity-Relationship Diagram (ERD) — Hệ thống Quản lý Cho thuê SaaS

> ERD mô tả các **thực thể (collection MongoDB)** và **quan hệ** của `rental-saas-backend`.
> Do hệ thống có 20 thực thể, ERD được tách thành **5 nhóm** để dễ đọc — mỗi nhóm tự chứa (USER lặp lại làm trung tâm).
> Dùng **Mermaid thuần** (`erDiagram`) — tương thích draw.io, VS Code, GitHub, Mermaid Live.

---

## 1. Ký hiệu quan hệ (Crow's Foot)

| Ký hiệu | Ý nghĩa |
|---|---|
| `\|` `\|\|` | Đúng một (exactly one) |
| `o` | Không hoặc một (zero or one) |
| `{` | Không hoặc nhiều (zero or many) |
| `}` | Một hoặc nhiều (one or many) |

Ví dụ: `USER \|\|--o{ BILL : "sở hữu"` = **1 user có 0..n hóa đơn**.

---

## 2. ERD theo nhóm

### 2.1 Xác thực & Tài khoản

```mermaid
erDiagram
  USER ||--o{ REFRESH_TOKEN : "sở hữu"
  USER ||--o{ TENANT_TOKEN : "phát hành"

  USER {
    ObjectId _id PK
    string email UK "unique"
    string password "băm bcrypt"
    string fullName
    string phone
    string role "owner | staff | admin"
    ObjectId ownerId FK "self nếu là owner; owner thật nếu là staff"
    boolean isActive
    boolean emailVerified
    string telegramChatId
    boolean isOnboardingComplete
  }

  REFRESH_TOKEN {
    ObjectId _id PK
    string token UK
    ObjectId userId FK
    Date expiresAt "TTL index"
    boolean isRevoked
  }

  OTP {
    ObjectId _id PK
    string email UK "theo email"
    string code
    string type "register | change-password | forgot-password | tenant-forgot-password"
    Object payload "dữ liệu tạm"
    Date expiresAt "TTL index"
    int attempts
  }

  TENANT_TOKEN {
    ObjectId _id PK
    string token UK
    ObjectId tenantId FK
    ObjectId ownerId FK
    Date expiresAt "TTL index"
    Date usedAt
  }
```

### 2.2 BĐS — Khách thuê — Hợp đồng

```mermaid
erDiagram
  USER ||--o{ PROPERTY : "sở hữu"
  USER ||--o{ ROOM : "sở hữu"
  USER ||--o{ TENANT : "sở hữu"
  USER ||--o{ CONTRACT : "sở hữu"
  PROPERTY ||--o{ ROOM : "gồm"
  ROOM ||--o{ CONTRACT : "có"
  TENANT ||--o{ CONTRACT : "ký"

  USER {
    ObjectId _id PK
    string email UK "unique"
    string password "băm bcrypt"
    string fullName
    string phone
    string role "owner | staff | admin"
    ObjectId ownerId FK
    boolean isActive
    boolean emailVerified
    string telegramChatId
    boolean isOnboardingComplete
  }

  PROPERTY {
    ObjectId _id PK
    string name
    string address
    string description
    ObjectId ownerId FK
  }

  ROOM {
    ObjectId _id PK
    string name
    number price
    number area
    string status "available | occupied | maintenance | ..."
    string description
    ObjectId propertyId FK
    ObjectId ownerId FK
  }

  TENANT {
    ObjectId _id PK
    string fullName
    string email UK "unique theo owner (sparse)"
    string password "mật khẩu khởi tạo"
    boolean isActivated
    string activationToken
    Date activationTokenExpiresAt
    boolean mustChangePassword "đổi mật khẩu lần đầu"
    string phone
    string identityCard UK "unique theo owner"
    string address
    Date dob
    ObjectId ownerId FK
    string telegramChatId
    Date telegramLinkedAt
  }

  CONTRACT {
    ObjectId _id PK
    ObjectId roomId FK
    ObjectId tenantId FK
    Date startDate
    Date endDate
    number deposit
    number rentPrice
    string status "active | terminated"
    ObjectId ownerId FK "unique active/room"
  }
```

### 2.3 Hóa đơn & Thanh toán

```mermaid
erDiagram
  USER ||--o{ CONTRACT : "sở hữu"
  USER ||--o{ BILL : "sở hữu"
  USER ||--o{ PAYMENT : "sở hữu"
  USER ||--o{ BANK_ACCOUNT : "sở hữu"
  CONTRACT ||--o{ BILL : "phát sinh"
  BILL ||--o{ PAYMENT : "được thanh toán"

  USER {
    ObjectId _id PK
    string email UK "unique"
    string password "băm bcrypt"
    string fullName
    string phone
    string role "owner | staff | admin"
    ObjectId ownerId FK
    boolean isActive
    boolean emailVerified
    string telegramChatId
    boolean isOnboardingComplete
  }

  CONTRACT {
    ObjectId _id PK
    ObjectId roomId FK
    ObjectId tenantId FK
    Date startDate
    Date endDate
    number deposit
    number rentPrice
    string status "active | terminated"
    ObjectId ownerId FK "unique active/room"
  }

  BILL {
    ObjectId _id PK
    ObjectId contractId FK "unique contract+month+year"
    ObjectId roomId FK
    ObjectId tenantId FK "optional"
    int month
    int year
    number electricOldIndex
    number electricNewIndex
    number electricRate
    number electricCost
    number waterOldIndex
    number waterNewIndex
    number waterRate
    number waterCost
    number roomPrice
    number otherFee
    number totalAmount
    number paidAmount
    string status "unpaid | partial | paid"
    ObjectId ownerId FK
    Date dueDate
  }

  PAYMENT {
    ObjectId _id PK
    ObjectId billId FK
    number amount
    string method "cash | momo | vnpay | ..."
    string note
    string transactionId UK "chống trùng IPN (sparse)"
    string status "success | ..."
    ObjectId ownerId FK
  }

  BANK_ACCOUNT {
    ObjectId _id PK
    ObjectId ownerId FK
    string bankCode
    string bankName
    string bankBin
    string accountNumber
    string accountName
    boolean isDefault
  }
```

### 2.4 Gói đăng ký — Cấu hình — Hệ thống

```mermaid
erDiagram
  USER ||--|| SUBSCRIPTION : "đăng ký"
  USER ||--|| PAYMENT_SETTINGS : "cấu hình"
  USER ||--o{ UPGRADE_REQUEST : "yêu cầu"
  USER ||--o{ NOTIFICATION : "nhận"
  USER ||--o{ AUDIT_LOG : "phát sinh"

  USER {
    ObjectId _id PK
    string email UK "unique"
    string password "băm bcrypt"
    string fullName
    string phone
    string role "owner | staff | admin"
    ObjectId ownerId FK
    boolean isActive
    boolean emailVerified
    string telegramChatId
    boolean isOnboardingComplete
  }

  SUBSCRIPTION {
    ObjectId _id PK
    ObjectId ownerId FK "unique (1-1)"
    string plan "free | basic | pro"
    string status "active | trial | expired | cancelled"
    Date trialEndsAt
    Date currentPeriodStart
    Date currentPeriodEnd
    int roomLimit
    int propertyLimit
    int staffLimit
    array features "danh sách tính năng"
  }

  UPGRADE_REQUEST {
    ObjectId _id PK
    ObjectId ownerId FK
    string fromPlan
    string toPlan
    int months
    number amount "giá gói x số tháng"
    string paymentMethod "momo | bank_transfer"
    string status "pending | approved | rejected"
    string notes
  }

  PAYMENT_SETTINGS {
    ObjectId _id PK
    ObjectId ownerId FK "unique (1-1)"
    string provider "MOMO | VNPAY"
    string momoPartnerCode
    Object momoAccessKey "AES-256-GCM mã hóa"
    Object momoSecretKey "AES-256-GCM mã hóa"
    string vnpayTmnCode
    Object vnpayHashSecret "AES-256-GCM mã hóa"
    string environment "sandbox | production"
    boolean isActive
  }

  NOTIFICATION {
    ObjectId _id PK
    ObjectId ownerId FK
    string type "NEW_BILL | BILL_DUE | PAYMENT_RECEIVED | CONTRACT_EXPIRING | INFO"
    string title
    string message
    boolean isRead
    string link
  }

  AUDIT_LOG {
    ObjectId _id PK
    string action "CREATE | UPDATE | DELETE | RESTORE"
    string entity "Bill | Payment | Contract | ..."
    ObjectId entityId
    ObjectId userId FK "người thao tác"
    ObjectId ownerId FK
    Object changes "snapshot response"
    string ipAddress
    string userAgent
  }
```

### 2.5 AI Agent

```mermaid
erDiagram
  USER ||--o{ CONVERSATION : "hội thoại"
  USER ||--o{ TOOL_EXECUTION : "thực thi"
  USER ||--o{ AI_USAGE : "dùng AI"
  CONVERSATION ||--o{ MESSAGE : "chứa"
  CONVERSATION ||--o{ TOOL_EXECUTION : "chạy"

  USER {
    ObjectId _id PK
    string email UK "unique"
    string password "băm bcrypt"
    string fullName
    string phone
    string role "owner | staff | admin"
    ObjectId ownerId FK
    boolean isActive
    boolean emailVerified
    string telegramChatId
    boolean isOnboardingComplete
  }

  CONVERSATION {
    ObjectId _id PK
    ObjectId ownerId FK
    string title
    string status "active | archived (TTL 90 ngày)"
    Object metadata
  }

  MESSAGE {
    ObjectId _id PK
    ObjectId conversationId FK
    string role "user | assistant | system | tool"
    string content
    Object toolCall "toolName + arguments + result"
    int promptTokens
    int completionTokens
  }

  TOOL_EXECUTION {
    ObjectId _id PK
    ObjectId ownerId FK
    ObjectId conversationId FK
    string toolName "getRoomStatus | addRoom | ..."
    Object input
    Object output
    string status "success | error | denied"
    string errorMessage
    int executionTimeMs
    array accessedResources
  }

  AI_USAGE {
    ObjectId _id PK
    ObjectId ownerId FK
    string period "YYYY-MM (unique owner+period)"
    int totalRequests
    int totalPromptTokens
    int totalCompletionTokens
    number estimatedCostUsd
    int toolCallCount
    Object modelBreakdown
  }
```

---

## 3. Ánh xạ Thực thể → Collection MongoDB

| Thực thể | Collection | Nhóm |
|---|---|---|
| USER | `users` | — (trung tâm) |
| REFRESH_TOKEN | `auth` (refresh tokens) | 2.1 |
| OTP | `otps` | 2.1 |
| TENANT_TOKEN | `tenanttokens` | 2.1 |
| PROPERTY | `properties` | 2.2 |
| ROOM | `rooms` | 2.2 |
| TENANT | `tenants` | 2.2 |
| CONTRACT | `contracts` | 2.2 / 2.3 |
| BILL | `bills` (soft-delete) | 2.3 |
| PAYMENT | `payments` (soft-delete) | 2.3 |
| BANK_ACCOUNT | `bankaccounts` | 2.3 |
| SUBSCRIPTION | `subscriptions` | 2.4 |
| UPGRADE_REQUEST | `upgraderequests` | 2.4 |
| PAYMENT_SETTINGS | `paymentsettings` | 2.4 |
| NOTIFICATION | `notifications` | 2.4 |
| AUDIT_LOG | `auditlogs` | 2.4 |
| CONVERSATION | `conversations` | 2.5 |
| MESSAGE | `messages` | 2.5 |
| TOOL_EXECUTION | `toolexecutions` | 2.5 |
| AI_USAGE | `aiusages` | 2.5 |

> **Ghi chú:**
> - Quan hệ `USER → USER` (nhân viên thuộc chủ trọ qua `ownerId`) không thể hiện trên sơ đồ do `erDiagram` không hỗ trợ self-reference đẹp — xem cột `ownerId FK` của `USER`.
> - Mỗi diagram nhóm chỉ vẽ quan hệ **trong nhóm**; các FK trỏ sang thực thể nhóm khác vẫn hiển thị dưới dạng cột (VD: `BILL.roomId` → ROOM ở nhóm 2.2).
