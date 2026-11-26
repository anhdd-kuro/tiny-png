# TinyPNG: sản phẩm, UX và phạm vi app macOS

Ngày khảo sát: 26/11/2026 (Asia/Tokyo). Phạm vi: app macOS native lấy desktop app tại tinypng.app làm tham chiếu; không xây lại landing page. Nguồn web được đọc, chưa chạy binary gốc hay gọi API bằng key thật. Các mục “Inferences” là đề xuất triển khai, không phải hành vi đã kiểm thử của sản phẩm gốc.

## 1. Đang tái tạo sản phẩm nào, và có giới hạn hỗ trợ/thương hiệu gì?

### Takeaway

tinyPNG.App là GUI bên thứ ba của BetweenElements, dùng dịch vụ Tinify. Nguồn của chính app nói macOS đã ngừng hỗ trợ; bản macOS mới cần triển khai và kiểm chứng độc lập. [Danh mục add-ons chính thức của Tinify](https://tinypng.com/third-party), [Trang app](https://tinypng.app/)

### Cited Findings

- Tinify liệt kê tinyPNG.App trong add-ons, ghi tác giả BetweenElements và hướng dẫn người dùng nhận hỗ trợ từ tác giả của từng integration. Đây là bằng chứng phân biệt app với dịch vụ/API do Tinify vận hành. [Tinify add-ons](https://tinypng.com/third-party)
- Homepage app ghi Windows/Linux 0.0.12, macOS 0.0.9 không còn hỗ trợ, vẫn cho tải bản Pro macOS miễn phí. Giá Pro hiển thị là 29.99 AUD; đây là thông tin trên trang tại ngày khảo sát, chưa xác minh checkout. [Download và Free vs Pro](https://tinypng.app/)
- Danh mục Tinify vẫn gắn nhãn macOS/Windows/Linux cho app; điều này không chứng minh macOS đang được bảo trì, vì thông báo của tác giả cụ thể hơn. [Tinify add-ons](https://tinypng.com/third-party), [Thông báo macOS](https://tinypng.app/)
- Điều khoản app nói ảnh được nén trên server TinyPNG, người dùng phải có API key của TinyPNG; tài khoản/phí API do TinyPNG quản lý. Điều khoản nhận quyền sở hữu app/nội dung của Between Elements và quyền của chủ sở hữu từng trademark/logo. [Điều khoản app](https://tinypng.app/terms-of-use/)
- Điều khoản Tinify nhận quyền đối với tài sản trí tuệ của Tinify; ảnh gửi lên vẫn thuộc người dùng. Trang ghi ảnh bị xóa trong 48 giờ, log request tối đa 31 ngày. [Tinify Terms, mục 1, 6, 9](https://tinypng.com/terms)

### Inferences

- Định vị app mới là macOS client cho Tinify API; không mô tả app là công cụ offline hay app chính thức của Tinify. Suy luận từ cấu trúc bên thứ ba và việc ảnh được gửi tới server. [Nguồn đối chiếu](https://tinypng.com/third-party)
- Có thể dùng bố cục và luồng làm tài liệu tham chiếu, nhưng nên tạo icon, tên sản phẩm và artwork riêng cho bản phân phối. Đây là lựa chọn giảm phụ thuộc tài sản bên ngoài, không phải kết luận pháp lý về phạm vi quyền tái sử dụng. [Căn cứ điều khoản app](https://tinypng.app/terms-of-use/)
- Không cần tái tạo paywall Free/Pro cho app do người dùng đặt xây nếu mục tiêu là toàn bộ chức năng. Phí/giới hạn Tinify API vẫn phải trình bày riêng trong phần cấu hình dịch vụ. [Căn cứ phân tách dịch vụ](https://tinypng.app/terms-of-use/)

### Gaps

- Chưa tìm thấy repo nguồn hoặc giấy phép cho phép sao chép source/artwork của tinyPNG.App trong các tài liệu chính thức đã đọc; không suy luận “free download” thành open source.
- Chưa có ngày release được xác minh cho 0.0.9/0.0.12, yêu cầu minimum macOS, hỗ trợ Apple Silicon, notarization hay chữ ký binary. Chưa tải/chạy binary cũ.
- Trang privacy của app nói chung về tài khoản, payment, thiết bị và website analytics; không đủ chi tiết để kết luận cách app native lưu API key hay có telemetry hay không. [Privacy của app](https://tinypng.app/privacy-policy/)

## 2. Hành vi nào là baseline đã được tài liệu hóa?

### Takeaway

Baseline là queue tuần tự với lưu file tự động. “Nhận nhiều ảnh” không đồng nghĩa xử lý song song: tài liệu vẫn để batch processing trong roadmap. [Usage](https://tinypng.app/usage/)

### Cited Findings

| Chức năng | Hành vi được công bố | Nguồn |
| --- | --- | --- |
| Kéo thả | PNG/JPG vào queue, xử lý từng ảnh. | [Usage](https://tinypng.app/usage/) |
| Lưu kết quả | Tạo bản sao hậu tố `-tinified`; overwrite ghi vào file gốc. | [Usage](https://tinypng.app/usage/) |
| Resize | Fit/Crop/Scale/Cover; width và height, riêng Scale chỉ width; không overwrite thì hậu tố `-resized-tinified`. | [Usage](https://tinypng.app/usage/) |
| Watch folder | Tự nén PNG/JPG mới thêm; homepage nói gồm subfolder. | [Usage](https://tinypng.app/usage/), [Homepage](https://tinypng.app/) |
| CLI | `tinyPNGApp.exe --file somefile.png`; dùng lại overwrite đã bật trong GUI. | [Usage](https://tinypng.app/usage/) |
| Pro | Overwrite, resize, watch, CLI, WebP, AWS S3. | [Free vs Pro](https://tinypng.app/) |

- API hiện hành dùng resize `scale`, `fit`, `cover`, `thumb`, không liệt kê `crop`. Vì vậy nhãn Crop trong tài liệu app cũ không đủ để xác định request tương ứng. [Tinify HTTP API — Resizing](https://tinypng.com/developers/reference#resizing-images)
- API hỗ trợ PNG/JPEG/WebP và các format mới hơn; capability của API không tự chứng minh app cũ có UI tương ứng. API dùng `Compression-Count` cho số compression tháng UTC. [Tinify HTTP API](https://tinypng.com/developers/reference)

### Inferences

- Phạm vi parity nên gồm một pipeline dùng chung cho drag-and-drop, chọn file, watcher và CLI. Thiết kế này tránh các đường vào có quy tắc đặt tên/overwrite khác nhau; không phải kiến trúc đã biết của app gốc.
- Chạy queue concurrency 1 làm mặc định tương ứng tài liệu. Đưa concurrency cao hơn thành cải tiến riêng sau khi có xử lý throttling và lỗi quota, thay vì gọi đó là parity.
- Cần snapshot thiết lập theo từng job khi enqueue: thay đổi resize/overwrite giữa chừng không được khiến kết quả của các job đang chạy khó dự đoán. Chưa biết app gốc chụp settings ở thời điểm nào.
- Watcher nên đợi file ổn định trước khi đọc; bỏ qua output của chính app, temp file, file đang ghi và fingerprint đã xử lý. Đây là yêu cầu chất lượng cho bản mới nhằm tránh loop khi tạo file có hậu tố hoặc overwrite trong thư mục được theo dõi.
- Cần tách “nén thành công” và “lưu S3 thành công”; lỗi storage không nên xóa bản nén tải về hay bắt nén lại vô điều kiện. Retry nên bám trạng thái pipeline còn hợp lệ.

### Gaps

- Chưa xác minh app gốc xử lý file trùng tên, đầu ra tồn tại, ảnh không giảm dung lượng, nhiều lần drop cùng file, symlink, permission denied, file bị di chuyển hoặc watcher sau reboot ra sao.
- Chưa xác minh retry/cancel/clear queue, số file giữ trong lịch sử, progress từng giai đoạn, timeout hoặc queue recovery của binary gốc.
- Chưa có mapping tin cậy cho Crop cũ; không tự động gửi `method: "crop"`. Cần bỏ nhãn chưa rõ hoặc giải thích rõ mapping đã chọn trước khi triển khai.
- Homepage có WebP/S3 nhưng Usage không mô tả control, output format hay schema settings của hai tính năng này. Không suy luận “WebP support” chắc chắn nghĩa là conversion UI.

## 3. UI nào đã quan sát được, và bản native cần được đặc tả/kiểm tra thế nào?

### Takeaway

Tham chiếu thị giác là một cửa sổ đơn với gradient xanh, vùng drop nổi bật và kết quả dạng hàng. Bố cục được xem từ ảnh marketing, không phải quan sát tương tác với app đang chạy. [Ảnh chính thức](https://tinypng.app/wp-content/uploads/2021/04/hero.png)

### Cited Findings

- Điều phối viên đã xem ảnh chính thức qua CUA và báo lại: gradient xanh dương ở dưới trái sang teal/xanh lá ở trên phải; panda và tên tinyPNG.App căn giữa; vùng drop có đường viền; hàng kết quả hiện dung lượng gốc gạch ngang cùng dung lượng nén. Đây là quan sát hình ảnh từ nhóm nghiên cứu, không phải xác minh behavior. [Ảnh gốc của tác giả](https://tinypng.app/wp-content/uploads/2021/04/hero.png)
- Các control chức năng cần hiện diện theo tài liệu là overwrite, watch folder, resize method và width/height. Tài liệu không công bố bố cục chính xác của các panel cài đặt. [Usage](https://tinypng.app/usage/)
- Output API chỉ khả dụng 8 giờ; việc tải/lưu bền vững nên diễn ra trong job. Quy định lưu ảnh tối đa 48 giờ trong Terms là chính sách retention, không kéo dài thời hạn URL output. [HTTP API](https://tinypng.com/developers/reference), [Tinify Terms](https://tinypng.com/terms)

### Inferences

Đề xuất đặc tả UI native, **không phải danh sách màn hình đã được quan sát của app gốc**:

1. Cửa sổ chính giữ gradient và dropzone; thêm lựa chọn file bằng `Open` để người dùng keyboard/VoiceOver thao tác được. Mỗi hàng có filename, trạng thái, kích thước trước/sau và lỗi có hành động retry khi thích hợp.
2. Settings tách API key, output, resize, watcher và S3. Key phải che mặc định; hiển thị rõ trạng thái “chưa cấu hình” trước khi gửi ảnh. Không đưa key vào vùng kết quả hoặc log.
3. Queue có trạng thái phân biệt waiting/uploading/processing/downloading/saving/succeeded/failed/cancelled. Hủy chỉ tác động job còn chạy; việc đã tính compression trên dịch vụ không nên bị mô tả là đã hoàn tác.
4. Watch folder hiển thị chính xác folder, recursive hay không và trạng thái đang theo dõi; có thao tác dừng. Trong bản mới, lỗi quyền truy cập không được diễn đạt thành “folder trống”.
5. Kiểm tra accessibility: toàn bộ control có accessible name; focus order rõ; status đọc được bằng VoiceOver; không dùng màu hoặc gạch ngang làm nguồn thông tin duy nhất; thử tăng cỡ chữ và Reduce Motion. Đây là tiêu chí acceptance của bản mới.

### Gaps

- Chưa có số đo đáng tin cậy cho kích thước cửa sổ, font, màu hex, padding, radius hoặc layout ở các trạng thái khác nhau. Không ghi nhận con số ước lượng thành thông số của bản gốc.
- Chưa xem screenshot riêng cho API setup, S3, watch/resize mở rộng, lỗi hoặc first-run. Nếu cần pixel parity, phải bổ sung các trạng thái này trước khi duyệt UI.
- Môi trường nghiên cứu phụ không có browser CUA khả dụng; fetch ảnh bằng web không thành công, shell không resolve domain. Không vượt qua hạn chế này và không tuyên bố đã kiểm thử native UI.
- Chưa có xác nhận thực nghiệm về VoiceOver/keyboard của app cũ. Các đề xuất accessibility ở trên là yêu cầu mới, không phải audit kết luận về chất lượng app tham chiếu.
