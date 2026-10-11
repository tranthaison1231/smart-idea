# Smart Idea: Khám phá cơ hội sản phẩm bằng AI

## Mục tiêu

Giúp user khám phá các cơ hội sản phẩm số có dẫn nguồn từ thị trường Việt Nam, xem lịch sử những lần khám phá và lưu cơ hội phù hợp thành Ý tưởng.

## Phạm vi MVP

- Thêm mục **Khám phá** vào sidebar tại `/discover`.
- Khi mở trang, tự tạo feed cho ngày hiện tại nếu chưa có; thêm nút để user chủ động làm mới.
- Dùng Tavily làm nguồn tìm kiếm web chung của nền tảng. Kết quả tìm kiếm theo ngày được cache và dùng lại để tránh mỗi user tạo một lượt tìm kiếm giống nhau.
- Mỗi user nhận bản tổng hợp riêng bằng provider AI đang bật trong Cài đặt. Lịch sử và nội dung tổng hợp được lưu riêng theo user.
- Hiển thị cơ hội dưới dạng danh sách thẻ; xem chi tiết trong dialog hoặc sheet; cho phép lưu một cơ hội thành Ý tưởng.
- Mỗi cơ hội có vấn đề, khách hàng mục tiêu, sản phẩm gợi ý, lý do phù hợp ở thời điểm hiện tại, mô hình doanh thu, độ tin cậy định tính, nguồn và ngày nguồn.
- Lưu dấu liên kết từ cơ hội khám phá tới Ý tưởng đã tạo để tránh lưu trùng và giữ lại nguồn gốc.

## Trải nghiệm và cập nhật feed

- Ngày được tính theo múi giờ `Asia/Ho_Chi_Minh`.
- Trước khi gọi Tavily, server xác nhận user có provider đang bật và credential khả dụng; thiếu cấu hình thì hiển thị liên kết tới Cài đặt và không tiêu thụ lượt tìm kiếm.
- Lần đầu một user mở Khám phá trong ngày, server dùng snapshot nguồn chia sẻ của ngày đó. Nếu chưa có, server chạy một search batch Tavily giới hạn số truy vấn và lưu snapshot dùng chung; request đồng thời cùng ngày dùng chung kết quả.
- Nếu user chưa có bản tổng hợp từ snapshot đó, server dùng provider AI đang bật của user để tạo và lưu một lượt khám phá. Nếu đã có, mở lại trang chỉ tải lịch sử, không gọi AI lần nữa.
- **Làm mới** chủ động lấy snapshot nguồn mới cho lượt khám phá của user, tạo một bản lịch sử mới và chịu giới hạn tần suất để kiểm soát chi phí. Việc làm mới thủ công của một user không thay đổi lịch sử của user khác.
- Đây là cập nhật khi có người mở trang hoặc bấm làm mới; MVP không chạy tác vụ nền khi không có người dùng hoạt động.
- Trang feed nhóm cơ hội theo lượt/ngày khám phá, mới nhất trước. Lịch sử của user vẫn mở được sau khi có lượt mới.
- Sau khi lưu thành Ý tưởng thành công, hiển thị toast và mở trang chi tiết Ý tưởng.

## Dữ liệu và lưu trữ

### Snapshot nguồn dùng chung

Lưu kết quả Tavily có giới hạn để nhiều user có thể tổng hợp từ cùng một lượt tìm kiếm:

- Ngày thị trường theo giờ Việt Nam, thời điểm truy vấn và phiên bản truy vấn.
- Phạm vi snapshot: một snapshot chia sẻ theo ngày, hoặc snapshot riêng gắn với user đã chủ động làm mới.
- Danh sách nguồn đã chuẩn hóa: tiêu đề, URL, tên miền, đoạn trích và ngày xuất bản nếu nguồn cung cấp.
- Snapshot bất biến sau khi tạo để các lượt khám phá cũ tiếp tục trỏ tới đúng evidence đã dùng.

Snapshot dùng chung không chứa user ID, prompt riêng hoặc credential của provider. Snapshot làm mới thủ công có owner ID để chỉ user đó dùng và xem được; xóa user sẽ xóa các snapshot riêng này.

### Lượt khám phá theo user

Mỗi lượt lưu owner, snapshot nguồn, trạng thái tạo, thời điểm tạo và nhãn provider/model đã dùng. Không lưu API key hay OAuth token vào lượt khám phá.

### Cơ hội

Mỗi cơ hội thuộc một lượt và một user; lưu tên/sản phẩm gợi ý, vấn đề, khách hàng mục tiêu, giải pháp, lý do thời điểm hiện tại, các nhãn mô hình doanh thu, độ tin cậy định tính, danh sách nguồn tham chiếu và ID Ý tưởng đã lưu (nullable, đặt lại null nếu Ý tưởng bị xóa). Xóa user sẽ xóa lịch sử riêng của user; snapshot nguồn công khai dùng chung không bị xóa theo user.

## Nguồn và tổng hợp AI

- Server gọi Tavily bằng `TAVILY_API_KEY`; khóa chỉ tồn tại trong môi trường server.
- Dùng một bộ truy vấn tìm kiếm tiếng Việt định sẵn, tập trung vào nhu cầu/vấn đề và tín hiệu thị trường có thể hỗ trợ sản phẩm số ở Việt Nam. Giới hạn số truy vấn và số kết quả mỗi lượt.
- Tạo kết quả có cấu trúc qua provider đã bật. API-key provider phải hỗ trợ giao thức Chat Completions tương thích OpenAI tại base URL đã cấu hình; ChatGPT Subscription OAuth dùng adapter Responses dựa trên OAuth hiện có. Provider chưa hỗ trợ giao thức phải trả lỗi cấu hình rõ ràng, không tự chọn provider khác.
- Kiểm tra JSON đầu ra ở server trước khi ghi dữ liệu; loại cơ hội không có ít nhất một nguồn khớp với snapshot.
- Chỉ cho AI trích dẫn URL/tiêu đề trong snapshot Tavily. Không bịa số liệu quy mô thị trường, tốc độ tăng trưởng, ngày xuất bản hay chi tiết nguồn. Độ tin cậy là đánh giá định tính có giải thích, không phải xác suất thống kê.
- Nội dung nguồn là dữ liệu không đáng tin cậy, không phải chỉ dẫn cho model. Prompt yêu cầu model bỏ qua mọi chỉ dẫn có trong trang hoặc đoạn trích.
- Số cơ hội mỗi lượt được giới hạn ở mức nhỏ (tối đa 5) để ưu tiên tính hữu ích và chi phí.

## Quyền truy cập và an toàn

- Tất cả thao tác chạy sau `requireCurrentAppUser()`; owner ID luôn lấy từ session server, không nhận từ request body.
- Danh sách, chi tiết, lịch sử và thao tác lưu đều kiểm tra quyền sở hữu phía server. API không cho sửa owner ID hoặc gắn cơ hội của user khác.
- Provider đang bật, model và credential được đọc server-side từ cấu hình user. Secret không được trả về browser, ghi vào log hoặc lưu trong snapshot/lượt khám phá.
- Chỉ nhận URL nguồn HTTPS hợp lệ; giới hạn kích thước, số nguồn, prompt/response, thời gian chờ và tần suất làm mới. Với endpoint provider tùy chỉnh, chỉ gọi URL đã lưu trong cấu hình của user hiện tại và chặn loopback/private network để tránh SSRF.
- Lưu cơ hội thành Ý tưởng trong transaction: tạo Idea bằng repository owner-scoped hiện có rồi cập nhật `savedIdeaId` trên cơ hội. Nguồn tiếp tục được giữ ở cơ hội đã liên kết. Gửi lại yêu cầu không tạo thêm Ý tưởng nếu cơ hội đã được lưu.

## API và các trạng thái lỗi

- `GET /api/market-discovery/feed`: trả lịch sử của user hiện tại và lượt mới nhất đã có; không trả secrets.
- Khi trang mở, client gọi `POST /api/market-discovery/refresh` với `mode: "daily"`; server kiểm tra provider trước, sau đó tạo hoặc dùng snapshot chia sẻ trong ngày và tổng hợp nếu user chưa có lượt cho snapshot đó. Yêu cầu lặp lại phải idempotent, kể cả khi nhiều request đồng thời.
- Nút làm mới gọi cùng endpoint với `mode: "manual"`; server tạo snapshot riêng của user, tổng hợp và lưu thành lượt mới. Giới hạn tần suất áp dụng riêng theo user.
- `POST /api/market-discovery/opportunities/:id/save`: lưu cơ hội thuộc user hiện tại thành Ý tưởng; idempotent.
- Nếu chưa cấu hình Tavily, chưa bật provider, credential hết hạn, provider không hỗ trợ giao thức, Tavily/model timeout hoặc đầu ra không hợp lệ, trả lỗi thân thiện và không làm mất lịch sử cũ.
- Nếu Tavily lỗi nhưng có snapshot cũ, có thể tiếp tục tạo feed từ snapshot cũ, đồng thời hiển thị ngày nguồn để user nhận biết độ cũ.

## Ngoài phạm vi

- Chạy cron/background job, cập nhật liên tục hoặc cảnh báo qua email.
- Tìm theo prompt tùy ý, lọc theo ngành, khu vực hoặc persona.
- Điểm xu hướng định lượng, TAM/SAM/SOM, dự báo doanh thu, web scraping sâu hoặc dữ liệu trả phí.
- Thích/ẩn cơ hội, cộng tác nhóm, chia sẻ feed giữa user hoặc cấu hình nguồn theo từng user.
- Thêm một registry nguồn mới hoặc đổi provider AI của user tự động khi provider hiện tại lỗi.

## Tiêu chí hoàn thành

1. User đã đăng nhập mở `/discover` và thấy cơ hội có evidence, hoặc thông báo rõ cách cấu hình khi thiếu Tavily/provider; thiếu provider không gọi Tavily.
2. Mỗi ngày theo giờ Việt Nam, nhiều user mở đồng thời vẫn dùng chung một search batch/snapshot nguồn; mỗi user chỉ có bản tổng hợp riêng và được lưu trong lịch sử của mình.
3. Làm mới thủ công tạo lượt lịch sử mới cho user bấm nút, có giới hạn tần suất.
4. Nguồn được giữ nguyên qua các lượt lịch sử; cơ hội không thể trích dẫn nguồn ngoài snapshot.
5. Lưu cơ hội tạo đúng một Ý tưởng thuộc user hiện tại, liên kết ngược về cơ hội và giữ nội dung nguồn; không thể lưu/đọc dữ liệu user khác.
6. API, database và log không để lộ Tavily key, provider API key hoặc OAuth token.
7. Có migration Drizzle, biến môi trường Tavily trong ví dụ cấu hình và hướng dẫn xác nhận điều khoản Tavily trước khi đưa tính năng ra môi trường người dùng thật.

## Rủi ro và điều kiện phát hành

- Tại thời điểm viết spec, Tavily quảng bá gói Researcher miễn phí gồm 1.000 API credits/tháng, không cần thẻ thanh toán ([pricing](https://www.tavily.com/pricing)). Tuy nhiên, Platform Terms hiện hành giới hạn quyền API theo mục đích kinh doanh nội bộ của khách hàng và nói API key không được chuyển giao/chia sẻ hoặc cho bên thứ ba sử dụng ([Platform Terms](https://www.tavily.com/terms)). Trước khi mở tính năng cho user bên ngoài workspace của chủ tài khoản Tavily, cần xác nhận bằng văn bản rằng mô hình app dùng khóa nền tảng và phục vụ end user được cho phép. Đây là điều kiện phát hành, không phải điều kiện dựng prototype nội bộ.
- Provider cấu hình API-key có nhiều loại trong UI nhưng Smart Stock gọi chúng qua giao thức OpenAI-compatible. Cần thông báo rõ nếu base URL/model của user không hỗ trợ giao thức này; không giả định tên provider đảm bảo tương thích.
- Chất lượng cơ hội phụ thuộc độ mới và độ bao phủ của nguồn công khai; luôn trình bày nguồn/ngày và cho phép user tự đánh giá thay vì coi kết quả là dữ kiện kinh doanh đã kiểm chứng.
