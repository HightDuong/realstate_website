# Sàn giao dịch bất động sản trực tuyến tích hợp trí tuệ nhân tạo

### 🔗 Demo: [realstate-website-eight.vercel.app](https://realstate-website-eight.vercel.app)

> Lần truy cập đầu có thể mất 30–60 giây để máy chủ khởi động (backend dùng gói miễn phí).

---

## Dự án này là gì?

Một sàn giao dịch bất động sản trên web, nơi **người bán** đăng tin, **người mua** tìm nhà và liên hệ trực tiếp với người bán, còn **ban quản trị** giữ cho sàn sạch và đáng tin.

Điểm khác biệt là AI được đưa vào **đúng chỗ mà mỗi bên đang gặp khó**: người mua không biết bắt đầu tìm từ đâu, người bán không biết viết tin sao cho hay, còn admin không có thời gian soi từng tin. AI chỉ đóng vai **trợ lý gợi ý**; mọi quyết định quan trọng như đăng tin, duyệt hay từ chối vẫn do con người đưa ra.

---

## Vấn đề dự án giải quyết

Trên các sàn bất động sản hiện nay thường gặp:

- **Tin đăng kém chất lượng**: mô tả sơ sài, thiếu thông tin pháp lý, ảnh không liên quan, giá ghi sai đơn vị.
- **Tin rác và lừa đảo**: cùng một căn đăng đi đăng lại, giá rẻ bất thường để câu khách, số điện thoại/Zalo cài vào mô tả để kéo khách ra ngoài sàn, cam kết "lợi nhuận 30%/năm".
- **Người mua khó tìm**: bộ lọc truyền thống chỉ hiểu "thành phố, giá, số phòng", không hiểu những nhu cầu như *"yên tĩnh, gần trường, hợp gia đình có con nhỏ"*.
- **Người bán bỏ lỡ khách**: yêu cầu tư vấn đến từ nhiều nơi, không biết ai đã trả lời, ai đang chờ, khách nào sắp chốt.
- **Kiểm duyệt thủ công tốn sức**: admin phải đọc từng tin, khó phát hiện tin trùng hay giá bất thường bằng mắt.

---

## Ý tưởng giải pháp

### 1. Ba vai trò, một luồng khép kín

```
 Người bán                       Ban quản trị                    Người mua
 ─────────                       ────────────                    ─────────
 Đăng tin (AI viết hộ)  ──►  Kiểm duyệt (AI chấm rủi ro)  ──►  Tìm nhà (chatbot AI)
                                                                     │
 Quản lý khách hàng   ◄──────  Yêu cầu tư vấn / Nhắn tin  ◄─────────┘
 (Mới → Đang trao đổi → Đã hẹn xem → Đã chốt)
```

- **Người bán** phải được admin duyệt tài khoản rồi mới được đăng tin. Mỗi tin mới hoặc tin bị sửa nội dung quan trọng đều quay lại hàng chờ kiểm duyệt.
- **Ban quản trị** duyệt người bán, duyệt tin, xử lý thư liên hệ và giám sát các tương tác trên sàn.
- **Người mua** chỉ nhìn thấy tin đã được duyệt, có nhãn "Đã kiểm duyệt", nên tin tưởng nội dung hơn.

### 2. Người mua: tìm nhà bằng cách *nói chuyện*

- **Chatbot tìm nhà**: người mua gõ như nói chuyện với môi giới — *"Tìm căn hộ 2 phòng ngủ ở Đà Nẵng dưới 3 tỷ, gần biển, yên tĩnh"*. AI tự tách ra điều kiện cứng (thành phố, giá, số phòng) và phần mô tả mềm ("gần biển, yên tĩnh"), rồi so khớp **theo ý nghĩa** với nội dung các tin đăng chứ không chỉ theo từ khóa. Kết quả hiện dưới dạng thẻ bất động sản ngay trong khung chat.
- **"Có thể bạn quan tâm"**: sau khi trò chuyện, hệ thống nhớ nhu cầu mới nhất và gợi ý tối đa 5 tin phù hợp. Người chưa trò chuyện thì được gợi ý **tin nổi bật**, chấm điểm theo giá/m² so với mặt bằng khu vực, độ đầy đủ của tin, lượt xem, độ mới và trạng thái kiểm duyệt — mỗi tin kèm một câu lý do như *"Giá/m² thấp hơn 18% so với mặt bằng TP.HCM"*.
- Ngoài ra: lưu tin yêu thích, gửi yêu cầu tư vấn, nhắn tin realtime với người bán, nhận thông báo khi người bán phản hồi.

### 3. Người bán: viết tin nhanh, không bỏ lỡ khách

- **AI viết tin đăng**: người bán chỉ cần nhập thông số, chọn vài ảnh và ghi vài ý nổi bật. AI soạn tiêu đề và mô tả hoàn chỉnh trong vài giây, nhìn ảnh để gợi ý tiện ích, và nhắc những thông tin **nên bổ sung** (pháp lý, hướng nhà, ảnh phòng ngủ…).
  - AI **không bịa** thông tin không có trong dữ liệu, tự loại bỏ SĐT/Zalo/link và câu hứa hẹn — nên tin viết ra **ít bị từ chối** khi kiểm duyệt.
  - Người bán luôn được xem và sửa trước khi dùng. Mỗi người có 20 lượt/ngày, hết lượt thì liên hệ admin để được cấp thêm.
- **Quản lý khách hàng (CRM mini)**: mỗi yêu cầu tư vấn đi qua các trạng thái *Mới → Đang trao đổi → Đã hẹn xem → Đã chốt / Không tiếp tục*.
  - Khi người bán nhắn tin trả lời khách, yêu cầu **tự chuyển** sang "Đang trao đổi".
  - Khách chờ quá 24 giờ được đánh dấu đỏ để người bán không quên.
  - Có ghi chú nội bộ, lý do khách không tiếp tục, tỉ lệ chốt và thời gian phản hồi khách — giúp người bán, nhất là người mới, làm việc có quy trình.

### 4. Ban quản trị: AI soi trước, con người quyết định

Mỗi tin chờ duyệt được kiểm tra tự động qua **3 lớp**:

| Lớp | Phát hiện |
|---|---|
| **Quy tắc** | SĐT/Zalo/email/link trong nội dung, giá rẻ hoặc đắt bất thường so với các tin cùng khu vực và loại hình, giá ghi sai đơn vị, diện tích vô lý so với số phòng, tin quá sơ sài |
| **Tìm tin trùng** | Tin giống gần như hoàn toàn một tin khác đã đăng (so khớp cả câu chữ lẫn ý nghĩa) |
| **AI đọc nội dung và ảnh** | Cam kết sai sự thật ("bao lợi nhuận", "chắc chắn tăng giá"), ảnh không phải bất động sản, ảnh có chèn số điện thoại, ảnh không khớp loại nhà, nội dung cố tình "ra lệnh" cho AI |

Kết quả hiển thị cho admin gồm **mức rủi ro (Thấp / Trung bình / Cao)**, từng cảnh báo kèm **lý do và bằng chứng cụ thể**, cùng một **lý do từ chối gợi ý** để admin dùng ngay.

Nguyên tắc thiết kế:
- **Không có tin nào được tự động duyệt hay từ chối** — kể cả tin rủi ro thấp. AI chỉ giúp admin xếp thứ tự ưu tiên và đọc nhanh hơn.
- Mức rủi ro do **code tính** từ loại cảnh báo, không để AI tự cho điểm, nên kết quả nhất quán và giải thích được.
- Người bán **không thấy** cảnh báo của AI, chỉ thấy lý do từ chối do admin viết.

Ngoài ra admin có **hộp thư liên hệ** để tiếp nhận hỗ trợ từ người dùng (lọc *Chờ xử lý / Đã xử lý*, trả lời nhanh qua email hoặc điện thoại).

---

## Tech stack

| Phần | Công nghệ |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, React Router |
| Backend | Node.js, Express 5, Socket.io (nhắn tin và thông báo realtime) |
| Cơ sở dữ liệu | MongoDB Atlas (Mongoose) |
| AI | OpenAI — mô hình ngôn ngữ có đọc ảnh và mô hình embedding cho tìm kiếm theo ngữ nghĩa |
| Dịch vụ khác | Cloudinary (lưu ảnh), Brevo (email OTP và thông báo) |
| Triển khai | Vercel (frontend), Render (backend), GitHub Actions (kiểm thử tự động) |

---

## Hướng phát triển

- Lịch hẹn xem nhà và nhắc lịch qua email.
- **Trợ lý bán hàng AI**: mỗi sáng phân tích tin của người bán (nhiều lượt xem nhưng không ai hỏi, giá cao hơn mặt bằng, khách chờ lâu…) và đề xuất việc nên làm.
- Mở rộng chatbot: so sánh nhiều tin, thống kê giá thị trường, tính khoản vay.
- Bản đồ vị trí, tin VIP có thanh toán, đánh giá người bán.

---

📄 Đặc tả kỹ thuật chi tiết (API, mô hình dữ liệu, cách hoạt động của từng tính năng AI): [spec.md](spec.md)
