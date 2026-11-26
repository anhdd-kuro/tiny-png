# Xây app TinyPNG native cho macOS

**Nên xây SwiftUI + AppKit, dùng Tinify API và core Swift chung cho GUI/CLI.** Đây là lựa chọn theo phạm vi macOS và toolchain hiện có. tinyPNG.App là client bên thứ ba của BetweenElements, khác dịch vụ Tinify vận hành API. Bản tham chiếu đã ngừng hỗ trợ macOS; app mới phải được kiểm chứng độc lập. Nghiên cứu phân biệt tính năng được công bố, quan sát screenshot và đề xuất triển khai. Chưa có thử nghiệm API/S3 bằng credentials thật. ([Tinify integrations](https://tinypng.com/third-party), [app tham chiếu](https://tinypng.app/))

Ngày khảo sát: **26/11/2026, Asia/Tokyo**. Giá và thông tin web phản ánh nguồn đọc tại ngày này, không xác nhận checkout hoặc binary cũ.

## Queue tuần tự là baseline, Crop còn chưa rõ

Tài liệu mô tả kéo PNG/JPG vào queue rồi xử lý lần lượt; “batch processing” vẫn nằm trong roadmap. Homepage bổ sung WebP, S3 và theo dõi subfolder. Vì vậy nhận nhiều file không chứng minh xử lý song song. ([Usage](https://tinypng.app/usage/), [homepage](https://tinypng.app/))

| Tính năng | Hợp đồng tham chiếu | Quyết định cho app macOS |
| --- | --- | --- |
| Kéo thả | PNG/JPG, queue tuần tự | Thêm chọn file cho keyboard; dùng chung pipeline |
| Lưu file | Bản sao `-tinified` hoặc overwrite | Mặc định bản sao; tránh collision |
| Resize | Fit/Crop/Scale/Cover; Scale chỉ width | Dùng tên API hiện hành; không tự đồng nhất Crop với Thumb |
| Output resize | `-resized-tinified` nếu không overwrite | Giữ quy tắc đặt tên |
| Watch folder | Ảnh mới, gồm subfolder | Chờ file ổn định, bỏ output tự tạo |
| CLI | `--file`, dùng overwrite đã lưu | Chia sẻ settings/core với GUI |
| WebP/S3 | Homepage liệt kê | Đặc tả rõ input/conversion và local/remote result |

**Yêu cầu bổ sung của chủ app:** vùng thả ảnh nổi ở góc màn hình và tự nén screenshot mới trên Desktop, kể cả khi cửa sổ chính đã đóng. Đây là phạm vi bắt buộc của app mới, chưa được xác minh là hành vi của tinyPNG.App gốc. Vùng thả cần nhận file/thư mục từ Finder mà không ép chuyển focus; vị trí góc phải cấu hình được.

Các hành vi công bố trong bảng dựa trên [Usage](https://tinypng.app/usage/) và [Free vs Pro](https://tinypng.app/). Các quyết định ở cột cuối là đề xuất. API có `scale`, `fit`, `cover`, `thumb`; không liệt kê `crop`. Nhãn Crop cũ **chưa có mapping được xác minh**. ([HTTP API](https://tinypng.com/developers/reference))

Screenshot marketing đã được điều phối viên xem: nền gradient xanh dương–teal, thương hiệu giữa cửa sổ, dropzone có viền, hàng kết quả gồm dung lượng trước/sau. Chưa chạy app gốc hoặc thấy toàn bộ settings/error states; chưa đủ căn cứ tuyên bố pixel parity. Bản mới nên giữ bố cục tham chiếu nhưng dùng artwork riêng; điều khoản không cho phép suy từ “tải miễn phí” thành quyền sao chép tài sản. ([Screenshot](https://tinypng.app/wp-content/uploads/2021/04/hero.png), [điều khoản app](https://tinypng.app/terms-of-use/))

## API quyết định chi phí và trạng thái lỗi

Tinify dùng HTTPS Basic Auth `api:KEY`. Upload binary qua `POST /shrink`, nhận URL output; GET tải ảnh, POST JSON biến đổi. Output khả dụng **8 giờ**. `scale` nhận một chiều; ba method còn lại nhận hai chiều. `Compression-Count` tính tháng UTC. Lỗi chính: 400 dữ liệu/options, 401 key, 404 output hết hạn, 415 format, 429 quota hoặc tốc độ, 5xx tạm thời. Với 429, đọc message; không có `Retry-After`. ([HTTP API](https://tinypng.com/developers/reference))

API hỗ trợ PNG, JPEG, WebP, AVIF, JPEG XL; HEIC được chuyển JPEG. Giới hạn công bố là **500 MB, 256 megapixels**, mỗi cạnh tối đa 150.000 pixel. Capability của dịch vụ không chứng minh app cũ hỗ trợ mọi format. ([Developer API](https://tinypng.com/developers), [HTTP API](https://tinypng.com/developers/reference))

Giá: **500 operations/tháng miễn phí**, 9.500 tiếp theo **USD 0,009**, phần vượt 10.000 **USD 0,002** mỗi operation. Pay-per-compression không phí subscription hoặc mức tối thiểu; có prepaid bundles. Ví dụ 2.000 compressions là USD 13,50. ([API pricing](https://tinypng.com/pricing/api))

Upload thường tính một operation; cùng ảnh/key trong 8 giờ không tính lại. Một request gộp resize/convert/store tính thêm một; download và preserve metadata không tính. Limit dùng chung account, count theo key. Suy ra tải bản đã resize và store S3 bằng hai output requests có thể tốn thêm so với request gộp. Không hiển thị `500 - count` như quota toàn account. ([Node.js API](https://tinypng.com/developers/reference/nodejs))

SDK chính thức kiểm tra key bằng POST rỗng, chấp nhận ClientError hoặc 429. Vì thế key hợp lệ và quota còn là hai trạng thái khác nhau. Đề xuất pause queue khi lỗi key/quota, giữ kết quả thành công và retry theo giai đoạn; lỗi tải sau upload không nên bắt upload lại vô điều kiện. ([SDK source](https://raw.githubusercontent.com/tinify/tinify-nodejs/master/src/tinify.ts))

## S3 gửi AWS credentials qua Tinify

Store cần access key, secret, region và `bucket/path/file`; mặc định `public-read`, có lựa chọn `no-acl`. Cần `PutObject`, thêm `PutObjectAcl` nếu dùng ACL. Đây là luồng **app → Tinify → S3**, không phải AWS secret chỉ dùng trên máy. ([S3 documentation](https://tinypng.com/developers/reference/nodejs#saving-to-amazon-s3))

Bucket mới mặc định ACL disabled; AWS khuyến nghị giữ trạng thái đó. App nên dùng `no-acl` và IAM giới hạn đúng bucket/prefix, không tự đổi public access. Khi local save thành công nhưng S3 thất bại, cần trạng thái riêng để người dùng giữ file và hiểu điều gì cần retry. ([AWS Object Ownership](https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html))

Tinify công bố xóa ảnh trong tối đa **48 giờ**, request logs trong **31 ngày**; logs có thể chứa IP, API key và fingerprint file. Thời hạn lưu khác thời hạn URL output. Không mô tả app là offline hoặc hứa xóa toàn bộ sau 8 giờ. ([Tinify terms](https://tinypng.com/terms))

Đề xuất lưu secrets trong Keychain, không đưa vào settings JSON, repo hay logs. Keychain là database mã hóa cho dữ liệu bí mật; nó bảo vệ bản lưu cục bộ, không thay đổi việc gửi credentials trong request đã bật. ([Apple Keychain](https://developer.apple.com/documentation/security/keychain-services))

## SwiftUI phù hợp macOS, offline là engine riêng

SwiftPM có executable/library/test targets; SwiftUI hỗ trợ drag/drop; `NSOpenPanel` chọn nhiều file/thư mục. Đề xuất core chứa HTTP, validation, output và credentials; GUI quản lý queue/watch; CLI gọi cùng core. Mạng và file enumeration không nên chặn UI. ([SwiftPM](https://www.swift.org/getting-started/cli-swiftpm/), [SwiftUI](https://developer.apple.com/documentation/swiftui/adopting-drag-and-drop-using-swiftui), [NSOpenPanel](https://developer.apple.com/documentation/appkit/nsopenpanel))

| Lựa chọn | Lợi ích với phạm vi này | Chi phí thiết kế |
| --- | --- | --- |
| SwiftUI/AppKit | Tích hợp native macOS | UI nền tảng khác cần viết riêng |
| Electron | Tái dùng web stack | Chromium, Node và IPC |
| Tauri | Web UI, system WebView | Rust/bridge và test WebKit theo OS |

Electron dùng main Node process và renderer Chromium; Tauri dùng `WKWebView` của macOS. Chưa có benchmark app này, nên không gán số RAM hay khẳng định framework nhanh nhất. ([Electron](https://www.electronjs.org/docs/latest/tutorial/process-model), [Tauri](https://v2.tauri.app/reference/webview-versions/))

Offline cần engine riêng: ImageIO có quality setting nhưng không chứng minh tương đương Tinify; pngquant nén PNG lossy và công bố GPL/commercial license. Cần đo chất lượng, alpha, màu và từng format trước khi thêm lựa chọn offline. ([ImageIO](https://developer.apple.com/documentation/imageio/kcgimagedestinationlossycompressionquality), [pngquant](https://pngquant.org/))

Với sandbox, lưu security-scoped bookmarks để dùng lại thư mục sau relaunch. Watcher cần baseline, debounce và loại output để tránh loop; FSEvents hỗ trợ cây thư mục lớn. Bản local được định hướng macOS 14+, unsandboxed, giữ process khi đóng cửa sổ chính và có menu bar để mở lại/quản lý watch/Quit. **Đóng cửa sổ vẫn theo dõi; Quit dừng theo dõi.** Không có login item hoặc daemon tự chạy sau reboot. Đây là hợp đồng triển khai theo yêu cầu mới, chưa phải bằng chứng QA. ([Apple file access](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox), [FSEvents](https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/FSEvents_ProgGuide/Introduction/Introduction.html))

## Acceptance cần tách bản local và release

Apple cho phép tự bố trí `.app` ngoài Xcode: Info.plist trong `Contents`, executable trong `Contents/MacOS`, resources trong `Contents/Resources`. SwiftPM build được không chứng minh bundle hoặc distribution hợp lệ. Bản local ad hoc signed chưa phải Developer ID release. ([Bundle layout](https://developer.apple.com/documentation/bundleresources/placing-content-in-a-bundle))

Production cần Developer ID, Hardened Runtime, timestamp, notarization và staple ticket; notarization không phải App Review. Chưa có bằng chứng certificate/account hoặc kiểm thử trên máy sạch. Không khắc phục bằng hướng dẫn tắt Gatekeeper. ([Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution))

**Acceptance đề xuất:** unit/mock tests kiểm tra auth, payload, lỗi/quota, host output, collision và overwrite; filesystem tests kiểm tra recursive watch, file chưa ổn định, symlink và loop. UI cần thử keyboard/VoiceOver, drop/chọn file, settings, lỗi và trạng thái queue. Với yêu cầu mới, đóng cửa sổ chính rồi tạo screenshot trên Desktop, xác nhận tự enqueue sau khi file ổn định, không xử lý lặp output; thử drop ở từng góc, menu bar mở lại cửa sổ và Quit dừng process. Integration cần key thật cùng ảnh kiểm thử và bucket riêng, xác nhận local/S3, dimensions, extension và usage. Chỉ đánh dấu từng phần hoàn tất khi có bằng chứng tương ứng; nghiên cứu này không thay thế các kiểm tra đó.
