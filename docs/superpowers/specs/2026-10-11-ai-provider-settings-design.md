# Smart Idea: Cài đặt Provider AI

## Mục tiêu

Cho phép mỗi user cấu hình provider và model AI của riêng mình trong workspace Smart Idea, làm nền tảng cho các tính năng AI sẽ được xây dựng sau. Phạm vi này chỉ quản lý cấu hình và kết nối; chưa gửi yêu cầu phân tích ý tưởng đến AI.

## Trải nghiệm

- Bấm khu vực tài khoản ở cuối sidebar để mở modal **Cài đặt**; nút đăng xuất vẫn hoạt động riêng.
- Modal có điều hướng mục **Provider AI** và tái sử dụng các shadcn component hiện có.
- Mục Provider AI giữ các thao tác như Smart Stock: tìm kiếm, thêm, sửa, xóa, bật/tắt provider; xem provider đang dùng và quản lý nhiều model cho mỗi provider.
- Khi bật một provider, provider đang bật khác của cùng user sẽ bị tắt. Lưu/xóa/thay đổi trạng thái báo kết quả bằng toast góc trên bên phải.
- Kết nối OpenAI OAuth có trạng thái kết nối, popup đăng nhập, callback dự phòng để dán URL khi popup/redirect không dùng được, và thao tác ngắt kết nối.
- Giữ giao diện tiếng Việt, màu navy/coral và khả năng dùng bằng bàn phím/màn hình nhỏ.

## Provider được hỗ trợ

Giữ danh sách Smart Stock hiện tại: ChatGPT Subscription (OAuth), OpenAI Compatible, Anthropic, Google Gemini, Google Vertex AI, OpenRouter, Groq, DeepSeek, Mistral AI, xAI, MiniMax, Cohere và Perplexity. Provider dùng API key có tên, loại, base URL, API key, danh sách model và model đang chọn. Người dùng có thể nhập nhiều model tùy chỉnh.

## Lưu trữ

### `ai_providers`

Mỗi dòng thuộc một `app_users.id`, xóa cascade theo user. Lưu id, tên, loại provider, base URL, API key đã mã hóa (nullable với OAuth), danh sách model, model đang chọn, trạng thái bật và thời gian tạo/cập nhật. Có index theo chủ sở hữu và unique partial index để một user không thể bật đồng thời nhiều provider.

### `openai_oauth_accounts`

Mỗi user có tối đa một dòng, gồm access token và refresh token đã mã hóa, thời điểm hết hạn và thời gian cập nhật. Token được tách khỏi cấu hình provider để dễ refresh/ngắt kết nối; xóa cascade khi user bị xóa.

## API và quyền truy cập

- `GET`/`PUT /api/ai-assistant/providers`: đọc metadata và tạo/cập nhật cấu hình của user hiện tại.
- `DELETE /api/ai-assistant/providers?id=...`: chỉ xóa provider thuộc user hiện tại.
- `/api/ai-assistant/openai/start`, `/callback`, `/status`, `/logout`: khởi tạo OAuth, nhận callback, kiểm tra kết nối và ngắt kết nối.
- Mọi endpoint yêu cầu session; owner ID luôn lấy từ server session, không nhận từ client. Mọi thao tác đọc/cập nhật/xóa đều lọc theo owner. Dữ liệu trả về không chứa API key hay OAuth token thô; chỉ trả cờ `apiKeyConfigured`.
- Payload được kiểm tra kiểu, độ dài, URL và danh sách model ở server. Lỗi trả về cho client không chứa secret, exception hoặc chi tiết DB.

## Bảo vệ credential

- Mã hóa API key và OAuth token ở server bằng AES-256-GCM từ `node:crypto`, không thêm thư viện.
- Khóa mã hóa riêng `AI_CREDENTIALS_ENCRYPTION_KEY` (32 byte, dạng base64) được thêm vào `.env.example`; không dùng database hay localStorage làm kho plaintext. Payload ciphertext có version để hỗ trợ quy trình thay khóa sau này.
- Khi sửa provider, để trống API key nghĩa là giữ key đã lưu; thao tác xóa key phải rõ ràng. Giao diện chỉ hiển thị trạng thái đã cấu hình.
- Nếu thiếu khóa mã hóa, server từ chối lưu/đọc credential với thông báo cấu hình an toàn; không ghi credential vào log.
- OAuth dùng PKCE, kiểm tra state, cookie `HttpOnly`/`SameSite=Lax`/`Secure` khi production và refresh token phía server. Callback và refresh chỉ cập nhật tài khoản của user đã xác thực.

## Ngoài phạm vi

- Gọi AI, thử prompt hoặc phân tích Canvas/ý tưởng.
- Chia sẻ provider giữa user, role/permission nhóm, nhập/xuất cấu hình.
- Xây hệ thống xoay khóa tự động; thay khóa mã hóa cần giải mã rồi mã hóa lại credential trước khi đổi cấu hình.

## Tiêu chí hoàn thành

1. Bấm khu vực tài khoản mở Cài đặt; vào Provider AI có thể tìm, thêm, sửa, xóa và chọn provider/model.
2. Cấu hình và OAuth của hai user được cô lập; user không thể đọc hoặc thay đổi provider của người khác bằng cách sửa request.
3. API không trả credential thô và không lưu credential ở browser storage/log.
4. Chỉ một provider có thể bật cho mỗi user, kể cả khi nhận cập nhật đồng thời.
5. OpenAI OAuth hoàn tất được qua callback, hỗ trợ refresh token, báo trạng thái và xóa token khi ngắt kết nối.
6. Có migration Drizzle và hướng dẫn biến môi trường; các lỗi lưu/đọc hiển thị thông báo phù hợp mà không lộ dữ liệu nhạy cảm.

## Rủi ro cần xác minh khi lập kế hoạch

- OpenAI OAuth cần xác minh redirect URI và tương thích giao thức hiện dùng trong Smart Stock với cấu hình Smart Idea (port 3001 và môi trường production). Tách phần OAuth khỏi CRUD provider để lỗi upstream không ảnh hưởng provider API key.
- Nếu `AI_CREDENTIALS_ENCRYPTION_KEY` bị mất hoặc thay tùy tiện, credential đã lưu không đọc được; cần backup an toàn và re-encrypt trước khi xoay khóa.
