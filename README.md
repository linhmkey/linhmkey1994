# Hoàng Linh – Danh thiếp + Map Local Bình Thuận

Trang web tĩnh chạy trên **Vercel**, dữ liệu bản đồ lưu ngay trong **GitHub** (file `data/db.json` và thư mục `uploads/`). Không cần cơ sở dữ liệu hay dịch vụ trả phí.

| Trang | Đường dẫn |
|---|---|
| Danh thiếp (trang cũ) + nút **Map Local** | `/` |
| Bản đồ công khai | `/map` |
| Link một địa điểm | `/p/<ID địa điểm>` (vd. `/p/thoai-mai-house-view-bien`, tự chuyển đến `/map.html?p=…`) |
| Link một lịch trình | `/t/<ID lịch trình>` |
| Link một khu vực | `/k/<ID khu vực>` (vd. `/k/trung-tam-phan-thiet`) |
| Trang quản trị | `/admin` |

## 1. Đưa code lên GitHub

1. Vào https://github.com/new, tạo repo (vd. `thoai-mai-house`). Để **Private** cũng được.
2. Bấm **uploading an existing file**, kéo **toàn bộ nội dung** thư mục này vào (cả thư mục `api`, `data`, `vendor`, `assets`, `uploads`), rồi **Commit changes**.

## 2. Kết nối Vercel

- **Nếu trang `linhmkey86.vercel.app` đã có sẵn trên Vercel:** vào project đó → **Settings → Git → Connect Git Repository** → chọn repo vừa tạo.
- **Nếu chưa:** https://vercel.com/new → chọn repo → **Deploy** (không cần chỉnh gì, Framework: *Other*).

## 3. Thêm biến môi trường GITHUB_TOKEN (bắt buộc để admin lưu được)

Vercel → Project → **Settings → Environment Variables** → thêm `GITHUB_TOKEN`.

Tạo token: https://github.com/settings/personal-access-tokens/new
- *Repository access*: **Only select repositories** → chọn repo của trang này
- *Permissions → Repository permissions → Contents*: **Read and write**
- Bấm **Generate token**, sao chép và dán vào Vercel.

Sau khi thêm biến, vào tab **Deployments** → bấm **⋯ → Redeploy** ở bản mới nhất.

(Tuỳ chọn: `GITHUB_REPO` = `ten-tai-khoan/ten-repo`, `GITHUB_BRANCH` = `main` nếu Vercel không tự nhận ra repo; `SESSION_SECRET` = chuỗi ngẫu nhiên dài để ký phiên đăng nhập.)

### Tài khoản quản trị

- Đăng nhập lần đầu: email `linhmkey@gmail.com`, mật khẩu mặc định đã được thiết lập sẵn (chủ trang đã biết).
- **Hãy đổi mật khẩu ngay sau lần đăng nhập đầu tiên**: trang admin → nút **👤 Tài khoản**.
- Mật khẩu chỉ lưu dạng mã hoá (scrypt) trong `private/auth.json`; thư mục này không được đăng công khai trên web.
- Có icon 👤 đăng nhập quản trị ở góc trang chủ và trên thanh bản đồ.

## 4. Sử dụng trang quản trị

Mở `/admin` (hoặc bấm icon 👤), đăng nhập bằng email và mật khẩu.

- **Địa điểm:** tên, ID, danh mục, toạ độ (dán `10.919147, 108.109223`, hoặc dán link Google Maps rồi bấm *Lấy toạ độ*, hoặc bấm lên bản đồ), số điện thoại (tự hiện nút **Gọi** và **Zalo**), địa chỉ, ghi chú, ảnh đại diện (làm ghim trên bản đồ) và album ảnh. Ô nào để trống sẽ tự ẩn trên bản đồ.
- **Danh mục:** tên, icon (emoji hoặc ảnh PNG), màu, ghi chú, thứ tự.
- **Lịch trình:** đặt tên, chọn các địa điểm đã thêm, sắp xếp thứ tự, ghi chú cho từng điểm. Khách mở link sẽ thấy đường đi thật, khoảng cách và thời gian giữa các điểm.
- **Khu vực:** các vị trí nhanh như “Trung Tâm Phan Thiết”.

Mỗi lần lưu, trang tạo một commit trong repo (nên luôn có lịch sử, sửa nhầm có thể khôi phục trên GitHub). Ảnh được tự nén trước khi tải lên. Thay đổi hiện trên bản đồ sau khoảng 10 giây.

## Chạy thử trên máy

Nháy đúp `index.html` là xem thử được trang chính và bản đồ (dùng dữ liệu mẫu trong `data/seed.js`). Trang quản trị chỉ lưu được khi chạy trên Vercel hoặc bằng lệnh dưới đây.

```bash
npm run dev     # mở http://localhost:3000 — đăng nhập bằng tài khoản trong private/auth.json
```

## Ghi chú kỹ thuật

- Bản đồ: Leaflet (đóng gói sẵn trong `vendor/`), nền bản đồ CARTO/OpenStreetMap, ảnh vệ tinh Esri — đều miễn phí, không cần API key.
- Chỉ đường giữa các điểm: dịch vụ OSRM miễn phí (routing.openstreetmap.de). Nếu dịch vụ tạm lỗi, trang hiện khoảng cách ước tính bằng nét đứt.
- Nút “Chỉ đường” / “Google Maps” mở thẳng ứng dụng Google Maps trên điện thoại.


Bước 1: Đưa code lên GitHub

Vào github.com/new, đặt tên repo (vd. thoai-mai-house), chọn Private, bấm Create repository.
Ở trang repo vừa tạo, bấm uploading an existing file.
Giải nén zip, mở thư mục thoai-mai-house-map, chọn tất cả file và thư mục bên trong rồi kéo vào trang. Lưu ý kéo nội dung bên trong, không kéo cả thư mục ngoài cùng.
Bấm Commit changes.

Bước 2: Tạo GITHUB_TOKEN

Vào github.com/settings/personal-access-tokens/new
Token name: map-local. Expiration: chọn No expiration (hoặc 1 năm).
Repository access: chọn Only select repositories, rồi chọn repo thoai-mai-house.
Permissions → Repository permissions → Contents: chọn Read and write.
Bấm Generate token và sao chép ngay chuỗi bắt đầu bằng github_pat_…, vì GitHub chỉ hiện chuỗi này một lần.

Bước 3: Kết nối Vercel với repo
• Nếu đã có project linhmkey86 trên Vercel: vào project đó, chọn Settings → Git → Connect Git Repository, chọn GitHub rồi chọn repo thoai-mai-house.
• Nếu chưa có: vào vercel.com/new, bấm Import cạnh repo thoai-mai-house. Framework Preset để Other, rồi bấm Deploy.

Bước 4: Dán token vào Vercel

Trong project trên Vercel, vào Settings → Environment Variables.
Key: GITHUB_TOKEN. Value: dán chuỗi github_pat_…. Environments: tick cả 3 ô rồi bấm Save.
Vào tab Deployments, bấm ⋯ ở bản trên cùng rồi chọn Redeploy.

Bước 5: Kiểm tra

Mở linhmkey86.vercel.app/admin.html, đăng nhập bằng linhmkey@gmail.com và mật khẩu của bạn.
Sửa thử một địa điểm rồi bấm Lưu. Nếu góc trên hiện chữ xanh "Đã lưu …" là dữ liệu đã kết nối thành công. Lúc này trong repo GitHub cũng sẽ có thêm một commit "Admin: cập nhật bản đồ".
Sau đó vào 👤 Tài khoản để đổi mật khẩu.

Nếu báo lỗi "Chưa cấu hình GITHUB_TOKEN", tức là bạn chưa Redeploy sau khi thêm biến. Nếu báo lỗi GitHub 403/404, tức là token chưa chọn đúng repo hoặc chưa cấp quyền Contents: Read and write.

Nếu bạn thấy các bước này rắc rối, cứ bấm Connect GitHub và gửi mình tên repo, mình sẽ làm bước 1 giúp bạn. Bạn chỉ cần làm bước 2 đến 4.
