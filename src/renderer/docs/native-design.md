# Quyết định thiết kế macOS — Tiny Assets 0.1.2

Gradient xanh là nền mặc định của cửa sổ chính; người dùng đã bổ sung lựa chọn nền màu đơn và thanh kéo opacity cho Glass. Opacity chỉ thay đổi nền, giữ chữ/control rõ và bảo toàn nền đặc khi accessibility preference yêu cầu. Đầu khủng long là dấu hiệu nhận diện, không phải một hero section chiếm diện tích queue. Settings dùng light/dark riêng theo hệ thống.

## Pattern dùng làm cơ sở

| Nguồn chính thức | Pattern được xác minh từ mô tả workflow | Quyết định cho Tiny Assets |
| --- | --- | --- |
| [ImageOptim](https://imageoptim.com/mac) | Thả file để xử lý; tinh chỉnh compression trong Preferences | Luồng đầu tiên không có setup hoặc onboarding; đưa queue và kết quả lên trước. |
| [Clop](https://lowtechguys.com/clop/) | Drop zone/result nổi tách khỏi cửa sổ batch; thao tác gắn với kết quả | Floating drop nhỏ, không chiếm focus; action của file ở cạnh hàng tương ứng. |
| [Dropover](https://dropoverapp.com/) | Shelf xuất hiện khi cần; preview/rename/remove diễn ra ngay trên shelf | Giữ thao tác cục bộ, không tạo một màn hình mới cho mỗi file. |
| [Squash](https://www.realmacsoftware.com/squash/) | Drop ảnh, chọn format/quality rồi export batch; ảnh xong có thể kéo ra ngoài | Phân biệt rõ input, cấu hình và output; không nhân bản CTA cùng ý nghĩa. Drag-out là tham khảo, không phải tính năng đã xác minh của Tiny Assets. |
| [Permute](https://software.charliemonroe.net/permute/) | Conversion queue, per-file action menu và presets là các phần riêng | Queue là vùng làm việc; advanced options ở Settings hoặc menu phù hợp. |

Các pattern trên là nghiên cứu workflow từ nguồn chính thức, **không phải kết luận quan sát pixel của screenshot**. Không sao chép artwork, layout hoặc source của các sản phẩm này.

## Tiêu chí cho bản polish

- Một nhịp spacing 8 px, margin ngoài thống nhất; toolbar khoảng 52 px, control thường khoảng 28 px, body 13 px, queue row khoảng 44 px. Sidebar Cài đặt có khoảng cách 6 px giữa các mục theo yêu cầu người dùng. Đây là mục tiêu thiết kế của project, không phải mọi con số đều là yêu cầu bắt buộc của Apple.
- Empty state có vùng thả rõ; khi có ảnh, queue thay vùng thả. Vùng nội dung vẫn nhận thêm ảnh kéo thả, nút + trên toolbar và `⌘O` mở file picker. Giữ vị trí cột dung lượng/kết quả ổn định và cho tên file dài truncate có tooltip.
- Settings là cửa sổ hệ thống riêng, có close/drag thật, nhớ pane cuối; giữ `⌘,`, `⌘W`, Escape và thứ tự focus có nghĩa. Label/control thẳng cột; popup của select theo nền tảng.
- History là danh sách cuộn hữu hạn trong Settings: thời gian theo locale, đường dẫn có thể mở rộng/chọn để sao chép, và kết quả nén/tải lên/thông báo tách rõ. Yêu cầu thông báo hoặc macOS tiếp nhận không đồng nghĩa người dùng đã nhìn thấy banner; nút thử thông báo và mở cài đặt hệ thống nằm trong Tự động hóa.
- Quality giữ ba nhãn đã thống nhất và cho phép nhãn Việt/Nhật xuống dòng. Không làm mờ lồng nhau khi fieldset và control cùng disabled. Giữ focus ring, Reduce Motion, Reduce Transparency và Increase Contrast.
- Một họ icon, một thang radius, một accent cho action. Gradient là ngoại lệ thương hiệu được người dùng yêu cầu; không thêm gradient CTA, glow, card Glass hàng loạt, search hoặc onboarding khi chưa có nhu cầu.

Nguồn quy ước: [Apple — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Apple — Settings](https://developer.apple.com/design/human-interface-guidelines/settings), [skill macOS được người dùng chỉ định](https://github.com/ceorkm/macos-design-skill/blob/main/SKILL.md) và ba reference của skill: [layout](https://github.com/ceorkm/macos-design-skill/blob/main/references/layout-and-composition.md), [interaction](https://github.com/ceorkm/macos-design-skill/blob/main/references/interaction-patterns.md), [visual](https://github.com/ceorkm/macos-design-skill/blob/main/references/visual-design.md). Platform macOS và yêu cầu người dùng ưu tiên hơn các giả định Expo/iOS trong skill Appllama được gửi sau đó.

## Giới hạn bằng chứng

Không có Appllama MCP trong phiên nghiên cứu. Tool web chỉ trả placeholder khi mở ảnh sản phẩm tham khảo, nên chưa đạt mốc nghiên cứu 10 screenshot đối thủ thật; không dùng metadata hoặc alt text để khai là đã xem ảnh.

Ảnh chính thức đã tìm được để đối chiếu khi tool hiển thị pixel khả dụng: [ImageOptim queue](https://imageoptim.com/ImageOptim-app.png), [Clop batch](https://lowtechguys.com/static/img/clop-chapters/batch.webp?v=e7ce959c), [Dropover settings](https://dropoverapp.com/assets/images/settings.jpg), [Dropzone](https://aptonic.com/redesign-hero.png), [Permute queue](https://software.charliemonroe.net/assets/img/permute/v4/01_main.jpg), [Permute actions](https://software.charliemonroe.net/assets/img/permute/v4/04_actions.jpg), [Permute presets](https://software.charliemonroe.net/assets/img/permute/v4/05_presets.jpg).

UI hiện có kiểm tra Playwright trên Electron với profile/fixtures riêng: empty, queue, lỗi, ba ngôn ngữ, Settings light/dark, kích thước tối thiểu, chọn nền/opacity, kéo thả và watcher. Native frame, Glass và sheet ghi đè được chụp riêng theo PID/window ID của chính app QA. `pnpm qa:ui` tái hiện kiểm tra renderer; ảnh renderer không chứng minh native vibrancy. CSS accessibility media emulation không thay thế kiểm tra preference thật của macOS; chưa chứng nhận VoiceOver hoặc thao tác kéo Finder để hiện vùng gần góc.
