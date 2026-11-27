# Tiny Assets cho macOS

Nén ảnh trên máy bằng sharp/libvips, trong desktop app Electron. App viết bằng TypeScript 7, giao diện React + StyleX. Không dùng TinyPNG/Tinify API, không cần API key. S3 là tùy chọn và mặc định tắt. Thuật toán khác dịch vụ TinyPNG nên kết quả dung lượng/chất lượng có thể khác.

## Homebrew

```bash
brew install --cask anhdd-kuro/tap/tiny-assets
```

Nếu Homebrew yêu cầu trust cask từ tap cá nhân, chạy `brew trust --cask anhdd-kuro/tap/tiny-assets` rồi cài lại. Chỉ cần trust cask này; không cần trust toàn bộ tap.

Cask phát hành cho Apple Silicon, macOS 13 trở lên. Source và release nằm tại [repo cá nhân](https://github.com/anhdd-kuro/tiny-png); tên hiển thị của app là **Tiny Assets**.

## Chạy và build

Toolchain được pin trong project: Node.js 26.13.1 LTS, pnpm 12.23.0, TypeScript 7.0.2. Nếu dùng nvm, chạy `nvm use` để chọn phiên bản trong `.nvmrc`. App đã đóng gói không yêu cầu người dùng cài Node.js/pnpm riêng.

Node 26 dùng cho build/test của project. Electron 45.5.0 nhúng Node 24.22.3 cho main process; esbuild target `node24.22` để phù hợp runtime này. Thay Node trên máy không thay runtime đã nhúng trong app.

```bash
pnpm install --frozen-lockfile
pnpm start
```

Đóng gói app theo kiến trúc máy hiện tại:

```bash
pnpm build
pnpm install:app
```

`pnpm build` chạy typecheck và `pnpm lint`, compile main/preload và build renderer trước khi tạo `dist/Tiny Assets.app`. Bundle giữ sharp/libvips, chokidar và Koffi cùng native dependencies. Script kiểm tra các dependency này bằng runtime Electron đã đóng gói, ký ad-hoc và verify chữ ký. Bản local chưa có Developer ID/notarization cho phân phối công khai; không phải Universal Binary.

React/StyleX và AWS SDK được bundle khi build, không chép thêm các package này vào runtime. Full license/NOTICE nằm trong `build/licenses`; build dừng nếu thiếu license của dependency đã bundle. Packager bỏ type declarations, sourcemap và source C/C++ dùng lúc phát triển; giữ loader JS, native binary và license. Locale Electron chỉ giữ English, Tiếng Việt, 日本語 cùng các biến thể, có English fallback; dữ liệu ICU và codec ảnh được giữ nguyên.

`pnpm install:app` stage và kiểm tra chữ ký trước khi cập nhật `~/Applications/Tiny Assets.app`, rồi mở app. Chỉ dừng/thay các bundle có ID `dev.kuro.tinypng`; tên cũ `tiny assets.app` và `Tiny PNG.app` cùng ID được di chuyển trong transaction. Nếu cài hoặc khởi chạy lỗi, script khôi phục bundle cũ.

Tên hiển thị đổi thành **Tiny Assets**, nhưng bundle ID và thư mục dữ liệu `~/Library/Application Support/Tiny PNG` được giữ nguyên để bảo toàn settings, watcher và encrypted credentials. Installer không xóa ảnh hoặc dữ liệu người dùng.

Cài dependency/build lần đầu cần mạng; chức năng nén và UI chạy offline. Electron cache mặc định nằm trong thư mục tạm hệ thống, đổi bằng `ELECTRON_CACHE`. `pnpm-workspace.yaml` dùng `nodeLinker: hoisted` để packager thu thập dependency đầy đủ; store project `.pnpm-store/` được loại khỏi Git và app bundle.

## Chữ ký ứng dụng

Build dùng chữ ký **ad-hoc**, cùng loại đã kiểm tra ở AI Account Switcher; không yêu cầu thêm Developer ID certificate. Chữ ký nằm trong bundle và không mất sau reboot. Khi bundle thay đổi sau update, code hash đổi nên macOS/Keychain vẫn có thể hỏi lại quyền. Đây không phải Developer ID signing hoặc notarization.

## Dùng app

1. Thả ảnh vào cửa sổ chính hoặc vùng thả nổi mặc định ở góc trên bên phải. Có thể chọn cả thư mục để quét đệ quy.
2. Mở Cài đặt để chọn quality, định dạng đầu ra, resize hoặc thư mục lưu. Mặc định giữ ảnh gốc.
3. Chọn **Theo dõi thư mục** và chọn Desktop để tự nén screenshot mới lưu tại đó. Nếu macOS lưu screenshot nơi khác, chọn đúng thư mục đó.

Cài đặt hỗ trợ English, Tiếng Việt và 日本語. Vùng thả nổi có hai chế độ: luôn hiện, hoặc chỉ hiện khi đang kéo file đến gần vị trí đã chọn. Chọn một trong bốn góc hoặc **Giữa phía trên (dưới notch)**. Có thể tắt vùng thả. Nhận biết kéo file dùng API macOS qua Koffi trong process; không có Swift helper/subprocess.

Nền chính mặc định là gradient xanh dương–xanh lá; Cài đặt cho chọn **Chuyển sắc / Đơn sắc**. Khi có ảnh, queue thay vùng thả; vẫn có thể thả thêm ảnh vào vùng nội dung hoặc dùng nút + trên toolbar/`⌘O`. **Glass** mặc định tắt, có slider độ đậm nền 20–100%; chỉ nền thay đổi opacity, chữ/control và vùng nội dung giữ tương phản rõ. Cửa sổ hỗ trợ native macOS vibrancy qua Electron; đây không phải Liquid Glass. Khi hệ thống yêu cầu giảm độ trong suốt hoặc tăng tương phản, app tắt vibrancy/blur và dùng nền đặc ở các vùng chức năng; Reduce Motion dừng spinner chuyển động.

Cài đặt mở trong cửa sổ macOS riêng, dùng light/dark theo hệ thống. `⌘,` mở hoặc đưa cửa sổ này lên trước; `⌘W` hoặc Escape đóng cửa sổ Cài đặt. Pane đang chọn được giữ khi đóng/mở lại trong cùng lần chạy app. `⌘O` chọn ảnh từ cửa sổ chính.

Mức nén có ba lựa chọn: **Ưu tiên chất lượng · Cân bằng · Ưu tiên giảm dung lượng**. Resize tách riêng thành **Theo tỷ lệ (%)** và **Nhập kích thước (px)**; 50% đổi ảnh 2000 × 1000 thành 1000 × 500. App không upscale.

Thông báo hoàn tất dùng native macOS Notification trong main process, không dùng web permission. App gộp kết quả theo đợt và không đưa tên/path ảnh vào notification; có thể tắt trong Cài đặt. Quyền thông báo do macOS quản lý. Bản cài ký ad-hoc theo cùng cách với app AI Account Switcher được tham chiếu; khởi động lại máy không đổi chữ ký, nhưng một bản build mới có thể khiến macOS hỏi lại quyền.

**Cài đặt → Lịch sử** lưu tối đa 500 hoạt động trên máy: file vào queue, kết quả nén và dung lượng trước/sau, bật/dừng watcher, upload S3 và trạng thái yêu cầu thông báo. Lịch sử vẫn còn sau khi mở lại app; xóa lịch sử không xóa ảnh. Không ghi credentials hay nội dung ảnh. Hoạt động trước khi cập nhật chưa có lịch sử để khôi phục.

**Cài đặt → Tự động hóa → Trạng thái thông báo** đọc trực tiếp quyền, kiểu banner, âm thanh và Notification Center bằng API công khai của macOS. Log riêng tại `~/Library/Application Support/Tiny PNG/diagnostics/notifications.json` giữ tối đa 200 sự kiện: mỗi request có ID, phản hồi native/lỗi gốc, kiểm tra có mặt trong Notification Center và signing identity khi khởi động. File có quyền `0600`, không chứa nội dung ảnh hoặc AWS credentials. Nút **Xem file log** mở vị trí này trong Finder. Thay đổi signing identity được ghi nhận để đối chiếu qua update; không kết luận quyền đã mất chỉ vì code hash đổi. macOS không cung cấp bằng chứng banner đã nhìn thấy, nên log phân biệt rõ request được nhận và thông báo đang lưu trong Notification Center.

Trong **Cài đặt → Tự động hóa**, dùng **Thử thông báo** để kiểm tra và mở cài đặt thông báo của macOS. App ghi riêng yêu cầu, phản hồi `show`/`failed` của Electron và trường hợp chưa có phản hồi sau 10 giây; trạng thái tiếp nhận không bảo đảm banner hiện khi Focus hoặc tùy chọn hệ thống đang chặn.

Vùng thả ở giữa phía trên, gần notch, có kích thước 320 × 80 px và hiệu ứng blur/fade/scale nhẹ khi hiện hoặc ẩn. Hiệu ứng này cũng áp dụng cho cả bốn góc. Reduce Motion tắt chuyển động; Reduce Transparency và Increase Contrast tắt blur. Vùng đang ẩn chuyển sang click-through ngay để không giữ thao tác kéo thả của app phía sau.

Đóng cửa sổ vẫn giữ app và watcher chạy ở menu bar; chọn **Thoát Tiny Assets** hoặc `⌘Q` để dừng. Không cài background service hoặc tự khởi động khi đăng nhập.

Watcher bỏ qua ảnh có sẵn lúc bắt đầu, nhận ảnh mới/thay đổi trong thư mục con và chờ file ghi ổn định trước khi nén. Watcher áp dụng cho mọi ảnh được hỗ trợ, không chỉ screenshot. Lựa chọn thư mục và trạng thái bật được lưu để tiếp tục ở lần chạy app sau; dùng **Dừng theo dõi** để tắt.

## Xử lý ảnh

- Nhận PNG, JPG/JPEG, WebP và AVIF tĩnh; bỏ qua symlink và file ẩn khi quét thư mục. Ảnh động bị từ chối để tránh mất frame. Giới hạn đầu vào: 500 MB và 256 megapixel.
- Quality mặc định 80. PNG dùng palette, JPEG dùng mozjpeg; nén có thể mất thông tin màu/chi tiết để giảm dung lượng. Chuyển ảnh trong suốt sang JPEG dùng nền trắng.
- Giữ định dạng gốc hoặc chuyển sang PNG, JPEG, WebP, AVIF. Resize có Fit, Cover, Scale và Thumb; Scale theo width, Thumb dùng attention crop. Không upscale. Tối đa 32.768 px mỗi chiều và 256 megapixel.
- Lưu bản sao với hậu tố `-tinified`, hoặc `-resized-tinified` khi resize; nếu tên trùng thì thêm số. Overwrite chỉ áp dụng khi giữ cùng định dạng. Source thay đổi trong lúc nén sẽ được kiểm tra trước khi overwrite.
- Nếu giữ định dạng/kích thước và kết quả không nhỏ hơn, app giữ file gốc và báo không cần nén thêm. Queue xử lý lần lượt; pause chờ ảnh hiện tại hoàn tất. Xóa hàng trong danh sách không xóa ảnh trên ổ đĩa.

Thiết lập nằm trong thư mục `userData` của Electron, tại `settings.json`. App không đọc API key/credentials của bản thử nghiệm Tinify trước đây. UI chỉ tải file đóng gói; truy cập HTTP/HTTPS/WebSocket từ Electron session bị chặn.

## S3 tùy chọn

S3 mặc định tắt. Để bật, lưu region, bucket/prefix và AWS credentials trong Cài đặt rồi bật công tắc S3. Credentials được mã hóa bằng Electron `safeStorage` trên macOS và không đưa vào settings JSON hoặc gửi trả renderer. App upload trực tiếp lên Amazon S3 bằng AWS SDK, sau khi nén và lưu local; không gửi ảnh hoặc credentials qua Tinify.

Chỉ cấp quyền `s3:PutObject` cho bucket/prefix cần dùng. App không đặt public ACL, không đổi bucket policy và không ghi đè object đã tồn tại. Nếu upload lỗi, file local vẫn giữ nguyên; Thử lại chỉ upload lại file đó. File đã bị thay đổi sau khi nén sẽ không được upload như kết quả cũ.

## CLI

CLI dùng chung engine và cài đặt nén của GUI; không lưu thay đổi từ các cờ trở lại GUI.

```bash
pnpm compress --help
pnpm compress --file ./screenshot.png --no-overwrite
pnpm compress --resize fit --width 1200 --height 800 --format webp ./photos
```

CLI trong bundle không cần Node cài riêng:

```bash
ELECTRON_RUN_AS_NODE=1 "$HOME/Applications/Tiny Assets.app/Contents/MacOS/Tiny Assets" \
  "$HOME/Applications/Tiny Assets.app/Contents/Resources/app/build/cli/index.cjs" --help
```

`--overwrite` thay file gốc; CLI kế thừa overwrite từ GUI nên dùng `--no-overwrite` khi cần giữ nguồn. Hỗ trợ `--language en|vi|ja`, `--quality`, `--output`, `--webp`, `--no-resize`, nhiều `--file` và `--` trước đường dẫn bắt đầu bằng dấu gạch ngang. Exit code: 0 thành công, 1 có lỗi xử lý/không có ảnh, 2 sai đối số.

CLI không tự upload theo công tắc S3 của GUI: chỉ upload khi có `--s3`. Bucket/region/prefix lấy từ cấu hình GUI; credentials lấy từ `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` và `AWS_SESSION_TOKEN` nếu có. CLI không đọc encrypted credentials của GUI và không nhận secret qua đối số.

## Kiểm tra

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:native
pnpm build
pnpm qa:ui
```

Typecheck dùng TypeScript 7 với strict mode. Tests dùng ảnh/thư mục tạm cho compressor, queue, settings, CLI và watcher; S3 dùng transport giả, không gọi AWS. `test:native` cần macOS desktop session có quyền WindowServer/pasteboard; chỉ đọc loại dữ liệu kéo và trạng thái chuột, không đọc nội dung clipboard. CI chạy pnpm frozen install, test, build và lưu app ZIP artifact trên macOS. Build thành công chưa thay thế việc kiểm tra drag-and-drop, VoiceOver, chế độ gần góc và Gatekeeper trên máy đích.

`qa:ui` dùng Playwright chạy Electron với profile, bundle ID QA (`dev.kuro.tinypng.qa`) và ảnh thử riêng trong `tmp/ui-qa/`, chụp renderer và kiểm tra queue, file drop, folder watch, ba ngôn ngữ, nền/Glass và cửa sổ Settings. File picker được thay bằng lựa chọn fixture; engine nén và watcher chạy thật. QA cũng kiểm tra lịch sử watcher/kết quả, bản dịch, xác nhận xóa và lifecycle thông báo bằng backend giả. Đặt `TINY_ASSETS_QA_NATIVE_NOTIFICATIONS=1` để yêu cầu thêm một thông báo macOS thật và ghi phản hồi; không tự kết luận banner đã hiện. Screenshot không bao gồm native frame/vibrancy của macOS; kiểm tra riêng phần đó khi review visual. Muốn đối chiếu bản cài thật, thoát Tiny Assets rồi chạy `pnpm diagnose:notifications`: script mở đúng `/Applications/Tiny Assets.app`, giữ nguyên chữ ký/profile, đọc quyền native, gửi một thông báo thử, lưu report riêng tại `tmp/official-notification-diagnostics/result.json`, giữ app 10 giây để quan sát banner rồi mở lại bình thường. Nó không đổi settings hay đọc AWS credentials. Không dùng kết quả của QA làm bằng chứng bản cài thật đã hiện banner. Có thể đặt `TINY_ASSETS_ELECTRON_EXECUTABLE` để dùng Electron binary có sẵn, `TINY_ASSETS_QA_OUTPUT` để đổi thư mục ảnh, hoặc `TINY_ASSETS_QA_VIDEO=1` sau khi cài `pnpm exec playwright install ffmpeg` để ghi video.

Sau `pnpm build`, chạy `TINY_ASSETS_QA_PACKAGED=1 pnpm qa:ui` để kiểm tra binary Electron và dependency thực của bundle đã prune. Chế độ này tạo bản sao QA tạm với profile riêng, rồi xóa bản sao và gỡ đăng ký khi xong; không cài bản dev vào Applications hoặc sửa profile người dùng.

Lint dùng các rule chính thức của StyleX để kiểm tra style, shorthand và thuộc tính xung đột. Với cấu hình hiện tại, `border` shorthand không được compile thành CSS; điều này từng làm button, fieldset và dialog hiện viền mặc định của Chromium. Dùng `borderWidth`, `borderStyle`, `borderColor` và các longhand theo cạnh; giữ reset cho native form controls. `pnpm lint` là điều kiện bắt buộc trước khi build/phát hành.

## Cấu trúc

- `src/main/index.ts`: bootstrap Electron; `src/main/features/` giữ compression/queue, folder watch, settings, app window và corner drop theo feature.
- `src/preload/index.ts`: bridge IPC giới hạn; `src/shared/contracts.ts` là chủ sở hữu duy nhất của protocol và kiểu dữ liệu chung.
- `src/renderer/`: React TSX và StyleX theo feature. CSS thuần chỉ dành cho global reset. `src/shared/locales.ts` giữ ba bộ bản dịch.
- `scripts/build.ts` + `vite.config.ts`: esbuild tạo main/preload CJS; Vite compile renderer và StyleX CSS. JavaScript sinh ra chỉ nằm trong `build/`, không commit.
- `scripts/build-app.ts`: đóng gói output đã compile và production dependencies vào app macOS; loại source/test/research khỏi bundle.

`src/cli/` là entry CLI; `src/main/features/s3/` quản lý upload tùy chọn; `src/main/platform/` giữ chính sách cửa sổ và encrypted credential storage.

`src/main/features/settings/window.ts` quản lý cửa sổ Cài đặt riêng; renderer có ba entry cho main, Settings và floating drop. [Quyết định thiết kế](src/renderer/docs/native-design.md) ghi nguồn tham khảo, phạm vi áp dụng skill và giới hạn bằng chứng visual.

Các file trong `reports/` và `research_notes/Nghiên cứu TinyPNG cho macOS/` là tài liệu lịch sử của các phương án Tinify/Swift hoặc JavaScript trước đây. **Kiến trúc hiện tại: TypeScript 7 + React/StyleX + Electron, engine sharp/libvips offline, Node 26 LTS và pnpm.** Không dùng tài liệu lịch sử làm đặc tả kiến trúc đang chạy.

Đây là triển khai độc lập lấy tinyPNG.App làm tham chiếu, không liên kết với Tinify hoặc BetweenElements và không dùng source/artwork của họ. App icon dùng đầu khủng long xanh vui nhộn được tạo riêng cho sản phẩm; pipeline TypeScript tạo các kích thước ICNS từ cùng PNG này. Giữ thông báo bản quyền/license của Electron, sharp, libvips, Koffi và dependency khi phân phối.
