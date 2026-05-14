# KQXS API — Reference

**Base URL:** `http://localhost:3083/api`  
**Stack:** Node.js + Express + MongoDB  
**Tất cả response:** `{ "success": true, "data": ... }` hoặc `{ "success": false, "message": "..." }`

---

## Quy ước chung

### Region alias
Mọi endpoint nhận `region` đều hỗ trợ các dạng sau (không phân biệt hoa thường):

| Truyền vào | Miền |
|---|---|
| `north` hoặc `mb` | Miền Bắc |
| `south` hoặc `mn` | Miền Nam |
| `center` hoặc `mt` | Miền Trung |
| `<ObjectId>` | ID trực tiếp |

### Province alias
Mọi endpoint nhận `province` đều hỗ trợ:
- Code đài: `XSHCM`, `XSMB`, `XSVL`, ...
- Tên tỉnh: `TP. Hồ Chí Minh`, `Tiền Giang`, ...
- `<ObjectId>`

### Day of week
`day`: `1`=Thứ 2, `2`=Thứ 3, `3`=Thứ 4, `4`=Thứ 5, `5`=Thứ 6, `6`=Thứ 7, `7`=Chủ Nhật

---

## Endpoints

### 1. Regions

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/regions` | Danh sách 3 miền |
| GET | `/api/regions/:id` | Chi tiết 1 miền |
| POST | `/api/regions` | Tạo miền |
| PUT | `/api/regions/:id` | Cập nhật |
| DELETE | `/api/regions/:id` | Xóa |

**Schema Region:**
```json
{ "_id": "...", "code": "MB", "name": "Miền Bắc", "drawTime": "18:15" }
```
`code` enum: `MB` / `MN` / `MT`

---

### 2. Provinces (Đài / Tỉnh)

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/provinces` | Danh sách đài |
| GET | `/api/provinces/:id` | Chi tiết 1 đài |
| POST | `/api/provinces` | Tạo đài |
| PUT | `/api/provinces/:id` | Cập nhật |
| DELETE | `/api/provinces/:id` | Xóa |

**Query params GET `/api/provinces`:**

| Param | Mô tả |
|---|---|
| `region` | Lọc theo miền (hỗ trợ alias) |
| `day` | Lọc theo ngày quay (1–7) |

**Schema Province:**
```json
{
  "_id": "...",
  "code": "XSHCM",
  "name": "TP. Hồ Chí Minh",
  "region": { "code": "MN", "name": "Miền Nam", "drawTime": "16:15" },
  "schedule": [1, 6]
}
```
`schedule`: mảng ngày quay trong tuần (1=T2 ... 7=CN)

**Ví dụ:**
```
GET /api/provinces?region=south&day=3
→ Đài Miền Nam quay Thứ 3 (Bến Tre, Vũng Tàu, Bạc Liêu)
```

---

### 3. Lottery Results (Kết quả xổ số)

#### 3a. Lấy theo ngày / filter

```
GET /api/results
```

| Param | Kiểu | Mô tả |
|---|---|---|
| `date` | `YYYY-MM-DD` | Lọc theo ngày cụ thể |
| `from` | `YYYY-MM-DD` | Từ ngày (kết hợp với `to`) |
| `to` | `YYYY-MM-DD` | Đến ngày |
| `region` | string | Lọc theo miền (hỗ trợ alias) |
| `province` | string | Lọc theo đài (code / tên / ObjectId) |
| `limit` | number | Số kết quả (mặc định: 20) |

**Ví dụ:**
```
GET /api/results?date=2026-04-27&region=south
GET /api/results?date=2026-04-27&province=XSHCM
GET /api/results?from=2026-04-01&to=2026-04-27&region=mb
```

#### 3b. Lấy theo số kỳ quay thưởng (có phân trang)

```
GET /api/results/by-ky
```

Phân trang theo **số kỳ thực tế** — đúng với tỉnh quay 1–2 lần/tuần.

| Param | Kiểu | Mô tả | Default |
|---|---|---|---|
| `region` | string | Lọc theo miền | — |
| `province` | string | Lọc theo đài | — |
| `day` | 1–7 | Chỉ lấy kỳ quay vào thứ X (chỉ dùng với `region`) | — |
| `limit` | number | Số kỳ mỗi trang (max 100) | 10 |
| `page` | number | Trang | 1 |

**Ví dụ:**
```
GET /api/results/by-ky?region=mb&limit=30&page=1
→ 30 kỳ XSMB gần nhất

GET /api/results/by-ky?province=XSHCM&limit=10&page=2
→ HCM: trang 2, mỗi trang 10 kỳ (HCM quay T2/T4/T7 nên 10 kỳ ≈ 3 tuần)

GET /api/results/by-ky?region=south&day=3&limit=10
→ XSMN các ngày Thứ 3
```

**Response:**
```json
{
  "success": true,
  "page": 1, "limit": 10, "total": 52, "totalPages": 6,
  "data": [
    {
      "date": "2026-04-27",
      "dayOfWeek": 2,
      "dayLabel": "Thứ 2",
      "results": [ { "province": {...}, "prizes": {...} } ]
    }
  ]
}
```

#### 3c. CRUD

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/results/:id` | Chi tiết 1 kết quả |
| POST | `/api/results` | Tạo thủ công |
| PUT | `/api/results/:id` | Cập nhật |
| DELETE | `/api/results/:id` | Xóa |

**Schema prizes (Miền Bắc):**
```json
{
  "specialCodes": ["10ZU", "11ZU"],   // Mã ĐB (chỉ MB)
  "special": ["38455"],               // G.ĐB — 5 chữ số
  "first":   ["67890"],               // G.1
  "second":  ["11111", "22222"],      // G.2 — 2 số
  "third":   ["...×6"],               // G.3 — 6 số
  "fourth":  ["...×4"],               // G.4 — 4 chữ số
  "fifth":   ["...×6"],               // G.5 — 4 chữ số
  "sixth":   ["...×3"],               // G.6 — 3 chữ số
  "seventh": ["...×4"]                // G.7 — 2 chữ số
}
```

**Schema prizes (Miền Trung / Miền Nam — mỗi đài):**
```json
{
  "special": ["865023"],              // G.ĐB — 6 chữ số
  "first":   ["88617"],
  "second":  ["73106"],
  "third":   ["01538", "95878"],      // 2 số
  "fourth":  ["...×7"],               // 7 số
  "fifth":   ["5108"],                // 4 chữ số
  "sixth":   ["1500", "1363", "0876"],// 4 chữ số
  "seventh": ["796"],                 // 3 chữ số
  "eighth":  ["31"]                   // 2 chữ số — chỉ MT/MN
}
```

---

### 4. Crawl

```
POST /api/crawl
Content-Type: application/json
```

Crawl kết quả xổ số từ `xosodaiphat.com` cho 1 ngày. Tự động bỏ qua tỉnh đã có dữ liệu.

| Body field | Bắt buộc | Mô tả |
|---|---|---|
| `date` | ✅ | `YYYY-MM-DD` |
| `region` | ❌ | Chỉ crawl miền này |
| `province` | ❌ | Chỉ crawl 1 tỉnh này |

Nếu không truyền `region` hoặc `province` → crawl cả 3 miền.

**Ví dụ:**
```json
{ "date": "2026-04-27" }
{ "date": "2026-04-27", "region": "south" }
{ "date": "2026-04-27", "province": "XSHCM" }
```

**Response:**
```json
{
  "success": true,
  "date": "2026-04-27",
  "crawled": ["XSHCM", "XSVL", "XSBTR"],
  "skipped": ["XSAG"],
  "errors":  [],
  "total": { "crawled": 3, "skipped": 1, "errors": 0 }
}
```

> **Auto crawl:** Hệ thống tự động crawl sau khi mỗi miền kết thúc quay thưởng (qua WebSocket live feed).

---

### 5. Live (Kết quả trực tiếp)

Cơ chế **long polling** — proxy-friendly, không cần WebSocket phía client.

```
GET /api/live/:region?since=<timestamp_ms>
```

| Param | Giá trị |
|---|---|
| `:region` | `mn` / `mt` / `mb` |
| `since` | Unix ms timestamp — server chỉ trả data mới hơn mốc này. Truyền `0` lần đầu |

**Flow:**
1. Client gửi `GET /api/live/mn?since=0`
2. Server giữ kết nối tối đa 25s chờ data từ WebSocket nguồn
3. Khi có data → trả về ngay
4. Client nhận `ts` → gửi lại `?since=<ts>` → lặp liên tục

**Response có data:**
```json
{
  "ok": true,
  "ts": 1745123456789,
  "stations": [
    {
      "lotteryCode": "TG",
      "lotteryName": "Tiền Giang",
      "status": 2,
      "prizes": {
        "eighth": ["73"],
        "seventh": ["637"],
        "special": ["865023"]
      }
    }
  ]
}
```
`status`: `0`=chờ quay, `1`=hoàn thành, `2`=đang quay

**Response timeout (không có data mới):**
```json
{ "ok": false, "timeout": true }
```
→ Gọi lại ngay, không cần delay.

**Lịch quay:** MN 16:15 · MT 17:15 · MB 18:15

---

### 6. Statistics (Thống kê)

Tất cả endpoints stats nhận:

| Param | Mô tả | Default |
|---|---|---|
| `region` | Lọc theo miền (alias) | — |
| `province` | Lọc theo đài (code/tên/id) | — |
| `days` | Số ngày nhìn lại (max 365) | 30 |

#### 6a. Quick Stats — Tất cả trong 1 request

```
GET /api/stats/quick
```

| Param thêm | Mô tả | Default |
|---|---|---|
| `trend` | Ngày tính badge xu hướng | 7 |
| `top` | Số lô trong mỗi danh sách | 10 |

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalKy": 30,
    "period": { "from": "2026-04-02", "to": "2026-05-02", "days": 30 },
    "loNhieuNhat": { "lo": "27", "count": 18, "outOf": 30 },
    "loGanDai":    { "lo": "08", "gan": 24, "lastDate": "2026-04-08" },
    "dauDanDau":   { "dau": "7", "count": 56 }
  },
  "loNong": [
    { "lo": "27", "count": 18, "trend": 3, "lastDate": "2026-05-01" }
  ],
  "loGan": [
    { "lo": "08", "gan": 24, "lastDate": "2026-04-08" }
  ],
  "dau": [
    { "dau": "0", "count": 42 },
    { "dau": "7", "count": 56 }
  ]
}
```

- `loNong[i].trend`: số lần lô về trong `trend` ngày gần nhất → dùng cho badge `+N`
- `loGan[i].gan`: số **kỳ** (không phải calendar days) chưa về — chính xác với MN/MT

**Ví dụ:**
```
GET /api/stats/quick?region=mb&days=30&trend=7&top=10
GET /api/stats/quick?province=XSHCM&days=30
```

#### 6b. Các endpoint thống kê riêng lẻ

| Endpoint | Mô tả | Sort |
|---|---|---|
| `GET /api/stats/lo-tan-suat` | Tần suất lô 00–99 | count desc |
| `GET /api/stats/lo-gan` | Số ngày/kỳ lô chưa về | gan desc |
| `GET /api/stats/de-tan-suat` | Tần suất đề (2 số cuối G.ĐB) | count desc |
| `GET /api/stats/de-gan` | Số ngày đề chưa về | gan desc |
| `GET /api/stats/dau-duoi` | Tần suất đầu số (0–9) + đuôi | index asc |
| `GET /api/stats/chu-ky` | Chu kỳ trung bình mỗi lô (ngày) | chuKy asc |

**Response mẫu `lo-tan-suat`:**
```json
{
  "success": true,
  "period": { "from": "2026-04-02", "to": "2026-05-02", "days": 30 },
  "data": [
    { "lo": "27", "dau": "2", "duoi": "7", "count": 18 }
  ]
}
```

**Response mẫu `lo-gan`:**
```json
{
  "data": [
    { "lo": "08", "dau": "0", "duoi": "8", "gan": 24, "lastDate": "2026-04-08" }
  ]
}
```

**Response mẫu `dau-duoi`:**
```json
{
  "total": 810,
  "dau":  [ { "dau": "0", "count": 42, "pct": 5.2 }, ... ],
  "duoi": [ { "duoi": "0", "count": 38, "pct": 4.7 }, ... ]
}
```

**Response mẫu `chu-ky`:**
```json
{
  "data": [
    { "lo": "45", "dau": "4", "duoi": "5", "chuKy": 3.2, "appearances": 9, "lastDate": "2026-04-30" }
  ]
}
```

---

## Lịch quay các đài

**Miền Bắc:** XSMB quay mỗi ngày

**Miền Nam:**
| Thứ | Đài |
|---|---|
| Thứ 2 | TP.HCM, Đồng Tháp, Cà Mau |
| Thứ 3 | Bến Tre, Vũng Tàu, Bạc Liêu |
| Thứ 4 | Đồng Nai, Cần Thơ, Sóc Trăng |
| Thứ 5 | An Giang, Tây Ninh, Bình Thuận |
| Thứ 6 | Vĩnh Long, Bình Dương, Trà Vinh |
| Thứ 7 | TP.HCM, Long An, Bình Phước, Hậu Giang |
| CN | Tiền Giang, Kiên Giang, Đà Lạt |

**Miền Trung:**
| Thứ | Đài |
|---|---|
| Thứ 2 | Phú Yên, Huế |
| Thứ 3 | Đắk Lắk, Quảng Nam |
| Thứ 4 | Đà Nẵng, Khánh Hòa |
| Thứ 5 | Quảng Bình, Bình Định, Quảng Trị |
| Thứ 6 | Gia Lai, Ninh Thuận |
| Thứ 7 | Đà Nẵng, Quảng Ngãi, Đắk Nông |
| CN | Khánh Hòa, Kon Tum, Huế |

---

## Trang giao diện

| URL | Mô tả |
|---|---|
| `http://localhost:3083/` | Tra cứu kết quả theo ngày |
| `http://localhost:3083/live.html` | Kết quả trực tiếp (long polling) |
| `http://localhost:3083/stats.html` | Thống kê tần suất / lô gan / chu kỳ |
