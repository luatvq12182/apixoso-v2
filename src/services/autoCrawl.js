const Region   = require('../models/Region')
const Province = require('../models/Province')
const { crawlRegion } = require('./crawlService')

const REGION_CODE = { mb: 'MB', mn: 'MN', mt: 'MT' }

// Giờ VN (UTC+7) để trigger fallback nếu WebSocket không bắt được "all done"
// Đặt ~20 phút sau giờ quay xong thực tế để chắc chắn kết quả đã lên web
//   MN xong ~16:45 → fallback 17:05
//   MT xong ~17:45 → fallback 18:05
//   MB xong ~18:32 → fallback 18:50
const FALLBACK_VN = { mn: [17, 5], mt: [18, 5], mb: [18, 50] }

const VN_OFFSET_MS = 7 * 60 * 60 * 1000   // UTC+7

/** Milliseconds tới lần xuất hiện tiếp theo của giờ VN chỉ định */
function msUntilVnTime(vnHour, vnMinute) {
  const nowUTC     = Date.now()
  const vnNow      = nowUTC + VN_OFFSET_MS
  const vnMidnight = Math.floor(vnNow / 86400000) * 86400000
  const targetVN   = vnMidnight + (vnHour * 60 + vnMinute) * 60000
  const targetUTC  = targetVN - VN_OFFSET_MS
  const ms = targetUTC - nowUTC
  return ms > 0 ? ms : ms + 86400000   // đã qua → lần tiếp theo ngày mai
}

// regionCode_YYYY-MM-DD → true  (tránh crawl lại cùng ngày)
const crawledLog = {}

// Cache DB maps — tải 1 lần, đủ dùng vì region/province hiếm thay đổi
let dbCache = null

async function getDbMaps() {
  if (dbCache) return dbCache
  const [regions, provinces] = await Promise.all([
    Region.find().lean(),
    Province.find().lean(),
  ])
  dbCache = {
    regionMap:      Object.fromEntries(regions.map(r => [r.code, r])),
    provinceByCode: Object.fromEntries(provinces.map(p => [p.code, p])),
  }
  return dbCache
}

function todayUTC() {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Gọi khi phát hiện toàn bộ đài của 1 miền đã hoàn thành quay.
 * Tự động bỏ qua nếu đã crawl miền đó trong ngày hôm nay.
 */
async function triggerCrawl(region) {
  const code = REGION_CODE[region]
  if (!code) return

  const key = code + '_' + todayStr()
  if (crawledLog[key]) return   // đã crawl rồi

  crawledLog[key] = true   // đánh dấu ngay, tránh trigger song song

  console.log(`[AutoCrawl] ${code} hoàn thành → bắt đầu crawl ngày ${todayStr()}`)

  try {
    const { regionMap, provinceByCode } = await getDbMaps()
    const result = await crawlRegion(todayUTC(), code, regionMap, provinceByCode, null)
    const summary = [
      result.crawled.length  ? `✓ ${result.crawled.join(', ')}` : '',
      result.skipped.length  ? `⊘ skip: ${result.skipped.join(', ')}` : '',
      result.errors.length   ? `✗ lỗi: ${result.errors.join(' | ')}` : '',
    ].filter(Boolean).join('  ')
    console.log(`[AutoCrawl] ${code} xong — ${summary || 'không có gì mới'}`)
  } catch (e) {
    console.error(`[AutoCrawl] ${code} lỗi:`, e.message)
    delete crawledLog[key]   // cho phép retry lần sau
  }
}

/**
 * Kiểm tra ngay khi server khởi động: nếu đã qua giờ fallback của miền nào
 * thì crawl luôn (xử lý trường hợp server restart sau giờ quay thưởng).
 * crawlRegion có LotteryResult.exists() check nên không tạo bản ghi trùng.
 */
async function startupCheck() {
  const vnNow  = new Date(Date.now() + VN_OFFSET_MS)
  const vnMins = vnNow.getUTCHours() * 60 + vnNow.getUTCMinutes()

  for (const [region, [h, m]] of Object.entries(FALLBACK_VN)) {
    if (vnMins >= h * 60 + m) {
      console.log(`[AutoCrawl] Startup check: đã qua ${h}:${String(m).padStart(2,'0')} VN → kiểm tra ${region.toUpperCase()}`)
      await triggerCrawl(region)
    }
  }
}

/**
 * Lên lịch fallback hàng ngày cho cả 3 miền.
 * Nếu WebSocket đã trigger trước đó thì crawledLog sẽ skip, không crawl lại.
 * Tự re-schedule cho ngày hôm sau sau mỗi lần chạy.
 */
function scheduleFallbacks() {
  for (const [region, [h, m]] of Object.entries(FALLBACK_VN)) {
    ;(function schedule(r, hour, minute) {
      const ms = msUntilVnTime(hour, minute)
      const label = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} VN`
      console.log(`[AutoCrawl] Fallback ${r.toUpperCase()} scheduled in ${Math.round(ms / 60000)} phút (${label})`)
      setTimeout(async () => {
        console.log(`[AutoCrawl] Fallback trigger: ${r.toUpperCase()} (${label})`)
        await triggerCrawl(r)
        schedule(r, hour, minute)   // re-schedule cho ngày mai
      }, ms)
    })(region, h, m)
  }
}

module.exports = { triggerCrawl, scheduleFallbacks, startupCheck }
