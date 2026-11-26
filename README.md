# Tiny PNG offline cho macOS

Nén ảnh trên máy bằng [sharp](https://sharp.pixelplumbing.com/) và [libvips](https://www.libvips.org/), trong desktop app Electron. Không dùng TinyPNG/Tinify API, không cần API key, không upload ảnh và không tích hợp S3. App dùng thuật toán khác dịch vụ TinyPNG nên kết quả dung lượng/chất lượng có thể khác.

## Chạy và build

Yêu cầu macOS và Node.js 24 LTS để phát triển. App đã đóng gói không yêu cầu người dùng cài Node.js hoặc thư viện riêng. Build theo kiến trúc máy hiện tại, không tạo Universal Binary.

```bash
npm ci
npm start
```

Đóng gói app:

```bash
npm run build
open "dist/Tiny PNG.app"
```

Build tạo `dist/Tiny PNG.app`, gồm Electron, sharp và thư viện native cần thiết. Script ký ad-hoc và kiểm tra chữ ký cho bản local; chưa có Developer ID/notarization cho phân phối công khai. Electron download cache mặc định nằm trong thư mục tạm hệ thống, có thể đổi bằng `ELECTRON_CACHE`. Cài dependency và build lần đầu cần mạng; chức năng nén và UI của app chạy offline.

## Dùng app

1. Thả ảnh vào cửa sổ chính hoặc vùng thả nổi ở góc trên bên phải. Có thể chọn cả thư mục để quét đệ quy.
2. Mở Cài đặt để chọn quality, định dạng đầu ra, resize hoặc thư mục lưu. Mặc định giữ ảnh gốc.
3. Chọn **Theo dõi thư mục** và chọn Desktop để tự nén screenshot mới lưu tại đó. Nếu macOS lưu screenshot nơi khác, chọn đúng thư mục đó.

Vùng thả nổi có thể bật/tắt và đổi sang một trong bốn góc. Nhấn vùng thả để mở cửa sổ chính. Đóng cửa sổ vẫn giữ app và watcher chạy ở menu bar; chọn **Thoát Tiny PNG** hoặc `⌘Q` để dừng. Không cài background service hoặc tự khởi động khi đăng nhập.

Watcher bỏ qua ảnh có sẵn lúc bắt đầu, theo dõi ảnh mới/thay đổi trong thư mục con và chờ file ghi ổn định trước khi nén. Watcher áp dụng cho mọi ảnh được hỗ trợ, không chỉ screenshot. Khi đã bật, lựa chọn thư mục và trạng thái theo dõi được lưu để tiếp tục trong lần chạy app sau; dùng **Dừng theo dõi** để tắt.

## Xử lý ảnh

- Nhận PNG, JPG/JPEG, WebP và AVIF tĩnh; bỏ qua symlink và file ẩn khi quét thư mục. Ảnh động bị từ chối để tránh mất frame. Giới hạn đầu vào: 500 MB và 256 megapixel.
- Quality từ 1 đến 100, mặc định 80. PNG dùng palette; JPEG dùng mozjpeg. Nén có thể mất một phần thông tin màu/chi tiết để giảm dung lượng. Chuyển ảnh trong suốt sang JPEG dùng nền trắng.
- Giữ định dạng gốc hoặc chuyển sang PNG, JPEG, WebP, AVIF. Resize có Fit, Cover, Scale và Thumb; Scale theo width, Thumb dùng attention crop. Không upscale. Kích thước resize tối đa 32.768 px mỗi chiều và 256 megapixel.
- Lưu bản sao với hậu tố `-tinified`, hoặc `-resized-tinified` khi resize; nếu tên trùng thì thêm số. Overwrite chỉ áp dụng khi giữ cùng định dạng. File gốc thay đổi trong lúc nén sẽ không bị ghi đè.
- Nếu giữ định dạng/kích thước và kết quả không nhỏ hơn, app giữ file gốc và báo không cần nén thêm. Queue xử lý lần lượt; pause chờ ảnh hiện tại hoàn tất. Xóa hàng trong danh sách không xóa ảnh trên ổ đĩa.

Thiết lập nằm trong thư mục `userData` của Electron, tại file `settings.json`. Bản offline không đọc API key hoặc credentials của bản Swift thử nghiệm trước đây. UI chỉ tải file đóng gói; truy cập HTTP/HTTPS/WebSocket từ Electron session bị chặn.

## Kiểm tra

```bash
npm test
npm run build
```

Test dùng ảnh tạo trong thư mục tạm để kiểm tra compressor và watcher, không dùng dịch vụ cloud. CI tại `.github/workflows/macos.yml` chạy `npm ci`, `npm test`, build và lưu app ZIP artifact trên macOS. Kết quả build/test cần báo từ lần chạy thực tế; build thành công chưa xác minh đầy đủ drag-and-drop, VoiceOver hoặc Gatekeeper trên máy đích.

## Cấu trúc và quyết định hiện tại

- `src/main.cjs`: Electron main process, queue, settings và menu bar.
- `src/preload.cjs`: bridge IPC giới hạn cho renderer; renderer không có Node integration.
- `src/core/`: nén bằng sharp và folder watcher bằng chokidar.
- `src/renderer/`: cửa sổ chính, Settings và vùng thả nổi.
- `scripts/build-app.cjs`: đóng gói macOS, giữ production/native dependencies và ký ad-hoc.

Các file trong `reports/` và `research_notes/Nghiên cứu TinyPNG cho macOS/` là nghiên cứu lịch sử của phương án dùng Tinify/Swift trước khi yêu cầu đổi sang offline. **Quyết định hiện tại là Electron + sharp/libvips, nén local, không API, không S3.** Không dùng tài liệu lịch sử đó làm đặc tả kiến trúc đang chạy.

Đây là triển khai độc lập lấy giao diện tinyPNG.App làm tham chiếu, không liên kết với Tinify hoặc BetweenElements, không dùng source hay artwork của họ. App icon là hình học tự vẽ. Giữ các thông báo bản quyền/license của Electron, sharp, libvips và các dependency khi phân phối.
