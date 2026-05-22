/**
 * Crawl local → Push lên remote API
 *
 * Script chạy trên máy local: crawl HTML từ nguồn, parse, rồi POST lên API server.
 * Không cần kết nối DB trực tiếp.
 *
 * Usage:
 *   node src/scripts/crawl-push.js                          # 15 năm
 *   node src/scripts/crawl-push.js --years=3
 *   node src/scripts/crawl-push.js --from=01-01-2020
 *   node src/scripts/crawl-push.js --from=01-01-2015 --to=31-12-2019
 *   node src/scripts/crawl-push.js --api=https://apikqxs.org
 *
 * Hoặc set API_URL trong .env:
 *   API_URL=https://apikqxs.org
 */

require('dotenv').config()
const axios   = require('axios')
const cheerio = require('cheerio')

// ── Config ───────────────────────────────────────────────────────────────────

const SOURCE_URL = 'https://xosodaiphat.com'
const CRAWL_DELAY_MS = 1000   // giữa các lần fetch HTML
const PUSH_TIMEOUT   = 10000  // timeout gọi API

const PRIZE_MAP = {
  'G.ĐB': 'special', 'ĐB': 'special',
  'G.1':  'first',   'G.2': 'second', 'G.3': 'third',
  'G.4':  'fourth',  'G.5': 'fifth',  'G.6': 'sixth',
  'G.7':  'seventh', 'G.8': 'eighth',
}

// ── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2)
  const get  = key => {
    const f = argv.find(a => a.startsWith(`--${key}=`))
    return f ? f.split('=')[1] : null
  }

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const toDate = get('to') ? parseDMY(get('to')) : today

  let fromDate
  if (get('from')) {
    fromDate = parseDMY(get('from'))
  } else {
    const years = Math.min(parseInt(get('years')) || 15, 15)
    fromDate = new Date(toDate)
    fromDate.setUTCFullYear(fromDate.getUTCFullYear() - years)
  }
  fromDate.setUTCHours(0, 0, 0, 0)
  toDate.setUTCHours(0, 0, 0, 0)

  const apiBase = (get('api') || process.env.API_URL || 'https://apikqxs.org').replace(/\/$/, '')

  return { fromDate, toDate, apiBase }
}

function parseDMY(str) {
  const [d, m, y] = str.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms))

function toUrlDate(date) {
  return [
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    date.getUTCFullYear(),
  ].join('-')
}

function toDisplayDate(date) {
  return [
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    date.getUTCFullYear(),
  ].join('/')
}

function formatETA(ms) {
  if (ms < 60000)   return `${Math.round(ms / 1000)}s`
  if (ms < 3600000) return `${Math.round(ms / 60000)} phút`
  const h = Math.floor(ms / 3600000)
  const m = Math.round((ms % 3600000) / 60000)
  return `${h}h${m}m`
}

async function fetchHtml(url) {
  const { data } = await axios.get(url, {
    headers: {
      'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept-Language': 'vi-VN,vi;q=0.9',
    },
    timeout: 20000,
  })
  return data
}

// ── Parsers ──────────────────────────────────────────────────────────────────

function parseMB(html) {
  const $ = cheerio.load(html)
  const prizes = {}
  const table  = $('table.table-xsmb').first()
  if (!table.length) return null

  table.find('tr').each((_, row) => {
    const tds   = $(row).find('td')
    if (tds.length < 2) return
    const label = $(tds[0]).text().trim()

    if (label === 'Mã ĐB') {
      const codes = []
      $(tds[1]).find('span.special-code').each((_, s) => {
        const c = $(s).text().trim()
        if (c) codes.push(c)
      })
      if (codes.length) prizes.specialCodes = codes
      return
    }

    const key = PRIZE_MAP[label]
    if (!key) return
    const nums = []
    $(tds[1]).find('span').each((_, s) => {
      const n = $(s).text().trim()
      if (n) nums.push(n)
    })
    if (nums.length) prizes[key] = nums
  })

  return Object.keys(prizes).length ? prizes : null
}

function parseMNMT(html) {
  const $ = cheerio.load(html)
  const table = $('table.table-xsmn').first()
  if (!table.length) return null

  const codes = []
  table.find('thead th a').each((_, a) => {
    const m = ($(a).attr('href') || '').match(/\/(xs[a-z]+)-/)
    if (m) codes.push(m[1].toUpperCase())
  })
  if (!codes.length) return null

  const result = {}
  codes.forEach(c => { result[c] = {} })

  table.find('tbody tr').each((_, row) => {
    const tds = $(row).find('td')
    if (tds.length < 2) return
    const key = PRIZE_MAP[$(tds[0]).text().trim()]
    if (!key) return
    codes.forEach((code, i) => {
      const cell = tds[i + 1]
      if (!cell) return
      const nums = []
      $(cell).find('span').each((_, s) => {
        const n = $(s).text().trim()
        if (n) nums.push(n)
      })
      if (nums.length) result[code][key] = nums
    })
  })

  return result
}

// ── API helpers ──────────────────────────────────────────────────────────────

async function loadMaps(apiBase) {
  process.stdout.write('Đang tải danh sách region & province từ API...')

  const [rRes, pRes] = await Promise.all([
    axios.get(`${apiBase}/api/regions`,   { timeout: PUSH_TIMEOUT }),
    axios.get(`${apiBase}/api/provinces`, { timeout: PUSH_TIMEOUT }),
  ])

  const regionMap   = Object.fromEntries((rRes.data.data || []).map(r => [r.code, r]))
  const provinceMap = Object.fromEntries((pRes.data.data || []).map(p => [p.code, p]))

  const rc = Object.keys(regionMap).length
  const pc = Object.keys(provinceMap).length
  console.log(` OK (${rc} miền, ${pc} tỉnh)\n`)

  if (!rc || !pc) throw new Error('API trả về danh sách rỗng — kiểm tra lại API_URL và seed data')

  return { regionMap, provinceMap }
}

/**
 * POST 1 record lên API.
 * Trả về: 'created' | 'duplicate' | 'error'
 */
async function pushRecord(apiBase, body) {
  try {
    await axios.post(`${apiBase}/api/results`, body, { timeout: PUSH_TIMEOUT })
    return 'created'
  } catch (e) {
    const status = e.response?.status
    // 409 Conflict hoặc 500 với lỗi duplicate key (code 11000)
    const isDupe = status === 409
      || (status === 500 && e.response?.data?.message?.includes('duplicate'))
      || (status === 500 && e.response?.data?.message?.includes('E11000'))
    return isDupe ? 'duplicate' : 'error'
  }
}

// ── Crawl + push 1 ngày ───────────────────────────────────────────────────────

async function processDay(date, apiBase, regionMap, provinceMap, stats) {
  const urlDate = toUrlDate(date)

  for (const [prefix, regionCode] of [['xsmb','MB'],['xsmn','MN'],['xsmt','MT']]) {
    const region = regionMap[regionCode]
    if (!region) continue

    const url = `${SOURCE_URL}/${prefix}-${urlDate}.html`
    let html

    try {
      html = await fetchHtml(url)
    } catch (e) {
      if (e.response?.status === 404) { stats.notFound++; continue }
      stats.fetchErrors++
      continue
    }

    if (regionCode === 'MB') {
      const province = provinceMap['XSMB']
      if (!province) continue
      const prizes = parseMB(html)
      if (!prizes) { stats.parseEmpty++; continue }

      const res = await pushRecord(apiBase, {
        date:     date.toISOString(),
        province: province._id,
        region:   region._id,
        prizes,
      })
      if (res === 'created')   stats.created++
      if (res === 'duplicate') stats.dupes++
      if (res === 'error')     stats.pushErrors++

    } else {
      const byProvince = parseMNMT(html)
      if (!byProvince) { stats.parseEmpty++; continue }

      for (const [code, prizes] of Object.entries(byProvince)) {
        const province = provinceMap[code]
        if (!province || !Object.keys(prizes).length) continue

        const res = await pushRecord(apiBase, {
          date:     date.toISOString(),
          province: province._id,
          region:   region._id,
          prizes,
        })
        if (res === 'created')   stats.created++
        if (res === 'duplicate') stats.dupes++
        if (res === 'error')     stats.pushErrors++
      }
    }

    await sleep(CRAWL_DELAY_MS)
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { fromDate, toDate, apiBase } = parseArgs()

  console.log(`\n  API target : ${apiBase}`)
  console.log(`  Nguồn crawl: ${SOURCE_URL}\n`)

  // Test kết nối API
  try {
    await axios.get(`${apiBase}/api/regions`, { timeout: 5000 })
  } catch (e) {
    console.error(`✗ Không kết nối được tới API (${apiBase}): ${e.message}`)
    process.exit(1)
  }

  const { regionMap, provinceMap } = await loadMaps(apiBase)

  // Build danh sách ngày
  const dates = []
  const cur   = new Date(fromDate)
  while (cur <= toDate) {
    dates.push(new Date(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  const total  = dates.length
  const estMs  = total * 3 * CRAWL_DELAY_MS

  console.log(`Khoảng thời gian : ${toDisplayDate(fromDate)} → ${toDisplayDate(toDate)}`)
  console.log(`Số ngày          : ${total.toLocaleString()}`)
  console.log(`Ước tính         : ~${formatETA(estMs)} (thực tế nhanh hơn vì skip duplicate)\n`)

  const stats = { created: 0, dupes: 0, fetchErrors: 0, pushErrors: 0, notFound: 0, parseEmpty: 0 }
  let stopping = false

  process.on('SIGINT', () => {
    console.log('\n\n⚠  Đang dừng — hoàn thành ngày hiện tại...')
    stopping = true
  })

  const startTime = Date.now()

  for (let i = 0; i < dates.length; i++) {
    if (stopping) break

    const elapsed = Date.now() - startTime
    const rate    = i > 0 ? elapsed / i : 0
    const eta     = rate > 0 ? formatETA(rate * (total - i)) : '...'

    process.stdout.write(
      `\r[${String(i + 1).padStart(5)}/${total}] ${toDisplayDate(dates[i])}` +
      `  +${stats.created} skip:${stats.dupes} err:${stats.pushErrors + stats.fetchErrors}` +
      `  ETA:${eta}   `
    )

    await processDay(dates[i], apiBase, regionMap, provinceMap, stats)
  }

  const elapsed = ((Date.now() - startTime) / 60000).toFixed(1)
  console.log('\n')
  console.log('══════════════════════════════════════════')
  console.log(`✓ Xong sau ${elapsed} phút`)
  console.log(`  Đã tạo mới   : ${stats.created.toLocaleString()} records`)
  console.log(`  Đã tồn tại   : ${stats.dupes.toLocaleString()} records (bỏ qua)`)
  console.log(`  Không tìm thấy: ${stats.notFound.toLocaleString()} ngày (404)`)
  console.log(`  Lỗi fetch    : ${stats.fetchErrors}`)
  console.log(`  Lỗi push API : ${stats.pushErrors}`)
  console.log('══════════════════════════════════════════\n')
}

main().catch(err => {
  console.error('\n✗', err.message)
  process.exit(1)
})
