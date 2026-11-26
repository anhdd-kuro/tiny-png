# Tiny PNG cho macOS

## Sản phẩm và kiến trúc hiện tại

- Đây là desktop app Electron nén ảnh **offline bằng sharp/libvips**. Không dùng TinyPNG/Tinify API, không cần API key và không upload ảnh. Không thêm cloud/S3 hoặc network dependency cho chức năng nén nếu người dùng chưa yêu cầu rõ.
- `src/main.cjs` quản lý cửa sổ, menu bar, queue, settings và IPC. `src/preload.cjs` là bridge giới hạn; `src/renderer/` chỉ xử lý UI. Giữ xử lý ảnh và filesystem trong `src/core/`, không nhân bản logic trong renderer.
- `README.md` mô tả cách chạy/build hiện tại. `reports/` và `research_notes/` chứa nghiên cứu lịch sử của phương án Tinify/Swift đã thay thế; không coi đó là đặc tả kiến trúc hiện hành.
- Sản phẩm độc lập, không liên kết với Tinify/BetweenElements. Không sao chép source, logo hoặc panda artwork của họ. Giữ license/thông báo bản quyền của các dependency khi đóng gói.

## Làm việc và giao tiếp

- Trả lời bằng ngôn ngữ của người dùng, giữ specialist terms thông dụng bằng English. Theo hướng dẫn `i-have-adhd` khi có: kết luận/hành động trước, câu ngắn, diễn đạt trực tiếp, danh sách tối đa năm mục; chỉ chốt một bước tiếp theo khi còn việc mở.
- Đọc context sẵn có trước khi hỏi. Dùng question tool cho thông tin thực sự còn thiếu; không đoán yêu cầu, kết quả test hay hành vi chưa quan sát.
- Chia việc độc lập cho sub-agent khi runtime cho phép, phân quyền sở hữu file rõ và tích hợp/kiểm tra trước khi kết luận.
- Dùng tiền tố `rtk` cho shell khi có; `rtk proxy` cho lệnh chưa hỗ trợ. Không biến `rtk` thành dependency để build app.
- Ưu tiên thay đổi gọn, cải thiện UX, DX và accessibility mà vẫn giữ hành vi đang chạy. Bỏ tagline/nhãn lặp; sửa layout nếu UI cần quá nhiều lời giải thích. Giữ nội dung giúp người dùng quyết định về overwrite, chất lượng và nơi lưu.

## Hợp đồng dữ liệu và hành vi

- Giữ ảnh gốc mặc định. Output phải collision-safe; chỉ overwrite sau opt-in và xác nhận source chưa thay đổi. Đổi định dạng không được thay file gốc khác định dạng. Kiểm tra output hợp lệ trước khi ghi.
- Queue tuần tự; pause hoàn tất ảnh hiện tại. Watcher chỉ nhận ảnh mới/thay đổi sau baseline, chờ file ổn định, bỏ symlink/ảnh output và tránh loop khi overwrite. Trạng thái watch phải hiện rõ; Quit dừng process/watcher, đóng cửa sổ vẫn giữ menu bar chạy.
- Vùng thả nổi mặc định ở góc trên bên phải; cho đổi góc hoặc tắt. Dropzone không được chiếm focus không cần thiết và cần có thao tác keyboard tương đương.
- Renderer phải giữ `contextIsolation: true`, `nodeIntegration: false`, sandbox, CSP chặt và IPC có allowlist/validation. Không mở navigation hoặc remote content không cần thiết; không trao filesystem/Node API tùy ý cho renderer.
- Không commit ảnh người dùng, settings local, credentials, signing certificate hoặc log nhạy cảm. Không đọc credentials của bản Tinify cũ. Báo lỗi file/quyền/định dạng rõ; không coi output lớn hơn là tiết kiệm dung lượng.

## Quyền chủ động và bằng chứng

- Hoàn tất công việc, sửa lỗi, test, local build và cài/chạy local khi đã được yêu cầu, không xin lại quyền. Chỉ hỏi trước external publication chưa được cho phép, hành động phá hủy dữ liệu người dùng, chi phí đáng kể hoặc mở rộng phạm vi. Yêu cầu hiện tại của người dùng ưu tiên hơn thói quen tái sử dụng; giải thích nguồn nếu một instruction khác thực sự chặn hành động.
- Dùng `npm ci`, `npm test` và `npm run build` theo thay đổi. Test hành vi quan trọng bằng ảnh/thư mục tạm; không viết test chỉ phản chiếu cấu trúc code hoặc các hằng số UI.
- Sau thay đổi visual, kiểm tra app đang chạy bằng UI automation khi có: main window, Settings, floating drop, watcher, queue/lỗi và kích thước cửa sổ nhỏ. Compilation không thay thế UI QA.
- Trước khi báo hoàn tất, nêu bằng chứng build/test mới và phần chưa kiểm chứng. Ad-hoc signed bundle cho local không tương đương Developer ID signing/notarization; không tuyên bố release production khi chưa có bước đó.
