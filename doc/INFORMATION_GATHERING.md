# 📥 Information Gathering (Thu thập yêu cầu thông tin) — Hệ thống Quản lý Cho thuê SaaS

> Information gathering là thu thập dữ liệu về các **yêu cầu thông tin** của con người và hệ thống, nhằm xác định những gì hệ thống mới phải làm để đáp ứng nhu cầu của tổ chức.
> Nội dung chương bám theo **Kendall & Kendall (2019)** — Systems Analysis and Design, Chương 4 (Interactive Methods) và Chương 5 (Unobtrusive Methods), áp dụng cho hệ thống `rental-saas-backend` (NestJS + MongoDB).

---

## 2.1. Bối cảnh thu thập thông tin

Hệ thống quản lý cho thuê SaaS được xây dựng cho **MinhHouse** — một doanh nghiệp cho thuê phòng trọ giả định gồm **4 tòa nhà, 25 phòng** tại TP.HCM. Do là doanh nghiệp giả định nên nhóm **không thể tiếp cận dữ liệu vận hành thực tế** hay phỏng vấn người thật. Điều này buộc nhóm phải điều chỉnh cách tiếp cận: giả lập phỏng vấn dựa trên đặc điểm ngành cho thuê phòng trọ tại Việt Nam, tự xây dựng tài liệu nội bộ giả định và đề xuất kế hoạch cho các phương pháp cần dữ liệu thật.

| **Thách thức** | **Ảnh hưởng** | **Hướng xử lý** |
| --- | --- | --- |
| MinhHouse là doanh nghiệp giả định | Không thể phỏng vấn/khảo sát người thật | Giả lập phỏng vấn theo đặc điểm chủ trọ, nhân viên quản lý, khách thuê trọ tại Việt Nam |
| Không có dữ liệu vận hành thật | Sampling và Text Analytics không thực hiện trực tiếp được | Mô tả kế hoạch đề xuất; số liệu tham chiếu từ nghiên cứu thứ cấp ngành nhà trọ |
| Không thể quan sát môi trường làm việc thật | STROBE và Observation không áp dụng được | Bỏ qua, thay thế bằng phân tích tài liệu giả định |
| JAD cần stakeholders họp tập trung tại một địa điểm | Không thể tổ chức JAD với người thật | Không áp dụng, thay bằng giả lập vai từng Actor + rà soát tài liệu |

Bảng 2. 1 - Thách thức và hướng xử lý trong bối cảnh giả định MinhHouse

## 2.2. Lựa chọn phương pháp

_Kendall & Kendall (2019)_ chia phương pháp thu thập thông tin thành hai nhóm:
- **Interactive Methods** — tương tác trực tiếp với người dùng: Phỏng vấn (Interviewing), Câu chuyện người dùng (User Stories), JAD, Bảng câu hỏi (Questionnaires).
- **Unobtrusive Methods** — phân tích gián tiếp, không tương tác: Sampling, Document Analysis, Text Analytics, Observation (STROBE).

| **Phương pháp** | **Nhóm** | **Trạng thái** | **Ghi chú** |
| --- | --- | --- | --- |
| Interviewing | Interactive | Giả lập | Phỏng vấn mô phỏng theo đúng cấu trúc Kendall & Kendall |
| User Stories | Interactive | Thực hiện | Viết câu chuyện người dùng theo vai trò Actor → yêu cầu hệ thống |
| JAD | Interactive | Không áp dụng | Yêu cầu stakeholders thật họp tại một địa điểm |
| Questionnaires | Interactive | Giả lập | Thiết kế bảng câu hỏi khảo sát khách thuê; kết quả dựa trên dữ liệu thứ cấp |
| Sampling | Unobtrusive | Đề xuất | Kế hoạch áp dụng khi triển khai thực tế |
| Document Analysis | Unobtrusive | Thực hiện | Dựa trên tài liệu nội bộ giả định nhóm tự xây dựng |
| Text Analytics | Unobtrusive | Đề xuất | Kế hoạch áp dụng khi có dữ liệu phản hồi thật |
| Observation STROBE | Unobtrusive | Không áp dụng | Yêu cầu quan sát môi trường thực tế |

Bảng 2. 2 - Lựa chọn phương pháp thu thập thông tin

## 2.3. Interactive Methods

### 2.3.1. Interviewing

Phỏng vấn được chọn vì:

\+ Có thể thu thập **ý kiến chủ quan, cảm nhận và mục tiêu** của từng Actor — loại thông tin không tìm thấy trong bất kỳ tài liệu hay số liệu nào _(Kendall & Kendall, 2019)_.

\+ Nhóm cần biết: Chủ nhà muốn gì từ hệ thống? Nhân viên quản lý đang gặp khó khăn gì khi lập hóa đơn điện/nước hàng tháng? Khách thuê mong muốn gì ở cổng thanh toán online?

**a. Chuẩn bị phỏng vấn**

Theo _Kendall & Kendall (2019)_, chuẩn bị phỏng vấn gồm 5 bước: đọc tài liệu nền, xác định mục tiêu, quyết định đối tượng, chuẩn bị interviewee và lựa chọn loại câu hỏi. Nhóm thực hiện:

- **Bước 1 — Đọc tài liệu nền:** Nghiên cứu đặc điểm vận hành nhà trọ/cho thuê phòng tại Việt Nam (thu tiền theo tháng, tính chỉ số điện nước, hợp đồng thuê trọ, tỷ lệ sử dụng ví điện tử MoMo/VNPay) để xây dựng bối cảnh phù hợp cho MinhHouse.
- **Bước 2 — Xác định mục tiêu phỏng vấn:** Xác định các vấn đề cốt lõi về quy trình lập hóa đơn, thu tiền, theo dõi hợp đồng, điểm nghẽn vận hành và nhu cầu của từng nhóm người dùng.
- **Bước 3 — Chọn thứ tự đối tượng phỏng vấn:** Chủ nhà trước (cái nhìn tổng quan doanh nghiệp) → Nhân viên quản lý (quy trình vận hành chi tiết) → Khách thuê (trải nghiệm thanh toán). Mỗi cuộc phỏng vấn sau được định hướng bởi thông tin từ phỏng vấn trước.
- **Bước 4 — Chuẩn bị cho interviewee:** Cung cấp trước chủ đề phỏng vấn và thời lượng dự kiến (30–45 phút).
- **Bước 5 — Lựa chọn loại câu hỏi:** Phối hợp câu hỏi **mở** (mô tả quy trình), **đóng** (xác nhận số liệu) và **thăm dò** (đào sâu nguyên nhân).

**b. Cấu trúc câu hỏi: Funnel**

Nhóm chọn cấu trúc **Funnel** (từ câu hỏi mở rộng → câu hỏi đóng hẹp dần) vì ở giai đoạn đầu phân tích nhóm chưa xác định chính xác vấn đề nằm ở đâu trong quy trình cho thuê, nên cần bắt đầu rộng để khám phá trước, sau đó thu hẹp vào chi tiết cụ thể. Nếu dùng **Pyramid** (câu đóng trước) nhóm phải biết sẵn vấn đề cụ thể — không phù hợp ở giai đoạn đầu. **Diamond** (kết hợp cả hai) tốn thời gian hơn và chỉ phù hợp khi cần khai thác cả hai chiều — không cần thiết ở đây.

**c. Nội dung phỏng vấn giả lập**

**Đối tượng 1: Chủ nhà (Owner — anh Minh, chủ MinhHouse)**

| **Loại câu hỏi** | **Câu hỏi** | **Trả lời giả lập** |
| --- | --- | --- |
| Mở | Anh/chị mô tả quy trình quản lý nhà trọ hiện tại của MinhHouse như thế nào? | Quản lý 4 tòa nhà, 25 phòng bằng sổ tay và Excel. Cuối tháng phải ghi chỉ số điện/nước từng phòng, tính tiền thủ công rồi nhắn qua Zalo từng khách. |
| Mở | Những vấn đề lớn nhất anh/chị gặp phải trong quản lý cho thuê là gì? | Quên đọc chỉ số, tính sai tiền điện nước, khách chậm thanh toán phải nhắc thủ công, không biết phòng nào đang trống, không tổng hợp được doanh thu tháng. |
| Đóng | MinhHouse hiện có bao nhiêu tòa nhà và phòng đang cho thuê? | 4 tòa nhà, 25 phòng, 22 phòng đang cho thuê, 3 phòng trống. |
| Thăm dò | Tại sao anh/chị chưa dùng phần mềm quản lý trọ sẵn có? | Chi phí cao tính theo đầu phòng, không tính được hóa đơn điện/nước tháng, khách không xem được hóa đơn online. |

Bảng 2. 3 - Nội dung phỏng vấn giả lập – Chủ nhà (Owner)

**Đối tượng 2: Nhân viên quản lý (Staff)**

| **Loại câu hỏi** | **Câu hỏi** | **Trả lời giả lập** |
| --- | --- | --- |
| Mở | Quy trình lập hóa đơn và thu tiền phòng hiện tại của bạn như thế nào? | Cuối tháng đi từng phòng đọc chỉ số điện/nước, về nhập Excel, tính tiền tay, gửi hóa đơn qua Zalo. Khách nợ nhiều tháng phải nhắc đi nhắc lại. |
| Đóng | Mỗi tháng bạn dành bao nhiêu thời gian cho việc lập hóa đơn? | Khoảng 3–4 ngày vào cuối tháng cho 25 phòng, chưa kể thời gian làm lại do sai số. |
| Thăm dò | Điều gì khiến bạn mất nhiều thời gian nhất trong ca làm việc? | Nhập chỉ số điện/nước và nhắn hóa đơn từng khách. Không có lịch sử thanh toán, khách hỏi lại phải lật sổ tay. |

Bảng 2. 4 – Nội dung phỏng vấn giả lập – Nhân viên quản lý (Staff)

**Đối tượng 3: Khách thuê (Tenant)**

| **Loại câu hỏi** | **Câu hỏi** | **Trả lời giả lập** |
| --- | --- | --- |
| Mở | Trải nghiệm thanh toán tiền trọ hiện tại của bạn như thế nào? | Chờ nhân viên gửi hóa đơn qua Zalo, không rõ các khoản được tính ra sao, phải chuyển khoản hoặc trả tiền mặt, không xem được lịch sử thanh toán. |
| Đóng | Bạn thường thanh toán tiền trọ bằng hình thức nào? | Khoảng 60% chuyển khoản ngân hàng, 40% trả tiền mặt; rất ít dùng ví điện tử. |
| Thăm dò | Nếu có cổng xem hóa đơn online và thanh toán qua MoMo/VNPay/VietQR, bạn có sử dụng không? | Có, nếu hóa đơn rõ ràng, minh bạch và thanh toán nhanh, không phải chờ giấy hay nhắn tin qua lại. |

Bảng 2. 5 - Nội dung phỏng vấn giả lập – Khách thuê (Tenant)

**d. Báo cáo phỏng vấn (Interview Report)**

Tổng hợp từ 3 cuộc phỏng vấn giả lập:

| **Đối tượng** | **Vấn đề cốt lõi** | **Yêu cầu hệ thống** |
| --- | --- | --- |
| Chủ nhà | Tính tiền điện/nước thủ công, sai sót, không tổng hợp được doanh thu, không biết phòng trống | Hóa đơn tự tính theo chỉ số điện/nước; dashboard doanh thu theo tòa/phòng; theo dõi trạng thái phòng |
| Nhân viên quản lý | Tốn 3–4 ngày/tháng lập hóa đơn, nhắn khách thủ công, không có lịch sử thanh toán | Sinh hóa đơn định kỳ tự động; thông báo Telegram/email; lịch sử thanh toán đầy đủ |
| Khách thuê | Không xem được hóa đơn & lịch sử, thanh toán bất tiện | Cổng thông tin khách thuê; thanh toán online MoMo/VNPay/VietQR; ghi nhận thanh toán tự động |

Bảng 2. 6 - Báo cáo phỏng vấn tổng hợp (Interview Report)

### 2.3.2. User Stories

User Stories được sử dụng để mô tả yêu cầu hệ thống dưới dạng **kịch bản trải nghiệm thực tế** của từng Actor, giúp nhóm dịch các vấn đề thu thập được thành chức năng cụ thể của hệ thống `rental-saas-backend`. Mỗi câu chuyện viết theo mẫu: **"Với vai trò [Actor], tôi muốn [chức năng], để [giá trị mang lại]"**. Độ ưu tiên: **Cao** (bắt buộc cho MVP), **Trung bình** (nâng cao), **Thấp** (mở rộng sau).

| **STT** | **User Story** | **Actor** | **Module / DFD** | **Ưu tiên** |
| --- | --- | --- | --- | --- |
| 1 | Với vai trò Chủ nhà, tôi muốn đăng ký bằng email + mã OTP và đăng nhập an toàn, để truy cập hệ thống và tự động nhận gói miễn phí. | Chủ nhà | auth, users, subscription (P1) | Cao |
| 2 | Với vai trò Chủ nhà, tôi muốn tạo tòa nhà và phòng với giá, diện tích, trạng thái (trống/đang thuê/bảo trì), để biết phòng nào còn cho thuê. | Chủ nhà | properties, rooms (P2) | Cao |
| 3 | Với vai trò Chủ nhà, tôi muốn lưu hồ sơ khách thuê và tạo hợp đồng (giá thuê, cọc, thời hạn), để quản lý khách và thời hạn thuê tập trung. | Chủ nhà | tenants, contracts (P3) | Cao |
| 4 | Với vai trò Chủ nhà, tôi muốn hệ thống gửi email hợp đồng kèm link kích hoạt, để khách tự kích hoạt tài khoản và đổi mật khẩu lần đầu. | Chủ nhà | contracts, mail (P3/P9) | Cao |
| 5 | Với vai trò Nhân viên, tôi muốn nhập chỉ số điện/nước đầu kỳ và cuối kỳ, để hệ thống tự tính tiền và tạo hóa đơn tháng không cần tính tay. | Nhân viên | bills (P4) | Cao |
| 6 | Với vai trò Khách thuê, tôi muốn xem hóa đơn và lịch sử thanh toán trên cổng thông tin, để chủ động theo dõi các khoản phải đóng. | Khách thuê | tenant-portal (P6) | Cao |
| 7 | Với vai trò Khách thuê, tôi muốn thanh toán hóa đơn online qua MoMo/VNPay/VietQR, để không phải chờ nhân viên đến thu. | Khách thuê | payments, momo, vnpay (P4) | Cao |
| 8 | Với vai trò Chủ nhà, tôi muốn nhận thông báo qua Telegram/email khi khách thanh toán hoặc hóa đơn quá hạn, để xử lý kịp thời. | Chủ nhà | telegram, notifications (P9) | Trung bình |
| 9 | Với vai trò Chủ nhà, tôi muốn xem báo cáo doanh thu và xuất file Excel/PDF, để tổng hợp cho kế toán. | Chủ nhà | report, invoice (P8) | Trung bình |
| 10 | Với vai trò Chủ nhà, tôi muốn hỏi AI về trạng thái phòng/doanh thu bằng ngôn ngữ tự nhiên, để tra cứu nhanh không cần lục menu. | Chủ nhà | ai-agent (P7) | Thấp |
| 11 | Với vai trò Quản trị viên, tôi muốn quản lý gói đăng ký (FREE/BASIC/PRO), hạn mức phòng và thanh toán nâng cấp qua MoMo, để vận hành mô hình SaaS. | Quản trị viên | subscription, admin (P5) | Trung bình |
| 12 | Với vai trò Khách thuê, tôi muốn nhận email/link kích hoạt và tự đổi mật khẩu lần đầu, để bảo mật tài khoản khi nhận hợp đồng. | Khách thuê | tenant-auth (P1/P3) | Cao |

Bảng 2. 7 - User Stories của hệ thống quản lý cho thuê SaaS

> User Stories phản ánh trực tiếp 9 tiến trình trong **DFD mức 0**: P1 Xác thực & Tài khoản, P2 Tòa nhà/Phòng, P3 Khách thuê & Hợp đồng, P4 Hóa đơn & Thanh toán, P5 Gói đăng ký & Quản trị, P6 Cổng thông tin Khách thuê, P7 AI Agent, P8 Báo cáo & Xuất file, P9 Thông báo & Định kỳ.

### 2.3.3. JAD (Joint Application Design)

JAD tổ chức một buổi **thảo luận tập trung tại một địa điểm** giữa các bên liên quan (chủ trọ, nhân viên, khách thuê, nhà phân tích) để thống nhất yêu cầu trong 1–2 ngày. Phương pháp này **không được áp dụng** vì:

\+ MinhHouse là doanh nghiệp giả định — không thể tập hợp các bên liên quan thật ngồi chung một phòng họp.

\+ JAD đòi hỏi chi phí tổ chức và thời gian của nhiều stakeholders — không phù hợp ở giai đoạn phân tích sơ bộ của nhóm.

Thay vào đó, nhóm dùng kết quả **phỏng vấn giả lập + User Stories** (các mục 2.3.1, 2.3.2) để mô phỏng vai từng Actor và rà soát chéo yêu cầu — đạt được mục đích thống nhất yêu cầu của JAD nhưng không cần họp thật.

### 2.3.4. Questionnaires

Questionnaire được chọn cho nhóm **khách thuê** vì đây là nhóm đông (25 phòng, khách phân tán ở 4 tòa nhà, lịch sinh hoạt khác nhau) — không thể phỏng vấn từng người. Ngoài ra, câu hỏi về hành vi thanh toán và mức độ hài lòng có thể **chuẩn hóa và định lượng** được, phù hợp với bảng câu hỏi có cấu trúc.

Bảng câu hỏi dùng 3 loại thang đo, mỗi loại được chọn có lý do cụ thể:

- **Nominal** cho câu hỏi phân loại phương thức thanh toán, tần suất (các lựa chọn mutually exclusive, không có thứ tự).
- **Interval/Likert** cho câu hỏi đo mức độ hài lòng (cần tính điểm trung bình để so sánh giữa các tòa nhà).
- **Bipolar** cho câu hỏi xác nhận đơn giản chỉ cần Có/Không.

| **STT** | **Câu hỏi** | **Loại** | **Thang đo / Lý do chọn** |
| --- | --- | --- | --- |
| 1 | Bạn thường thanh toán tiền trọ bằng hình thức nào? | Đóng | Nominal — các phương thức là mutually exclusive, chỉ cần phân loại không cần thứ tự |
| 2 | Tần suất bạn phải chờ đợi để nhận hóa đơn tiền trọ mỗi tháng là bao nhiêu? | Đóng | Nominal — phân loại mức độ chờ đợi, không có khoảng cách đều nhau |
| 3 | Bạn có hài lòng với cách tính và thông báo tiền điện/nước hiện tại không? | Đóng | Interval/Likert 1–5 — cần đo mức độ và tính điểm trung bình để so sánh |
| 4 | Điều gì khiến bạn thấy bất tiện nhất khi đóng tiền trọ hiện nay? | Mở | Open-ended — khai thác ý kiến tự do, phù hợp khi chưa biết hết các lý do |
| 5 | Bạn có sẵn sàng thanh toán online qua MoMo/VNPay/VietQR nếu có không? | Đóng | Bipolar (Có/Không) — chỉ cần xác nhận, không cần đo mức độ |
| 6 | Tính năng nào bạn mong muốn nhất ở cổng thông tin khách thuê? | Đóng | Nominal — liệt kê đủ các lựa chọn (xem hóa đơn, thanh toán, lịch sử, thông báo), chọn một |

Bảng 2. 8 - Bảng câu hỏi khảo sát khách thuê (Questionnaire)

Thứ tự câu hỏi được sắp xếp theo nguyên tắc của _Kendall & Kendall (2019)_:

- Câu quan trọng nhất lên đầu (người trả lời tập trung nhất ở đầu).
- Nhóm câu cùng chủ đề lại với nhau (thanh toán → hài lòng → nhu cầu).
- Câu ít nhạy cảm đặt trước câu nhạy cảm hơn (hành vi thanh toán trước, sự bất tiện sau) để tạo thoải mái dần.

## 2.4. Unobtrusive Methods

### 2.4.1. Document Analysis

Phân tích tài liệu là phương pháp **duy nhất có thể áp dụng trực tiếp** với doanh nghiệp giả định — nhóm tự xây dựng tài liệu nội bộ giả định của MinhHouse dựa trên đặc điểm ngành cho thuê trọ. Tài liệu phản ánh thực trạng vận hành **khách quan hơn phỏng vấn**: người được phỏng vấn có thể nhớ sai hoặc nói theo cảm tính, còn tài liệu ghi lại dữ liệu thực tế.

_Kendall & Kendall (2019)_ phân loại tài liệu thành **định lượng** (báo cáo, hồ sơ, form dữ liệu) và **định tính** (email, memo, quy trình nội bộ). Nhóm phân tích cả hai loại:

**a. Tài liệu định lượng**

| **Tài liệu** | **Câu hỏi cần trả lời** | **Phát hiện (giả định)** |
| --- | --- | --- |
| File Excel theo dõi chỉ số điện/nước 25 phòng | Mức độ sai lệch/sai sót khi nhập chỉ số tay là bao nhiêu? | Sai sót trung bình 10–15%/kỳ; 1–2 phòng/tháng bị quên đọc chỉ số |
| Bảng tính tiền phòng thủ công | Thời gian lập hóa đơn và tỷ lệ hóa đơn phải làm lại? | Tốn 3–4 ngày cuối tháng; ~12% hóa đơn phải tính lại do sai số |
| Sổ thu tiền mặt / nhật ký thanh toán | Phương thức thanh toán phổ biến và mức độ lưu vết? | 40% khách trả tiền mặt, không có audit trail đầy đủ |
| Danh sách hợp đồng thuê giấy | Có bao nhiêu hợp đồng hết hạn mà chưa được gia hạn? | 2 hợp đồng quá hạn trong 6 tháng vì không có cảnh báo hết hạn |
| Báo cáo doanh thu tháng | Có tổng hợp được theo tòa/phòng không? | Không, phải cộng tay nhiều giờ từ sổ thu tiền |

Bảng 2. 9 - Phân tích tài liệu định lượng của MinhHouse

**b. Tài liệu định tính**

_Kendall & Kendall (2019)_ nhấn mạnh tài liệu định tính như email, memo, quy trình nội bộ tiết lộ văn hóa tổ chức và các vấn đề không ai nói ra trong phỏng vấn chính thức. Nhóm phân tích:

- **Quy trình vận hành nội bộ (SOP):** Phát hiện **5 bước thủ công** trong quy trình cho thuê (đọc chỉ số → tính tiền → nhắn hóa đơn → thu tiền → nhập sổ) có thể tự động hóa bằng module hóa đơn và thông báo.
- **Nhóm Zalo giữa nhân viên và khách thuê:** Phối hợp phi chính thức, thông tin hóa đơn gửi qua tin nhắn dễ thất lạc, không có audit trail — là cơ sở cho yêu cầu thông báo qua Telegram + lịch sử thanh toán trong hệ thống.
- **Hợp đồng mẫu giấy:** Các điều khoản (giá thuê, cọc, thời hạn) không được số hóa — phát sinh yêu cầu **email hợp đồng tự động + link kích hoạt khách thuê** mà phỏng vấn không đề cập đến.

### 2.4.2. Đề xuất Sampling

| **Đối tượng lấy mẫu** | **Loại mẫu đề xuất** | **Lý do chọn loại mẫu này** | **Cỡ mẫu đề xuất** |
| --- | --- | --- | --- |
| Hóa đơn tiền phòng | Purposive | Chọn đủ phòng có mức giá/loại phòng khác nhau — Simple Random có thể bỏ sót phòng có cấu trúc phí phức tạp | 30 hóa đơn (nhiều loại phòng) |
| Chỉ số điện/nước | Purposive | Chọn phòng có biến động chỉ số lớn để phát hiện sai lệch nghiêm trọng nhất khi nhập tay | 15 phòng |
| Khách thuê | Stratified | Chia theo tòa nhà (4 tầng) để mẫu đại diện cho từng tòa | 40 khách (10/tòa) |
| Giao dịch thanh toán | Simple Random | Cần tỷ lệ lỗi khách quan, không thiên về phương thức hay thời điểm cụ thể | 100 giao dịch |

Bảng 2. 10 - Kế hoạch đề xuất Sampling

_Lưu ý: Kế hoạch này sẽ được thực hiện khi MinhHouse triển khai hệ thống thực tế._

### 2.4.3. Đề xuất Text Analytics

Tương tự Sampling, Text Analytics không thể thực hiện với MinhHouse giả định vì không có dữ liệu văn bản thực tế. _Kendall & Kendall (2019)_ mô tả Text Analytics là phần mềm phân tích dữ liệu định tính phi cấu trúc từ blog, chat, mạng xã hội — giúp phát hiện insight từ lượng dữ liệu lớn mà con người không thể đọc hết. Kế hoạch đề xuất:

| **Nguồn dữ liệu đề xuất** | **Phân tích** | **Insight kỳ vọng** |
| --- | --- | --- |
| Tin nhắn khiếu nại qua Zalo/Telegram | Phân loại theo chủ đề: hóa đơn sai, chỉ số điện/nước, thanh toán, sửa chữa | Xác định loại khiếu nại gây mất hài lòng nhiều nhất để ưu tiên tính năng |
| Đánh giá trên Google Maps của các tòa trọ | Phân tích từ khóa lặp lại nhiều nhất (giá, điện nước, an ninh) | Phát hiện vấn đề chung của các tòa nhà chưa được giải quyết |
| Email/phản hồi của khách thuê | Phân loại theo loại vấn đề | Đo tỷ lệ khiếu nại liên quan đến hóa đơn và thanh toán |

Bảng 2. 11 - Kế hoạch đề xuất Text Analytics

_Lưu ý: Kế hoạch này sẽ được thực hiện sau khi hệ thống vận hành thực tế và tích lũy đủ dữ liệu phản hồi từ khách thuê._

## 2.5. Tổng hợp kết quả thu thập thông tin

| **Phương pháp** | **Thông tin thu thập được** | **Yêu cầu hệ thống** |
| --- | --- | --- |
| Phỏng vấn Chủ nhà | Tính tiền điện/nước thủ công, không tổng hợp doanh thu, không biết phòng trống | Hóa đơn tự tính theo chỉ số điện/nước; dashboard doanh thu; theo dõi trạng thái phòng |
| Phỏng vấn Nhân viên | Tốn 3–4 ngày/tháng lập hóa đơn, nhắn khách thủ công | Sinh hóa đơn định kỳ tự động; thông báo Telegram/email tự động |
| Phỏng vấn Khách thuê | Không xem được hóa đơn & lịch sử, thanh toán bất tiện | Cổng thông tin khách thuê; thanh toán online MoMo/VNPay/VietQR |
| User Stories | 12 câu chuyện người dùng phủ 9 tiến trình DFD | Bản đồ yêu cầu → module (auth, properties, rooms, tenants, contracts, bills, payments, subscription, ai-agent, report...) |
| Khảo sát Khách thuê | 70% khách sẵn sàng thanh toán online; điểm hài lòng thông báo hóa đơn 2.6/5 | Tích hợp MoMo/VNPay/VietQR; thông báo hóa đơn rõ ràng, đúng hạn |
| Phân tích tài liệu định lượng | Sai số chỉ số điện/nước 10–15%, ~12% hóa đơn tính lại | Tự động tính hóa đơn, giảm thao tác tay, cảnh báo chỉ số bất thường |
| Phân tích tài liệu định tính | Quy trình 5 bước thủ công, phối hợp phi chính thức qua Zalo | Hệ thống quản lý tập trung, audit trail đầy đủ, email hợp đồng tự động |

Bảng 2. 12 - Tổng hợp kết quả thu thập thông tin

---

> **Liên kết tài liệu:** Kết quả Information Gathering này được dùng làm đầu vào cho **[DFD (Data Flow Diagram)](DFD.md)** (mức Context → Mức 0 → Mức 1 → Mức 2) và **[ERD (Entity-Relationship Diagram)](ERD.md)** (20 thực thể / collection MongoDB) của hệ thống `rental-saas-backend`.
