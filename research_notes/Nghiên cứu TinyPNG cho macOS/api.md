# Tinify API cho app macOS

Ngày kiểm tra: 2026-11-26, Asia/Tokyo. Đây là nghiên cứu tài liệu công khai, không phải kết quả gọi API bằng tài khoản thật. `tinypng.com`/`api.tinify.com` là dịch vụ Tinify; `tinypng.app` là app desktop tham chiếu.

## 1. Hợp đồng API và cách xử lý ảnh là gì?

### Takeaway

App cần HTTP client native và API key người dùng. Không cần backend riêng để chuyển tiếp request từ app macOS. [HTTP API](https://tinypng.com/developers/reference)

### Cited Findings

- HTTPS, Basic Auth `api:KEY`; upload binary bằng `POST /shrink`, lấy `Location`, tải bằng GET hoặc POST JSON để biến đổi. Output tồn tại 8 giờ. [HTTP API](https://tinypng.com/developers/reference)
- Resize: `scale` nhận một chiều; `fit`, `cover`, `thumb` nhận hai chiều. `cover` crop; `thumb` xử lý nền thông minh; không có `crop` riêng. [HTTP API](https://tinypng.com/developers/reference)
- SDK hiện dùng POST khi có tùy chọn biến đổi, thay GET có body để chuẩn bị bỏ giao diện cũ. [Official SDK releases](https://github.com/tinify/tinify-nodejs/releases)
- API hỗ trợ AVIF, JPEG XL, WebP, JPEG, PNG; HEIC được chuyển thành JPEG. Giới hạn 500 MB, 256 megapixels. [Developer API](https://tinypng.com/developers)
- HTTP reference bổ sung giới hạn mỗi cạnh 150.000 pixel. [HTTP API](https://tinypng.com/developers/reference)
- SDK validation gửi POST rỗng `/shrink`, chấp nhận ClientError hoặc 429, còn lỗi authentication được trả về. [Official SDK source](https://raw.githubusercontent.com/tinify/tinify-nodejs/master/src/tinify.ts)

### Inferences

- Dùng `URLSession` trong Swift; tách core dùng chung cho GUI và CLI. Gửi ảnh khi người dùng đưa vào queue; không giới thiệu app là nén offline.
- API key hợp lệ không đồng nghĩa quota còn. UI phải tách trạng thái xác thực và lỗi limit.
- Giữ PNG/JPEG/WebP là phạm vi tương thích ban đầu. Nếu thêm HEIC cần đổi extension theo output; không lưu JPEG dưới tên `.heic`.
- Giới hạn host output về `https://api.tinify.com`, giữ TLS validation mặc định và không chuyển Authorization sang host lạ.

### Gaps

- Chưa kiểm tra API key thật, độ giảm dung lượng, màu, metadata hoặc chất lượng ảnh thật.
- Tài liệu không cam kết thời gian xử lý hay mức giảm dung lượng cho từng ảnh. Không nên dùng phần trăm demo làm cam kết sản phẩm.

## 2. Quota, chi phí và lỗi ảnh hưởng UX thế nào?

### Takeaway

Chi phí tính theo operation thành công, không đơn thuần theo số file. Cần cho người dùng thấy usage và nguyên nhân lỗi, đồng thời tránh retry khiến họ tưởng không có hoạt động mạng. [API pricing](https://tinypng.com/pricing/api), [Node.js API](https://tinypng.com/developers/reference/nodejs)

### Cited Findings

- Miễn phí 500 compressions/tháng, không cần thông tin thanh toán. Tiếp 9.500 operations giá USD 0,009/operation; phần vượt 10.000 giá USD 0,002/operation. Có prepaid bundles; pay-per-compression không phí subscription hay mức tối thiểu. [API pricing](https://tinypng.com/pricing/api)
- Ví dụ giá công bố: 2.000 compressions/tháng có 1.500 tính phí, tổng USD 13,50. [API pricing](https://tinypng.com/pricing/api)
- Upload tính một operation trừ khi không làm nhỏ hơn. Upload lại cùng ảnh/key trong 8 giờ không tính lại. Một request resize/convert/store tính thêm một, kể cả gộp nhiều thao tác; download/preserve không tính. Limit dùng chung toàn tài khoản dù count theo key. [Node.js API](https://tinypng.com/developers/reference/nodejs)
- `Compression-Count` tính tháng UTC. Lỗi: 400 request/ảnh; 401 key; 404 output hết hạn; 415 format; 429 quota hoặc tốc độ, phân biệt bằng message; không có Retry-After; 5xx tạm thời. [HTTP API](https://tinypng.com/developers/reference)
- SDK phân nhóm AccountError, ClientError, ServerError, ConnectionError; client error cần sửa dữ liệu, lỗi kết nối/server có thể retry. [Node.js API](https://tinypng.com/developers/reference/nodejs)

### Inferences

- Nén thường: khoảng một operation/ảnh. Upload + resize/WebP gộp: khoảng hai. Nếu tải bản biến đổi và store S3 bằng hai output requests riêng, có thể thành ba; đây là hệ quả cấu trúc request, không phải giá cố định cho mọi ảnh.
- Hiển thị “usage của API key, tháng UTC”; không diễn giải `Compression-Count` thành số ảnh còn lại toàn tài khoản hoặc luôn lấy `500 - count` cho tài khoản trả phí.
- Pause queue khi lỗi xác thực hoặc quota; cho sửa cấu hình và retry. Lỗi một file cần hiển thị rõ, không làm mất các file đã thành công.
- Đặt retry có giới hạn cho lỗi tạm thời; không tự lặp upload sau khi upload đã thành công nhưng tải output thất bại. Lưu output URL theo job nếu có cơ chế tiếp tục trong 8 giờ.
- Folder watcher cần debounce, chỉ xử lý file ổn định, loại output do app tạo và cập nhật fingerprint sau overwrite để tránh vòng lặp tiêu quota.

### Gaps

- Không tìm được con số request/giây được cam kết trong tài liệu đã đọc; SDK chỉ mô tả rate limit là rộng. Không đặt con số SLA tự suy đoán.
- Chưa xác minh quota riêng của tài khoản người dùng, payment method, prepaid credits hoặc cấu hình billing; không thực hiện thay đổi thanh toán.

## 3. S3 và quyền riêng tư cần thiết kế ra sao?

### Takeaway

S3 trực tiếp qua Tinify yêu cầu gửi AWS credentials cho Tinify. Cần diễn đạt đúng luồng này khi bật tính năng; Keychain chỉ bảo vệ bản lưu cục bộ. [Node.js S3 documentation](https://tinypng.com/developers/reference/nodejs#saving-to-amazon-s3)

### Cited Findings

- Store cần AWS access key, secret, region, path `bucket/path/file`. Mặc định `public-read`; `no-acl` tránh gửi ACL. Cần `PutObject`, thêm `PutObjectAcl` nếu dùng ACL. [Node.js S3 documentation](https://tinypng.com/developers/reference/nodejs#saving-to-amazon-s3)
- Bucket S3 mới mặc định Bucket owner enforced, ACL disabled. AWS khuyến nghị giữ ACL disabled; upload có ACL khác bucket-owner-full-control có thể lỗi `AccessControlListNotSupported`. [AWS Object Ownership](https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html)
- Tinify terms: ảnh lưu tạm, tối ưu, xóa trong 48 giờ; request logs có thể gồm IP, API key, thời gian và fingerprint file, xóa trong 31 ngày. [Tinify terms](https://tinypng.com/terms)
- Người dùng giữ quyền nội dung; Tinify có quyền lưu/chỉnh sửa tạm để cung cấp dịch vụ. Nhà cung cấp xử lý dữ liệu ở EU, US, Australia. [Tinify terms](https://tinypng.com/terms)

### Inferences

- Output có thể tải trong 8 giờ và dữ liệu bị xóa trong tối đa 48 giờ là hai thời hạn khác nhau; không hứa xóa toàn bộ sau 8 giờ.
- Dùng Keychain cho Tinify/AWS secrets; không lưu vào UserDefaults, JSON settings, repo, logs, test fixtures hay crash output. AWS credentials nhập trong app, không cần đưa cho agent trong chat.
- Mặc định tắt S3; giải thích một lần tại cấu hình rằng credentials gửi tới Tinify để ghi vào S3. Dùng IAM user giới hạn đúng bucket/prefix và `no-acl`; không tự thay bucket policy hay public access.
- Lưu cục bộ thành công nhưng S3 thất bại cần có trạng thái riêng, để retry S3 không bắt buộc nén lại ảnh.
- Chọn đích S3 không trùng hoặc cho phép ghi đè rõ ràng: overwrite local và overwrite remote là hai lựa chọn độc lập.
- Acceptance tests nên mock `URLProtocol`: payload auth/resize/WebP/S3; 400/401/404/415/429/5xx; host lạ; lỗi write; collision; overwrite; file không hợp lệ; watcher không tự lặp. Integration test chỉ chạy khi chủ tài khoản cấp key và chọn ảnh kiểm thử.

### Gaps

- Không có AWS account/bucket hoặc Tinify key thật để kiểm tra end-to-end. Chưa xác minh cấu hình bucket, IAM policy, ACL thực tế, regional routing hay retention ngoài các cam kết công bố.
- Chưa thấy hợp đồng store hỗ trợ session token cho AWS temporary credentials trong danh sách tham số đã đọc; không tự giả định tương thích STS.
