# Smart Idea: Ý tưởng

## Mục tiêu

Cho phép user đã đăng nhập lưu nhiều ý tưởng sản phẩm, xem danh sách của mình và mở trang chi tiết. Đây là nền tảng dữ liệu cho phân tích ý tưởng ở giai đoạn sau.

## Phạm vi MVP

- Có mục Ý tưởng trong sidebar.
- Có trang danh sách tại /ideas và trang chi tiết tại /ideas/:id.
- Có luồng tạo ý tưởng; lưu thành công thì mở trang chi tiết.
- Có thể xem các trường: tên, mô tả, lĩnh vực, vấn đề, khách hàng mục tiêu, giải pháp và các mô hình doanh thu.
- Chưa có sửa, xóa, tìm kiếm, phân tích AI hay Canvas.

## Mô hình dữ liệu

### ideas

| Trường | Kiểu | Quy tắc |
| --- | --- | --- |
| id | uuid | Khóa chính, sinh tự động |
| user_id | uuid | Bắt buộc, tham chiếu app_users.id, xóa user thì xóa ý tưởng |
| name | text | Bắt buộc |
| description | text | Tùy chọn |
| industry | text | Tùy chọn, nhập tự do, không dùng enum |
| problem | text | Tùy chọn |
| target_customer | text | Tùy chọn |
| solution | text | Tùy chọn |
| created_at | timestamptz | Tự sinh |
| updated_at | timestamptz | Tự sinh |

### idea_revenue_models

Mỗi dòng là một nhãn mô hình doanh thu tự do gắn với một ý tưởng. Dùng khóa chính ghép idea_id và name; idea_id tham chiếu ideas.id và xóa cascade. Không dùng enum hay danh mục toàn cục ở MVP để một ý tưởng có thể kết hợp nhiều mô hình mà không khóa trước danh sách lựa chọn.

## Luồng và quyền truy cập

- Trang danh sách chỉ truy vấn ý tưởng có user_id bằng app user hiện tại, sắp xếp mới cập nhật trước.
- Form tạo yêu cầu tên; các trường còn lại là tùy chọn. Tên được trim và phải còn nội dung.
- Mô hình doanh thu nhập mỗi nhãn trên một dòng; khi lưu, trim nhãn, bỏ dòng trống và loại trùng không phân biệt hoa thường trong cùng một ý tưởng.
- Server action phải lấy lại user hiện tại và gán user_id phía server; không tin user_id từ form hoặc client.
- Trang chi tiết truy vấn đồng thời theo id và user_id. Ý tưởng không tồn tại hoặc thuộc user khác trả về 404.
- Không tạo API công khai cho dữ liệu ý tưởng trong MVP.

## Trải nghiệm

- Danh sách có trạng thái rỗng với nút tạo ý tưởng và trạng thái có dữ liệu với các liên kết đến chi tiết.
- Form tạo nằm tại /ideas/new để giữ trang danh sách gọn; hoàn tất thì chuyển về /ideas/:id.
- Trang chi tiết hiển thị đầy đủ nội dung đã lưu và có liên kết quay lại danh sách.
- Sidebar đánh dấu đúng route hiện tại cho /ideas và các trang con.
- Giữ giao diện tiếng Việt, nền navy và điểm nhấn coral hiện có; hỗ trợ màn hình nhỏ và điều hướng bàn phím.

## Tiêu chí hoàn thành

1. User có thể tạo ý tưởng và thấy nó trong danh sách của chính mình.
2. Mở /ideas/:id hiển thị dữ liệu đã lưu; id không thuộc user hiện tại không làm lộ dữ liệu.
3. Một ý tưởng lưu được không, một hoặc nhiều nhãn doanh thu tùy chọn.
4. Các trang ý tưởng vẫn nằm sau auth guard hiện có.
5. Schema có migration Drizzle; build, lint và typecheck chạy thành công.
