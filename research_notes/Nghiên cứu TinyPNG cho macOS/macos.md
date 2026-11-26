# Kiến trúc và phát hành app macOS

Ngày kiểm tra: 2026-11-26, Asia/Tokyo. Ghi chú dành cho app macOS tái tạo workflow tinyPNG.App. Hiện trạng workspace do coordinator cung cấp: Swift command line tools 6.4 có sẵn; `xcodebuild` báo thiếu full Xcode. Đây là điều kiện của máy hiện tại, không phải yêu cầu chung của SwiftUI.

## 1. Kiến trúc nào phù hợp và quản lý file thế nào?

### Takeaway

Đề xuất SwiftUI cho UI, AppKit cho tích hợp macOS, core Swift dùng chung với CLI. Đây là quyết định theo phạm vi chỉ macOS và toolchain hiện có; không phải kết luận rằng framework khác không đáp ứng được.

### Cited Findings

- Swift đi kèm SwiftPM; manifest `Package.swift`, executable/library targets và test targets cho phép tách module. CLI chính thức dùng `swift build` và `swift run`. [Swift.org CLI guide](https://www.swift.org/getting-started/cli-swiftpm/)
- SwiftUI cung cấp `draggable` và `dropDestination` để nhận kiểu `Transferable`, có thể nhận tương tác từ app khác. [Apple drag and drop](https://developer.apple.com/documentation/swiftui/adopting-drag-and-drop-using-swiftui)
- `NSOpenPanel` hỗ trợ chọn file, directory, nhiều items và trả mảng URLs; trên macOS 10.15+ panel được vẽ ở process riêng. [Apple NSOpenPanel](https://developer.apple.com/documentation/appkit/nsopenpanel)
- App Sandbox giới hạn tài nguyên theo entitlements; bắt buộc với Mac App Store. Có network-client và user-selected read/write entitlements. [Apple App Sandbox](https://developer.apple.com/documentation/security/app-sandbox)
- Chọn thư mục qua panel mở rộng quyền sandbox vào thư mục con. Muốn truy cập lại sau relaunch, lưu security-scoped bookmark, resolve, xử lý stale và cân bằng start/stop access. Quyền POSIX hay bảo vệ hệ thống vẫn có thể từ chối. [Apple file access](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox)
- Keychain API lưu secrets trong database mã hóa, hỗ trợ kiểm soát app nào được truy cập. [Apple Keychain services](https://developer.apple.com/documentation/security/keychain-services)
- FSEvents báo thay đổi trên cây thư mục và phù hợp theo dõi nhiều file/phân cấp lớn; tài liệu archive cập nhật 2012, chỉ dùng cho nguyên lý API. [Apple FSEvents](https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/FSEvents_ProgGuide/Introduction/Introduction.html)
- Delegate `applicationShouldTerminateAfterLastWindowClosed` trả false giữ app và event loop sau khi đóng cửa sổ cuối. [Apple app lifecycle](https://developer.apple.com/documentation/appkit/nsapplicationdelegate/applicationshouldterminateafterlastwindowclosed(_:))

### Inferences

- Module đề xuất: `TinyCore` chứa Tinify HTTP, options, validation, atomic file output và credentials; GUI chứa queue/state/panels/watch; CLI gọi cùng core để tránh lệch semantics.
- File enumeration, I/O và mạng chạy ngoài main UI work; dùng `MainActor` cho state hiển thị. Queue tuần tự khớp bản tham chiếu; có cancel/pause/retry rõ ràng và không làm biến mất kết quả thành công.
- Với bản sandbox, file mở riêng lẻ chưa đảm bảo quyền tạo sibling output tùy quyền được cấp. Đích output nên được chọn qua panel hoặc chọn directory thay vì giả định mọi đường dẫn writable.
- Watcher cần baseline tránh tự xử lý toàn bộ thư mục ngay khi bật; debounce file copy chưa xong, snapshot size/mtime, loại hidden/symlink/output, cập nhật snapshot sau overwrite. Polling là phương án đơn giản, nhưng FSEvents hiệu quả hơn cho cây lớn; không gọi polling là event-based watcher.
- Đóng cửa sổ và Quit là hai hành vi khác nhau: app có thể tiếp tục watch khi đóng cửa sổ nếu lifecycle được cấu hình, nhưng không tiếp tục sau Quit hoặc bảo đảm hoạt động trong sleep. UI/README cần nói đúng điều này; startup/login helper là tính năng riêng nếu được yêu cầu.
- Lưu secrets trong Keychain; settings không bí mật có thể lưu JSON/UserDefaults. Giữ bundle identifier/signing identity ổn định để giảm vấn đề truy cập Keychain khi nâng cấp.

### Gaps

- Chưa chạy UI, VoiceOver, file panel, Finder drag/drop, watcher hoặc Keychain của bản app được xây. Các đề xuất chưa phải kết quả QA.
- Chưa chốt minimum macOS và kiến trúc binary. Cần dùng API availability phù hợp deployment target, không suy từ sample mới nhất.
- Chưa xác minh chia sẻ Keychain GUI/CLI khi ký bằng certificates hoặc sandbox entitlements thực tế; cần integration test trước phát hành.

## 2. Đóng gói local khác phát hành production thế nào?

### Takeaway

SwiftPM có thể build executable và script có thể tạo `.app` đúng cấu trúc, nhưng build thành công không chứng minh ứng dụng đủ điều kiện phân phối cho máy khác. Bản local cần được ghi rõ chưa Developer ID signed/notarized nếu chưa hoàn tất quy trình đó.

### Cited Findings

- Apple cho phép tự bố trí bundle khi không dùng Xcode: `Contents/Info.plist`, executable trong `Contents/MacOS`, tài nguyên trong `Contents/Resources`, thư viện trong `Contents/Frameworks`. Đặt sai vị trí có thể chạy development nhưng lỗi signing/notarization. [Apple bundle layout](https://developer.apple.com/documentation/bundleresources/placing-content-in-a-bundle)
- Notarization là quét tự động và kiểm tra code signing, không phải App Review. Ticket có thể staple và Gatekeeper dùng ticket khi launch. [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- Yêu cầu notarization gồm ký mọi executable bằng Developer ID, Hardened Runtime, secure timestamp, không `get-task-allow=true`. App lẫn CLI đều thuộc phạm vi runtime/signing. [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- `notarytool` thay `altool`; Apple cung cấp `notarytool`/`stapler` trong Xcode và có quy trình script. [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)

### Inferences

- Đường phát triển hiện tại: `swift test` → release build GUI và CLI → script bundle `.app` → launch trên máy hiện tại → ký ad hoc nếu cần cho local testing. Không mô tả ad hoc signature là Developer ID signature.
- Script nên kiểm tra mã thoát, executable path, Info.plist, kiến trúc và bundle version. Không thêm quy trình notarization tự động giả vờ thành công khi thiếu Apple account/certificate/full Xcode.
- Public source repo và binary production là hai deliverable khác nhau. Có thể công khai source/build instructions trước; không gắn nhãn release đã notarized chỉ vì app launch được trên máy build.
- Release trực tiếp tới người dùng: quyết định minimum macOS/arm64 hoặc universal, ký Developer ID các executable, runtime/timestamp, notarize, đọc log, staple, kiểm tra Gatekeeper và thử trên máy sạch. Mac App Store còn có sandbox/App Review riêng.
- Không yêu cầu user tắt Gatekeeper, xóa quarantine hoặc giảm bảo vệ hệ thống để che lỗi phân phối.

### Gaps

- Chưa có bằng chứng Developer ID certificate, Apple Developer account hoặc notarization credentials của chủ repo. Không khẳng định production signing đã có.
- Binary build bằng CLT không bao gồm tự động đầy đủ asset-catalog/archive/notarization workflow; phương án bundling cần kiểm tra bằng artifact thực tế.

## 3. So sánh framework và phương án nén offline ra sao?

### Takeaway

Giữ Tinify là engine để khớp kết quả của dịch vụ tham chiếu. Offline nên là lựa chọn engine riêng với validation chất lượng, phạm vi format và licensing riêng; không thay bằng re-encode rồi gọi là TinyPNG compression.

### Cited Findings

- Electron dùng kiến trúc Chromium nhiều process, main process chạy Node.js, mỗi BrowserWindow có renderer web; native operations đi qua main/IPC. [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- Tauri dùng `WKWebView` của hệ thống trên macOS; phiên bản WebKit gắn với OS update. [Tauri WebView versions](https://v2.tauri.app/reference/webview-versions/)
- ImageIO có tham số quality 0–1 khi ghi ảnh; ý nghĩa phụ thuộc format, 1 yêu cầu lossless nếu format hỗ trợ. [Apple ImageIO quality](https://developer.apple.com/documentation/imageio/kcgimagedestinationlossycompressionquality)
- pngquant là CLI/library nén PNG lossy qua palette quantization, giữ alpha; công bố GPL hoặc commercial license. [pngquant official](https://pngquant.org/)
- ImageOptim phối hợp nhiều optimizer và có tùy chọn lossy; project công bố GPL v2 trở lên, với một số component có license riêng. [ImageOptim official](https://imageoptim.com/mac)

### Inferences

| Phương án | Phù hợp | Đổi lại |
| --- | --- | --- |
| SwiftUI + AppKit | App chỉ macOS, file/Keychain/native controls | UI và tích hợp nền tảng khác cần viết riêng |
| Electron | Tái sử dụng web stack và đa nền tảng | Thêm Chromium/Node, IPC và cập nhật dependencies; cần đo resource thực tế |
| Tauri | UI web, Rust core, dùng WebView hệ thống | Thêm bridge/plugins/Rust; cần test WebKit trên macOS tối thiểu |
| Tinify API | Khớp engine dịch vụ, resize/crop/WebP/S3 | Mạng, credentials, quota/chi phí và upload ảnh |
| Offline optimizer | Không gửi ảnh ra ngoài, không quota API | Đóng gói engine, CPU/time, format/quality và license từng tool |

- Không có benchmark độc lập của app này, nên không gán số MB/RAM/startup hoặc tuyên bố framework nào nhanh nhất.
- ImageIO đủ cho re-encode/resize đơn giản nhưng không có bằng chứng nó tái tạo thuật toán hoặc mức giảm của Tinify. pngquant chỉ giải quyết PNG; JPEG/WebP cần engine khác.
- Nếu muốn offline về sau, giữ protocol compression engine để thay backend theo lựa chọn rõ ràng. Không bundle GPL/commercial component trước khi chọn license/phương án phân phối phù hợp.

### Gaps

- Chưa benchmark bộ ảnh đại diện, màu ICC, alpha, EXIF, orientation, CPU/RAM, thời gian và kích thước output giữa Tinify/offline.
- Không đưa kết luận pháp lý về tương thích license/App Store; các license nêu ở đây chỉ là điều nhà phát triển công bố và cần được đối chiếu trước distribution.
