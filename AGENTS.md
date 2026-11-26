# Tiny Assets cho macOS

## Kiến trúc và stack hiện tại

- Tên sản phẩm chính xác là `Tiny Assets`; dùng `src/shared/app.ts` cho tên và bundle ID. Giữ `APP_ID=dev.kuro.tinypng` và `DATA_DIRECTORY=Tiny PNG` khi đổi branding để bảo toàn dữ liệu. Desktop app Electron nén ảnh **offline bằng sharp/libvips**. Không dùng Tinify API, không cần key. S3 là tùy chọn được người dùng yêu cầu; mặc định tắt và chỉ upload trực tiếp lên AWS khi được bật.
- Toàn bộ application/build/test code viết bằng TypeScript 7 stable; renderer dùng React TSX + StyleX. Không thêm source JavaScript/CommonJS hoặc Swift helper. CJS chỉ là output build cho Electron main/preload và nằm trong `build/` đã ignore. CSS thuần chỉ dành cho global reset.
- Gradient xanh dương–xanh lá theo tinyPNG.App là nền mặc định; người dùng có thể chọn nền màu đơn. Giữ đầu khủng long riêng của sản phẩm. Glass là opt-in, mặc định tắt; có thanh kéo opacity của nền, giữ chữ và control rõ, dùng native macOS vibrancy qua Electron, không gọi là Liquid Glass. Settings là cửa sổ macOS riêng, có light/dark theo hệ thống. Tôn trọng Reduce Transparency, Increase Contrast và Reduce Motion bằng nền đặc/tắt blur, tương phản rõ và phản hồi tĩnh. Không thay phong cách thương hiệu khi chỉ sửa lỗi render.
- Tooling dùng Node 26 LTS và pnpm theo version pin tại `.node-version`, `.nvmrc`, `package.json` và `pnpm-lock.yaml`; giữ `nodeLinker: hoisted` trong `pnpm-workspace.yaml` để đóng gói native dependencies đúng. Main/preload phải target runtime Node nhúng trong Electron (hiện 24.22.3), không nhầm với Node build/test trên máy.
- `src/main/` giữ Electron và filesystem theo feature; `src/preload/` giữ bridge giới hạn; `src/renderer/` không có Node integration. `src/shared/contracts.ts` sở hữu protocol/kiểu dữ liệu chung, client chỉ import type khi cần kiểu server. `src/shared/locales.ts` sở hữu English/Tiếng Việt/日本語.
- React/StyleX và AWS SDK là build dependencies đã bundle; runtime chỉ giữ sharp/libvips, Koffi, chokidar và dependency cần thiết. Giữ `build/licenses` cùng Vite license manifest, không loại legal notices để giảm dung lượng. Prune chỉ chạy trên bundle staging trước ký; không xóa cả `src/` của dependency vì Koffi có loader JS trong đó. Locale Electron giữ EN/VI/JA và English fallback, không xóa ICU.
- `README.md` mô tả workflow hiện tại. `reports/` và `research_notes/` chứa nghiên cứu lịch sử đã thay thế, không phải spec đang chạy. Sản phẩm độc lập với Tinify/BetweenElements; không chép source/logo/artwork của họ và phải giữ license của dependency.

## Làm việc và giao tiếp

- Trả lời bằng ngôn ngữ của người dùng, giữ specialist terms thông dụng bằng English. Theo `i-have-adhd` khi có: kết luận/hành động trước, câu ngắn, trực tiếp, danh sách tối đa năm mục; chỉ chốt một bước tiếp theo khi còn việc mở.
- Đọc context trước khi hỏi. Dùng question tool cho thông tin thực sự thiếu; không đoán yêu cầu, kết quả test hoặc hành vi chưa quan sát.
- Chia việc độc lập cho sub-agent khi runtime cho phép, sở hữu file rõ và kiểm tra tích hợp trước khi kết luận.
- Dùng `rtk` cho shell khi có, `rtk proxy` cho lệnh chưa hỗ trợ. Không biến `rtk` thành dependency của project.
- Không dùng `border`, `borderTop`/`borderBottom` hoặc shorthand border theo cạnh trong StyleX. Cấu hình hiện tại bỏ các shorthand này khỏi CSS, khiến viền UA của button/fieldset/dialog xuất hiện. Dùng `borderWidth`, `borderStyle`, `borderColor` và longhand theo cạnh; giữ form-control reset trong reset layer. Không đổi style resolution để che lỗi. Các rule StyleX `valid-styles`, `valid-shorthands`, `no-conflicting-props` phải pass.
- Ưu tiên thay đổi gọn, cải thiện UX/DX/accessibility và giữ hành vi đang chạy. Bỏ tagline/nhãn lặp; sửa layout thay vì thêm lời giải thích thừa. Giữ nội dung giúp quyết định về overwrite, chất lượng, dữ liệu và nơi lưu.
- Theo nhịp spacing và control desktop đã thống nhất; giữ empty state/queue có tỷ lệ riêng, label/control Settings thẳng cột và nhãn quality Việt/Nhật đầy đủ. Không làm mờ chồng fieldset/control; segment bị disabled phải có phản hồi nhìn thấy được. Giữ popup select theo nền tảng và keyboard `⌘O`, `⌘,`, `⌘W`, Escape. Xem `src/renderer/docs/native-design.md` trước khi đổi layout; áp dụng pattern từ app thật, không tự thêm search/onboarding hay lấy giả định mobile 44 pt thay cho macOS.

## Hợp đồng dữ liệu và hành vi

- Giữ ảnh gốc mặc định, output collision-safe. Chỉ overwrite sau opt-in và kiểm tra source chưa đổi; đổi format không thay file gốc khác định dạng. Xác minh output trước khi ghi; không gọi output lớn hơn là tiết kiệm dung lượng.
- Queue tuần tự; pause hoàn tất ảnh hiện tại. Watcher chờ file ổn định, bỏ baseline/output/symlink và tránh loop khi overwrite. Quit dừng app/watcher; đóng cửa sổ vẫn giữ menu bar chạy.
- Vùng thả mặc định ở góc trên bên phải, cho đổi góc/tắt hoặc chỉ hiện khi kéo file đến gần. Không chiếm focus không cần thiết; có thao tác keyboard tương đương. Trạng thái kéo được đọc trong process qua Koffi, không ghi phím/nội dung clipboard.
- Giữ `contextIsolation: true`, `nodeIntegration: false`, sandbox, CSP chặt và IPC allowlist/validation. Renderer không được import Node, filesystem, Electron hoặc module main. Preload phải bundle thành một file tương thích sandbox; không mở navigation/remote content không cần thiết.
- Không commit ảnh người dùng, settings, credentials, signing certificate hoặc log nhạy cảm; không đọc credentials của bản Tinify cũ. Giữ thông báo lỗi/bản dịch theo key dùng chung, không hardcode riêng theo từng cửa sổ.
- AWS credentials của GUI phải lưu encrypted bằng macOS `safeStorage`, không trả lại renderer. CLI chỉ dùng AWS environment khi có `--s3`. Không tạo public ACL hoặc ghi đè remote object mặc định; upload thất bại phải giữ local output và retry upload riêng.

## Quyền chủ động và bằng chứng

- Hoàn tất công việc, sửa lỗi, test, local build và cài/chạy local khi đã được yêu cầu; không xin lại quyền. Chỉ hỏi trước external publication chưa được cho phép, phá hủy dữ liệu người dùng, chi phí đáng kể hoặc mở rộng phạm vi. Yêu cầu hiện tại của người dùng ưu tiên hơn workflow tái sử dụng; nêu nguồn nếu instruction khác thực sự chặn hành động.
- Dùng `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` theo thay đổi. `pnpm lint` là build/release gate bắt buộc, không tắt rule để cho qua regression UI. Test hành vi/regression thực bằng ảnh/thư mục tạm; không viết test phản chiếu code hay hằng số UI. Kiểm tra bundle vẫn load sharp, libvips, chokidar và Koffi.
- Sau thay đổi visual, kiểm tra app chạy khi UI automation khả dụng: main, Settings, floating drop, nearby mode, watcher và queue/lỗi. Compilation không thay thế UI QA; nếu tool không khả dụng, nêu chính xác phần chưa kiểm chứng.
- Khi thay packaging, kiểm tra bundle thực bằng `TINY_ASSETS_QA_PACKAGED=1 pnpm qa:ui`; source chạy với node_modules đầy đủ không chứng minh bundle đã prune hoạt động. Người dùng muốn dùng bản Homebrew chính thức: không cài lại bản dev vào `~/Applications`; dọn app QA và đăng ký Launch Services sau kiểm tra, giữ bản `/Applications` và dữ liệu người dùng.
- Trước khi báo xong, nêu bằng chứng build/test mới và giới hạn. Pipeline dùng ad-hoc như AI Account Switcher đã kiểm tra; chữ ký tồn tại sau reboot nhưng update có thể khiến macOS/Keychain hỏi lại quyền. Không thêm signing dependency hoặc khai là Developer ID/notarization nếu người dùng chưa yêu cầu. Khi installer đổi tên app, chỉ thay/xóa bundle cũ có đúng APP_ID và giữ rollback.
