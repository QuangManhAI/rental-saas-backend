# Activity & Sequence Diagram — TV3 (Toàn) + TV5 (Thắng)

> Bản nháp **Mermaid** (8 sơ đồ: mỗi thành viên 02 Activity + 02 Sequence) — dùng để render ở
> [mermaid.live](https://mermaid.live) / VS Code / GitHub trước khi chuyển sang `.drawio` + ảnh nộp.
> Người vẽ nháp: **TV7 (Mạnh)**, đối chiếu với `doc/CLASSDIAGRAM.md` và code backend.

**Cách đọc:** Activity = `flowchart` với **swimlane** (mỗi actor/hệ thống một làn); Sequence = `sequenceDiagram`
với lifeline theo đúng danh sách *"Đối tượng tham gia"* trong bảng phân công. Mỗi đối tượng xử lý (UI/bộ điều khiển/dịch
vụ/kho) có **thanh kích hoạt** (`activate`/`deactivate`) trên lifeline thể hiện khoảng thời gian nó "sống" khi xử lý.
Dưới mỗi hình có dòng **Khớp code** ghi chú chỗ mô hình bảng phân công **lệch** với backend hiện tại, để chủ sở hữu
(TV3/TV5) tự quyết khi vẽ chính thức.

---

# TV3 (Toàn) — Gói 3: Người dùng, nhân viên và thông báo

## Hình TV3-1 · Activity Diagram — Tạo và quản lý tài khoản nhân viên (Cặp 01)

3 swimlane: **Nhân viên chính**, **Hệ thống**, **Quản trị viên**. Sau quyết định **"Loại thao tác?"** luồng tách thành
nhánh *tạo nhân viên phụ* và nhánh *khóa / kích hoạt lại tài khoản*. Nhánh khóa có **fork/join** vô hiệu hóa phiên đăng
nhập song song với cập nhật nhân viên phụ trực thuộc.

```mermaid
flowchart LR
  subgraph NV["“Nhân viên chính”"]
    direction TB
    nv_start(("Bắt đầu"))
    nv_act{"Loại thao tác?"}
    nv_create["Chọn “Tạo nhân viên phụ”"]
    nv_form["Nhập email, mật khẩu, họ tên, số điện thoại"]
    nv_ok["Hiển thị “Tạo nhân viên thành công”"]
    nv_err["Hiển thị thông báo lỗi"]
  end

  subgraph HT["“Hệ thống”"]
    direction TB
    ht_limit["Kiểm tra giới hạn nhân viên theo gói<br/>checkStaffLimit(ownerId)"]
    ht_limit_d{"Đủ chỉ tiêu gói?"}
    ht_dup["Kiểm tra email trùng"]
    ht_dup_d{"Email đã tồn tại?"}
    ht_hash["Băm mật khẩu bcrypt (12 vòng)"]
    ht_save["Tạo tài khoản<br/>role = STAFF · ownerId · isActive = true"]
    ht_audit1["Ghi nhật ký kiểm toán<br/>“Tạo nhân viên”"]
    ht_lock_d{"Khóa hay kích hoạt lại?"}
    ht_session["Vô hiệu hóa phiên đăng nhập<br/>isActive = false · thu hồi token"]:::fork
    ht_subord["Cập nhật nhân viên phụ trực thuộc<br/>của tài khoản bị khóa"]:::fork
    ht_join(["join"]):::join
    ht_unlock["Đặt isActive = true<br/>khôi phục đăng nhập"]
    ht_audit2["Ghi nhật ký kiểm toán<br/>“Khóa / kích hoạt lại”"]:::join
    ht_err1["Trả lỗi vượt giới hạn gói"]
    ht_err2["Trả lỗi 409 — email đã tồn tại"]
  end

  subgraph QT["“Quản trị viên”"]
    direction TB
    qt_pick["Chọn tài khoản cần khóa / kích hoạt lại"]
    qt_reason["Chọn lý do & xác nhận"]
    qt_ok["Hiển thị kết quả cho Quản trị viên"]
  end

  nv_start --> nv_act
  nv_act --|Tạo nhân viên phụ|--> nv_create --> nv_form
  nv_form --> ht_limit --> ht_limit_d
  ht_limit_d --|Không|--> ht_err1 --> nv_err
  ht_limit_d --|Có|--> ht_dup --> ht_dup_d
  ht_dup_d --|Có|--> ht_err2 --> nv_err
  ht_dup_d --|Không|--> ht_hash --> ht_save --> ht_audit1 --> nv_ok

  nv_act --|Khóa / kích hoạt lại|--> qt_pick --> qt_reason --> ht_lock_d
  ht_lock_d --|Khóa|--> ht_session
  ht_lock_d --|Khóa|--> ht_subord
  ht_session --> ht_join
  ht_subord --> ht_join
  ht_lock_d --|Kích hoạt lại|--> ht_unlock --> ht_audit2
  ht_join --> ht_audit2 --> qt_ok
```

> **Khớp code:** backend chỉ cho `OWNER` tạo `STAFF` qua `POST /users` (guard `@Roles(Role.OWNER)`) — khái niệm
> *"Nhân viên chính"* của bảng phân công chưa có trong code (xem điểm rà soát **b**, CLASSDIAGRAM §10). Kiểm tra gói
> = `SubscriptionService.checkStaffLimit()` (trả 402 nếu vượt); trùng email bị khoá unique index → global filter trả **409**.
> **Fork/join "cập nhật nhân viên phụ trực thuộc" và nhật ký kiểm toán cho /users hiện chưa có trong code** — nếu giữ
> theo đúng mô tả bảng phân công thì Toàn cần thêm; nếu vẽ đúng code thì bỏ 2 ô đó (chỉ còn `isActive = false`).

## Hình TV3-2 · Sequence Diagram — Tạo và quản lý tài khoản nhân viên (Cặp 01)

Đối tượng tham gia (theo bảng phân công): **giao diện quản lý người dùng · bộ điều khiển người dùng · dịch vụ tài khoản ·
kho tài khoản · nhật ký kiểm toán**. Có `alt` cho thông tin liên hệ đã tồn tại, `alt` cho vi phạm quy tắc khóa và `loop`
cập nhật nhân viên phụ trực thuộc.

```mermaid
sequenceDiagram
  actor NV as Nhân viên chính
  actor QT as Quản trị viên
  participant UI as Giao diện quản lý người dùng
  participant CT as Bộ điều khiển người dùng<br/>(UsersController)
  participant SV as Dịch vụ tài khoản<br/>(UsersService)
  participant GOI as Dịch vụ gói đăng ký<br/>(SubscriptionService)
  participant KHO as Kho tài khoản (users)
  participant LOG as Nhật ký kiểm toán

  rect rgb(240, 248, 255)
  Note over NV,LOG: Nhánh 1 — Tạo nhân viên phụ
  NV->>UI: Nhập email/mật khẩu/họ tên/số điện thoại, bấm "Tạo"
  activate UI
  UI->>CT: POST /users
  activate CT
  CT->>GOI: checkStaffLimit(ownerId)
  activate GOI
  GOI-->>CT: số lượng STAFF hiện tại / giới hạn gói
  deactivate GOI
  alt Vượt giới hạn nhân viên của gói
    CT-->>UI: 402 — vượt giới hạn gói
    UI-->>NV: Hiển thị lỗi
  else Trong giới hạn
    CT->>SV: create(createUserDto, owner)
    activate SV
    SV->>KHO: Tìm user theo email
    activate KHO
    alt Email đã tồn tại (thông tin liên hệ trùng)
      KHO-->>SV: user trùng
      SV-->>CT: lỗi trùng (unique index → 409)
      CT-->>UI: 409 — email đã được sử dụng
      UI-->>NV: Hiển thị lỗi
    else Email mới
      SV->>SV: bcrypt.hash(password, 12)
      SV->>KHO: Lưu user { role: STAFF, ownerId, isActive: true }
      KHO-->>SV: user đã lưu (ẩn password)
      deactivate KHO
      SV->>LOG: Ghi nhật ký "Tạo nhân viên"  %% theo bảng phân công
      SV-->>CT: trả user
      deactivate SV
      CT-->>UI: 201 — tạo thành công
      deactivate CT
      UI-->>NV: Hiển thị "Tạo nhân viên thành công"
      deactivate UI
    end
  end
  end

  rect rgb(255, 250, 240)
  Note over QT,LOG: Nhánh 2 — Khóa / kích hoạt lại tài khoản
  QT->>UI: Chọn tài khoản nhân viên + chọn "Khóa" (kèm lý do)
  activate UI
  UI->>CT: PATCH /users/:id { isActive: false }
  activate CT
  CT->>SV: update(id, { isActive }, owner)
  activate SV
  SV->>KHO: Tìm user theo { _id, ownerId }
  activate KHO
  alt Vi phạm quy tắc khóa (không thuộc quyền / đã khóa / tài khoản gốc)
    KHO-->>SV: không tìm thấy hoặc không hợp lệ
    SV-->>CT: 404 / 400 — vi phạm quy tắc khóa
    CT-->>UI: Hiển thị lỗi
  else Hợp lệ
    loop Cập nhật nhân viên phụ trực thuộc  %% theo bảng phân công
      SV->>KHO: Cập nhật trạng thái nhân viên cấp dưới
    end
    SV->>KHO: isActive = false (thu hồi hiệu lực phiên)
    KHO-->>SV: đã cập nhật
    deactivate KHO
    SV->>LOG: Ghi nhật ký "Khóa tài khoản"  %% theo bảng phân công
    SV-->>CT: 200 — khóa thành công
    deactivate SV
    CT-->>UI: Trả kết quả
    deactivate CT
    UI-->>QT: Hiển thị "Đã khóa tài khoản"
    deactivate UI
  end
  end
```

> **Khớp code:** như trên — `KHO` + `GOI` + `SV` tồn tại; **`LOG` và `loop` nhân viên trực thuộc không có trên route
> /users** (AuditInterceptor chỉ gắn ở bills/payments/contracts). Giữ hay bỏ tuỳ Toàn chốt theo bảng phân công.

## Hình TV3-3 · Activity Diagram — Tạo và gửi thông báo tới nhân viên (Cặp 02)

3 swimlane: **Nhân viên chính**, **Hệ thống**, **Nhân viên**. Luồng: soạn nội dung → lọc người nhận → lưu nháp →
phát hành → gửi theo kênh → cập nhật trạng thái đã đọc → nhắc lại nhóm chưa đọc.

```mermaid
flowchart LR
  subgraph NV2["“Nhân viên chính”"]
    direction TB
    n2_start(("Bắt đầu"))
    n2_compose["Soạn nội dung thông báo<br/>tiêu đề + nội dung + kênh gửi"]
    n2_filter["Chọn / lọc danh sách người nhận<br/>(Nhân viên trực thuộc)"]
    n2_save["Lưu nháp hoặc bấm “Phát hành”"]
    n2_recheck{"Kiểm tra lại<br/>người nhận hợp lệ?"}
    n2_publish["Nhấn “Gửi thông báo”"]
    n2_done["Hiển thị “Đã gửi” cho Nhân viên chính"]
    n2_nobody["Thông báo: không còn người nhận hợp lệ"]
  end

  subgraph HT2["“Hệ thống”"]
    direction TB
    ht2_valid["Lọc người nhận còn hiệu lực<br/>(đang hoạt động, chưa gửi trùng)"]
    ht2_store["Lưu bản ghi thông báo<br/>cho từng người nhận · trạng thái = CHƯA ĐỌC"]
    ht2_send["Gửi theo kênh<br/>(trong app / email / Telegram)"]
    ht2_pending{"Lưu nháp hay phát hành?"}
    ht2_remind["Nhắc lại nhóm chưa đọc<br/>theo lịch hẹn"]
  end

  subgraph NVSTAFF["“Nhân viên (người nhận)”"]
    direction TB
    st_open["Mở hộp thư thông báo"]
    st_read["Đọc nội dung"]
    st_mark["Đánh dấu “Đã đọc”"]
  end

  n2_start --> n2_compose --> n2_filter --> ht2_valid --> ht2_valid_d{Còn người nhận hợp lệ?}
  ht2_valid_d --|Không|--> n2_nobody
  ht2_valid_d --|Có|--> n2_save --> ht2_pending
  ht2_pending --|Lưu nháp|--> n2_done
  ht2_pending --|Phát hành|--> n2_publish --> ht2_store --> ht2_send
  ht2_send --> st_open --> st_read --> st_mark
  st_mark --> ht2_mark[Cập nhật trạng thái ĐÃ ĐỌC<br/>cho người nhận]:::sys
  ht2_send --> ht2_remind
  ht2_remind --> n2_done
```

> **Khớp code:** module thông báo backend hiện **chỉ có đọc / đánh dấu đã đọc** (`GET /notifications`,
> `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`), **chưa có endpoint soạn/phát hành/gửi** — thông báo
> thực tế được sinh bởi cron/sự kiện và đẩy qua Telegram/email. Vì vậy Hình TV3-3/4 mô tả đúng **Use Case tạo thông báo**
> của bảng phân công nhưng chưa có bên code; Toàn cần đánh dấu rõ đây là luồng đề xuất.

## Hình TV3-4 · Sequence Diagram — Tạo và gửi thông báo tới nhân viên (Cặp 02)

Đối tượng tham gia (theo bảng phân công): **giao diện thông báo · bộ điều khiển thông báo · dịch vụ thông báo ·
kho thông báo · Nhân viên**. Có `opt` phát hành, `alt` không còn người nhận hợp lệ, `loop` gửi cho từng người nhận và
`opt` nhắc lại.

```mermaid
sequenceDiagram
  actor NVC as Nhân viên chính
  participant UIB as Giao diện thông báo
  participant CTB as Bộ điều khiển thông báo<br/>(NotificationsController)
  participant SVB as Dịch vụ thông báo<br/>(NotificationsService)
  participant KHOB as Kho thông báo (notifications)
  actor NV2 as Nhân viên (người nhận)

  NVC->>UIB: Soạn tiêu đề + nội dung, chọn kênh
  NVC->>UIB: Chọn / lọc người nhận (Nhân viên trực thuộc)
  activate UIB
  UIB->>CTB: (đề xuất) POST /notifications { nội dung, danh sách người nhận }
  activate CTB
  CTB->>SVB: taoThongBao(dto)
  activate SVB
  SVB->>SVB: Lọc người nhận còn hiệu lực
  alt Không còn người nhận hợp lệ
    SVB-->>CTB: trả lỗi "không có người nhận hợp lệ"
    CTB-->>UIB: hiển thị thông báo lỗi
    UIB-->>NVC: Thấy cảnh báo "không còn người nhận hợp lệ"
  else Có người nhận hợp lệ
    opt Phát hành (không phải lưu nháp)
      loop Gửi cho từng người nhận
        SVB->>KHOB: Lưu thông báo { người nhận, CHƯA ĐỌC }
        SVB->>NV2: Đẩy thông báo theo kênh (trong app / email / Telegram)
      end
      SVB-->>CTB: hoàn tất phát hành
      deactivate SVB
      CTB-->>UIB: 201 — đã gửi
      deactivate CTB
      UIB-->>NVC: Hiển thị "Đã gửi"
      deactivate UIB
    end
  end

  rect rgb(245, 245, 245)
  Note over NVC,NV2: Phía người nhận (đọc & đánh dấu)
  NV2->>UIB: Mở hộp thư thông báo
  activate UIB
  UIB->>CTB: GET /notifications
  activate CTB
  CTB->>SVB: findByOwner(owner)
  activate SVB
  SVB-->>CTB: danh sách thông báo (kèm isRead)
  deactivate SVB
  CTB-->>UIB: trả danh sách
  deactivate CTB
  UIB-->>NV2: Hiển thị danh sách
  deactivate UIB
  NV2->>UIB: Bấm "Đã đọc" trên 1 thông báo / "Đọc tất cả"
  activate UIB
  UIB->>CTB: PATCH /notifications/:id/read (hoặc /read-all)
  activate CTB
  CTB->>SVB: markRead(id, owner)
  activate SVB
  SVB->>KHOB: cập nhật isRead = true
  activate KHOB
  KHOB-->>SVB: đã cập nhật
  deactivate KHOB
  SVB-->>CTB: 200
  deactivate SVB
  CTB-->>UIB: trả kết quả
  deactivate CTB
  deactivate UIB
  opt Nhắc lại nhóm chưa đọc
    SVB->>NV2: Gửi lời nhắc cho người nhận còn CHƯA ĐỌC
  end
  end
```

> **Khớp code:** phần đọc/đánh dấu đã đọc đúng code; phần **soạn/phát hành/loop gửi/nhắc lại là đề xuất** theo Use Case
> (chưa có endpoint tạo thông báo ở backend hiện tại).

---

---

# TV5 (Thắng) — Gói 5: Khách thuê và hợp đồng

## Hình TV5-1 · Activity Diagram — Tiếp nhận và cập nhật hồ sơ khách thuê (Cặp 01)

Các Use Case quản lý khách thuê. Làn: **Nhân viên**, **Hệ thống**, **Khách thuê**.

```mermaid
flowchart LR
  subgraph NV3["“Nhân viên”"]
    direction TB
    k1_start(("Bắt đầu"))
    k1_choose{"Tiếp nhận khách mới<br/>hay cập nhật hồ sơ?"}
    k1_new["Chọn “Thêm khách thuê mới”"]
    k1_form["Nhập họ tên, số điện thoại, CCCD/CMND,<br/>email (tùy chọn), địa chỉ, ngày sinh"]
    k1_edit["Chọn hồ sơ khách đang thuê / cũ"]
    k1_fix["Sửa thông tin liên hệ: tên, sđt, CCCD, email"]
    k1_ok["Hiển thị “Lưu hồ sơ khách thuê thành công”"]
    k1_err["Hiển thị thông báo lỗi"]
    k1_resend["Nhấn “Gửi lại email kích hoạt” (nếu khách chưa kích hoạt)"]
  end

  subgraph HT3["“Hệ thống”"]
    direction TB
    ht3_valid["Kiểm tra định dạng:<br/>sđt 9–15 số · CCCD ≥ 9 ký tự · email hợp lệ"]
    ht3_dup["Kiểm tra trùng lặp trong phạm vi chủ trọ"]
    ht3_dup_d{"identityCard hoặc email<br/>đã tồn tại?"}
    ht3_token["Sinh activationToken (24 giờ)"]
    ht3_save["Lưu hồ sơ khách thuê<br/>isActivated = false"]
    ht3_resend_d{"Khách đã kích hoạt?"}
    ht3_mail["Gửi email kèm link kích hoạt"]
    ht3_upd["Cập nhật hồ sơ"]
  end

  subgraph KH["“Khách thuê”"]
    direction TB
    kh_link["Nhận email chứa link kích hoạt"]
    kh_open["Mở link, đặt mật khẩu lần đầu"]
    kh_done["Tài khoản kích hoạt — đăng nhập cổng khách thuê"]
  end

  k1_start --> k1_choose
  k1_choose --|Khách mới|--> k1_new --> k1_form --> ht3_valid --> ht3_dup --> ht3_dup_d
  ht3_dup_d --|Có|--> k1_err
  ht3_dup_d --|Không|--> ht3_token --> ht3_save --> k1_ok
  k1_choose --|Cập nhật hồ sơ|--> k1_edit --> k1_fix --> ht3_valid --> ht3_upd --> k1_ok
  k1_ok --> k1_resend
  k1_resend --> ht3_resend_d
  ht3_resend_d --|Chưa kích hoạt|--> ht3_mail --> kh_link --> kh_open --> kh_done
  ht3_resend_d --|Đã kích hoạt|--> k1_err
```

> **Khớp code:** `POST /tenants` yêu cầu `fullName`, `phone` (9–15 số), `identityCard` (≥9 ký tự), `email` tùy chọn;
> unique **`(ownerId, identityCard)`** và sparse unique **`(ownerId, email)`** → vi phạm trả 409. Backend sinh
> `activationToken` khi tạo nhưng **chưa tự gửi email**; email kích hoạt được gửi khi bấm
> `POST /tenants/:id/resend-activation` **hoặc khi lập hợp đồng** (xem TV5-3). Khách thuê **không tự sửa hồ sơ** — mọi
> cập nhật do Nhân viên thực hiện (`PATCH /tenants/:id`).

## Hình TV5-2 · Sequence Diagram — Tiếp nhận và cập nhật hồ sơ khách thuê (Cặp 01)

Đối tượng tham gia (theo bảng phân công): **giao diện khách thuê · bộ điều khiển khách thuê · dịch vụ khách thuê ·
kho hồ sơ khách thuê**.

```mermaid
sequenceDiagram
  actor NV3 as Nhân viên
  participant UIK as Giao diện khách thuê
  participant CTK as Bộ điều khiển khách thuê<br/>(TenantsController)
  participant SVK as Dịch vụ khách thuê<br/>(TenantsService)
  participant KHOK as Kho hồ sơ khách thuê (tenants)
  actor KHK as Khách thuê

  rect rgb(240, 248, 255)
  Note over NV3,KHOK: Tiếp nhận khách thuê mới
  NV3->>UIK: Bấm "Thêm khách thuê"
  NV3->>UIK: Nhập họ tên/sđt/CCCD/email (tuỳ chọn)
  activate UIK
  UIK->>CTK: POST /tenants
  activate CTK
  CTK->>SVK: create(dto, user)
  activate SVK
  SVK->>KHOK: Tìm theo (ownerId, identityCard) / (ownerId, email)
  activate KHOK
  alt Đã tồn tại identityCard hoặc email
    KHOK-->>SVK: bản ghi trùng
    SVK-->>CTK: lỗi trùng lặp (409)
    CTK-->>UIK: Hiển thị lỗi
  else Hợp lệ
    SVK->>SVK: Sinh activationToken (hết hạn 24 giờ)
    SVK->>KHOK: Lưu { fullName, phone, identityCard, email?, isActivated:false }
    KHOK-->>SVK: tenant đã lưu
    deactivate KHOK
    SVK-->>CTK: 201 — trả hồ sơ
    deactivate SVK
    CTK-->>UIK: trả kết quả
    deactivate CTK
    UIK-->>NV3: Hiển thị "Đã lưu hồ sơ khách thuê"
    deactivate UIK
  end
  end

  rect rgb(255, 250, 240)
  Note over NV3,KHK: Cập nhật hồ sơ
  NV3->>UIK: Chọn hồ sơ khách, sửa thông tin
  activate UIK
  UIK->>CTK: PATCH /tenants/:id
  activate CTK
  CTK->>SVK: update(id, dto, user)
  activate SVK
  SVK->>KHOK: Tìm theo { _id, ownerId }
  activate KHOK
  SVK->>KHOK: Cập nhật thông tin (kiểm tra trùng nếu đổi CCCD/email)
  KHOK-->>SVK: đã cập nhật
  deactivate KHOK
  SVK-->>CTK: 200 — trả hồ sơ mới
  deactivate SVK
  CTK-->>UIK: trả kết quả
  deactivate CTK
  UIK-->>NV3: Hiển thị "Cập nhật thành công"
  deactivate UIK
  end

  rect rgb(245, 245, 245)
  Note over NV3,KHK: Gửi lại email kích hoạt (khi cần)
  NV3->>UIK: Bấm "Gửi lại email kích hoạt"
  activate UIK
  UIK->>CTK: POST /tenants/:id/resend-activation
  activate CTK
  CTK->>SVK: resendActivation(id, user)
  activate SVK
  SVK->>KHOK: Kiểm tra hồ sơ
  activate KHOK
  alt Khách đã kích hoạt
    KHOK-->>SVK: isActivated = true
    SVK-->>CTK: thông báo "Tài khoản đã được kích hoạt"
  else Chưa kích hoạt
    SVK->>KHOK: Sinh activationToken mới (24 giờ)
    SVK-->>KHK: Gửi email chứa link kích hoạt
    deactivate KHOK
    deactivate SVK
    deactivate CTK
    deactivate UIK
    Note over KHK: Khách mở link, đặt mật khẩu → kích hoạt tài khoản
  end
  end
```

> **Khớp code:** đúng luồng trên. Kích hoạt lần đầu được xử lý ở `TenantAuthController`
> (`POST /tenant-auth/activate` → đặt mật khẩu; sau đó `change-initial-password` nếu bắt buộc đổi) — thuộc phần Thắng
> có thể tách riêng hoặc mô tả ngắn trong ghi chú.

## Hình TV5-3 · Activity Diagram — Lập, phê duyệt và kết thúc hợp đồng thuê (Cặp 02)

Các Use Case quản lý hợp đồng. **Điểm cần lưu ý của bảng phân công:** luồng hợp đồng phải thể hiện kiểm tra **phòng,
khách thuê, giá thuê, kỳ hạn, tiền cọc** và **cập nhật trạng thái phòng**. Làn: **Nhân viên**, **Hệ thống**, **Khách thuê**.

```mermaid
flowchart LR
  subgraph NV4["“Nhân viên”"]
    direction TB
    h1_start(("Bắt đầu"))
    h1_pick["Chọn phòng trống + chọn khách thuê"]
    h1_terms["Nhập giá thuê, kỳ hạn (ngày bắt đầu/kết thúc),<br/>tiền cọc, các điều khoản"]
    h1_review["Xem lại & xác nhận (phê duyệt nội bộ)"]
    h1_ok["Hiển thị “Lập hợp đồng thành công”"]
    h1_err["Hiển thị thông báo lỗi"]
    h1_term2["Chọn hợp đồng đang hiệu lực · bấm “Kết thúc hợp đồng”"]
    h1_term_ok["Hiển thị “Đã kết thúc hợp đồng”"]
  end

  subgraph HT4["“Hệ thống”"]
    direction TB
    ht4_tenant["Kiểm tra khách thuê thuộc chủ trọ"]
    ht4_room["Kiểm tra phòng thuộc chủ trọ"]
    ht4_room_d{"Phòng còn trống<br/>(AVAILABLE)?"}
    ht4_confl{"Đang có hợp đồng<br/>ACTIVE cho phòng?"}
    ht4_heal["Đánh dấu phòng OCCUPIED<br/>— báo “dữ liệu không nhất quán, tải lại”"]
    ht4_txn["Tạo hợp đồng (transaction)<br/>status = ACTIVE"]
    ht4_room_occ["Cập nhật phòng → OCCUPIED"]
    ht4_mail{"Khách đã kích hoạt tài khoản?"}
    ht4_email1["Gửi email hợp đồng"]
    ht4_email2["Gửi email hợp đồng + link kích hoạt<br/>(activationToken 7 ngày)"]
    ht4_term_check{"Kiểm tra hợp đồng<br/>đang ACTIVE?"}
    ht4_term["Tạo bản ghi kết thúc<br/>status = TERMINATED · endDate = hôm nay"]
    ht4_room_avail["Cập nhật phòng → AVAILABLE"]
  end

  subgraph KH2["“Khách thuê”"]
    direction TB
    kh2_mail["Nhận email hợp đồng"]
    kh2_act["Nếu chưa kích hoạt:<br/>mở link, đặt mật khẩu"]
  end

  h1_start --> h1_pick --> h1_terms --> h1_review --> ht4_tenant --> ht4_room --> ht4_room_d
  ht4_room_d --|Không trống|--> h1_err
  ht4_room_d --|Trống|--> ht4_confl
  ht4_confl --|Có hợp đồng ACTIVE nhưng phòng AVAILABLE|--> ht4_heal --> h1_err
  ht4_confl --|Không xung đột|--> ht4_txn --> ht4_room_occ --> ht4_mail
  ht4_mail --|Đã kích hoạt|--> ht4_email1 --> kh2_mail --> h1_ok
  ht4_mail --|Chưa kích hoạt|--> ht4_email2 --> kh2_mail --> kh2_act --> h1_ok

  h1_ok --> h1_term2
  h1_term2 --> ht4_term_check
  ht4_term_check --|Không ACTIVE|--> h1_err
  ht4_term_check --|ACTIVE|--> ht4_term --> ht4_room_avail --> h1_term_ok
```

> **Khớp code:** `POST /contracts` xác thực tenant (404), room (404), room phải `AVAILABLE` (400 nếu không) — và tự
> **sửa lỗi (self-healing)** nếu phòng `AVAILABLE` nhưng đã có hợp đồng `ACTIVE` (đánh dấu OCCUPIED, báo client tải lại).
> Tạo xong hợp đồng **ACTIVE + đổi phòng → OCCUPIED (atomic)**, rồi **fire-and-forget gửi email**: khách chưa kích hoạt
> thì gửi email kèm link kích hoạt (token 7 ngày), đã kích hoạt thì gửi email hợp đồng thường. `PATCH /contracts/:id/terminate`
> yêu cầu hợp đồng đang ACTIVE (400 nếu không), đặt `TERMINATED + endDate = now` và trả phòng về `AVAILABLE`.
> **"Phê duyệt"** trong tên bài toán không có bước duyệt riêng ở code (hợp đồng tạo là ACTIVE ngay) — đã mô hình thành
> bước "Xem lại & xác nhận" của Nhân viên; nếu bảng phân công cần bước phê duyệt riêng thì Thắng thêm quyết định tương ứng.

## Hình TV5-4 · Sequence Diagram — Lập, phê duyệt và kết thúc hợp đồng thuê (Cặp 02)

Đối tượng tham gia (theo bảng phân công): **giao diện hợp đồng · bộ điều khiển hợp đồng · dịch vụ phòng ·
dịch vụ hợp đồng · kho hợp đồng**.

```mermaid
sequenceDiagram
  actor NV4 as Nhân viên
  participant UIH as Giao diện hợp đồng
  participant CTH as Bộ điều khiển hợp đồng<br/>(ContractsController)
  participant SVF as Dịch vụ phòng<br/>(RoomsService / Room model)
  participant SVH as Dịch vụ hợp đồng<br/>(ContractsService)
  participant KHOH as Kho hợp đồng (contracts/rooms)
  actor KH4 as Khách thuê

  rect rgb(240, 248, 255)
  Note over NV4,KHOH: Lập & phê duyệt hợp đồng
  NV4->>UIH: Chọn phòng trống + khách thuê
  NV4->>UIH: Nhập giá thuê, kỳ hạn, tiền cọc
  NV4->>UIH: Xem lại & xác nhận (phê duyệt)
  activate UIH
  UIH->>CTH: POST /contracts
  activate CTH
  CTH->>SVH: create(dto, user)
  activate SVH
  SVH->>KHOH: Kiểm tra tenant { _id, ownerId }
  activate KHOH
  alt Khách không tồn tại / không thuộc chủ trọ
    KHOH-->>SVH: null
    SVH-->>CTH: 404 — Tenant not found
    CTH-->>UIH: Hiển thị lỗi
  else Có khách hợp lệ
    SVH->>SVF: Kiểm tra phòng { _id, ownerId }
    alt Phòng không tồn tại / không thuộc chủ trọ
      KHOH-->>SVH: null
      SVH-->>CTH: 404 — Room not found
      CTH-->>UIH: Hiển thị lỗi
    else Phòng tồn tại
      alt Phòng không trống (status ≠ AVAILABLE)
        KHOH-->>SVH: room.status ≠ AVAILABLE
        SVH-->>CTH: 400 — phòng không trống
        CTH-->>UIH: Hiển thị lỗi
      else Phòng AVAILABLE
        SVH->>KHOH: (self-heal) kiểm tra hợp đồng ACTIVE đang treo
        SVH->>KHOH: Tạo hợp đồng ACTIVE + đổi phòng → OCCUPIED (transaction)
        KHOH-->>SVH: contract đã lưu
        deactivate KHOH
        SVH->>KH4: Gửi email hợp đồng  %% fire-and-forget
        alt Khách chưa kích hoạt tài khoản
          SVH->>KH4: Email hợp đồng + link kích hoạt (token 7 ngày)
          Note over KH4: Khách mở link, đặt mật khẩu → kích hoạt
        else Đã kích hoạt
          SVH->>KH4: Email hợp đồng thường
        end
        SVH-->>CTH: 201 — trả hợp đồng (kèm telegramLink)
        deactivate SVH
        CTH-->>UIH: trả kết quả
        deactivate CTH
        UIH-->>NV4: Hiển thị "Lập hợp đồng thành công"
        deactivate UIH
      end
    end
  end
  end

  rect rgb(255, 250, 240)
  Note over NV4,KH4: Kết thúc hợp đồng
  NV4->>UIH: Mở hợp đồng đang hiệu lực, bấm "Kết thúc hợp đồng"
  activate UIH
  UIH->>CTH: PATCH /contracts/:id/terminate
  activate CTH
  CTH->>SVH: terminate(id, user)
  activate SVH
  SVH->>KHOH: Tìm hợp đồng { _id, ownerId }
  activate KHOH
  alt Không tìm thấy
    KHOH-->>SVH: null
    SVH-->>CTH: 404 — Contract not found
  else Có hợp đồng
    alt Hợp đồng không còn ACTIVE
      KHOH-->>SVH: status ≠ ACTIVE
      SVH-->>CTH: 400 — chỉ kết thúc được hợp đồng ACTIVE
      CTH-->>UIH: Hiển thị lỗi
    else Hợp đồng ACTIVE
      SVH->>KHOH: Đặt TERMINATED + endDate = hôm nay
      SVH->>SVF: Trả phòng → AVAILABLE
      KHOH-->>SVH: đã cập nhật
      deactivate KHOH
      SVH-->>CTH: 200 — đã kết thúc
      deactivate SVH
      CTH-->>UIH: trả kết quả
      deactivate CTH
      UIH-->>NV4: Hiển thị "Đã kết thúc hợp đồng"
      deactivate UIH
    end
  end
  end
```

> **Khớp code:** đúng luồng trên. AuditInterceptor có trên /contracts (ghi vào `auditlogs`). Ghi chú "phê duyệt nội bộ"
> và fire-and-forget email là điểm Thắng nên giữ đúng code khi vẽ chính thức.

---

---

# Phụ lục: ánh xạ nhanh TV3/TV5 ↔ sơ đồ

| Thành viên | Cặp | Sơ đồ                                               | Hình | Đối tượng SD (theo bảng phân công)                                                                                           |
| ------------ | ---- | ------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| TV3 (Toàn)  | 01   | AD — Tạo và quản lý tài khoản nhân viên       | TV3-1 | —                                                                                                                                  |
| TV3 (Toàn)  | 01   | SD — Tạo và quản lý tài khoản nhân viên       | TV3-2 | giao diện ql người dùng · bộ điều khiển người dùng · dịch vụ tài khoản · kho tài khoản · nhật ký kiểm toán |
| TV3 (Toàn)  | 02   | AD — Tạo và gửi thông báo tới nhân viên       | TV3-3 | —                                                                                                                                  |
| TV3 (Toàn)  | 02   | SD — Tạo và gửi thông báo tới nhân viên       | TV3-4 | giao diện thông báo · bộ điều khiển thông báo · dịch vụ thông báo · kho thông báo · Nhân viên                  |
| TV5 (Thắng) | 01   | AD — Tiếp nhận & cập nhật hồ sơ khách thuê    | TV5-1 | —                                                                                                                                  |
| TV5 (Thắng) | 01   | SD — Tiếp nhận & cập nhật hồ sơ khách thuê    | TV5-2 | giao diện khách thuê · bộ điều khiển khách thuê · dịch vụ khách thuê · kho hồ sơ khách thuê                     |
| TV5 (Thắng) | 02   | AD — Lập, phê duyệt & kết thúc hợp đồng thuê | TV5-3 | —                                                                                                                                  |
| TV5 (Thắng) | 02   | SD — Lập, phê duyệt & kết thúc hợp đồng thuê | TV5-4 | giao diện hợp đồng · bộ điều khiển hợp đồng · dịch vụ phòng · dịch vụ hợp đồng · kho hợp đồng             |
