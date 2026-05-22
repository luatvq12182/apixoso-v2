/**
 * Crawl lịch sử kết quả xổ số — tối đa 15 năm trở về trước.
 *
 * Usage:
 *   node src/scripts/crawl-history.js                     # 15 năm gần nhất
 *   node src/scripts/crawl-history.js --years=5           # 5 năm
 *   node src/scripts/crawl-history.js --from=01-01-2020   # từ ngày cụ thể (DD-MM-YYYY)
 *   node src/scripts/crawl-history.js --from=01-01-2015 --to=31-12-2019
 *
 * Tính năng:
 *   - Skip ngày đã có đủ dữ liệu trong DB (an toàn khi chạy lại)
 *   - In tiến độ theo batch + ETA cập nhật liên tục
 *   - Graceful shutdown (Ctrl+C) — in tóm tắt trước khi thoát
 */

require('dotenv').config()
const axios    = require('axios')
const cheerio  = require('cheerio')
const mongoose = require('mongoose')
const Region        = require('../models/Region')
const Province      = require('../models/Province')
const LotteryResult = require('../models/LotteryResult')

// ── Config ───────────────────────────────────────────────────────────────────
const BASE_URL = 'https://xosodaiphat.com'
const DELAY_MS = 1000    // 1s giữa các region/ngày (đủ lịch sự với server nguồn)
const MAX_YEARS = 15

const PRIZE_MAP = {
  'G.ĐB': 'special', 'ĐB': 'special',
  'G.1':  'first',   'G.2': 'second', 'G.3': 'third',
  'G.4':  'fourth',  'G.5': 'fifth',  'G.6': 'sixth',
  'G.7':  'seventh', 'G.8': 'eighth',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function toUrlDate(date) {
  const d = String(date.getUTCDate()).padStart(2, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const y = date.getUTCFullYear()
  return `${d}-${m}-${y}`
}

function toDisplayDate(date) {
  const d = String(date.getUTCDate()).padStart(2, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const y = date.getUTCFullYear()
  return `${d}/${m}/${y}`
}

function parseArgs() {
  const args = process.argv.slice(2)
  const get  = (key) => {
    const found = args.find(a => a.startsWith(`--${key}=`))
    return found ? found.split('=')[1] : null
  }

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // --to
  const toArg = get('to')
  const toDate = toArg ? parseDMY(toArg) : today

  // --from hoặc --years
  const fromArg  = get('from')
  const yearsArg = get('years')
  let fromDate

  if (fromArg) {
    fromDate = parseDMY(fromArg)
  } else {
    const years = Math.min(parseInt(yearsArg) || MAX_YEARS, MAX_YEARS)
    fromDate = new Date(toDate)
    fromDate.setUTCFullYear(fromDate.getUTCFullYear() - years)
  }

  fromDate.setUTCHours(0, 0, 0, 0)
  toDate.setUTCHours(0, 0, 0, 0)
  return { fromDate, toDate }
}

function parseDMY(str) {
  // DD-MM-YYYY
  const [d, m, y] = str.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function formatETA(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
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

// ── Parsers (same as crawl.js) ────────────────────────────────────────────────

function parseMB(html) {
  const $ = cheerio.load(html)
  const prizes = {}
  const table = $('table.table-xsmb').first()
  if (!table.length) return prizes

  table.find('tr').each((_, row) => {
    const tds = $(row).find('td')
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
  return prizes
}

function parseMNMT(html) {
  const $ = cheerio.load(html)
  const table = $('table.table-xsmn').first()
  if (!table.length) return null

  const codes = []
  table.find('thead th a').each((_, a) => {
    const href  = $(a).attr('href') || ''
    const match = href.match(/\/(xs[a-z]+)-/)
    if (match) codes.push(match[1].toUpperCase())
  })
  if (!codes.length) return null

  const byProvince = {}
  codes.forEach(c => { byProvince[c] = {} })

  table.find('tbody tr').each((_, row) => {
    const tds  = $(row).find('td')
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
      if (nums.length) byProvince[code][key] = nums
    })
  })
  return byProvince
}

// ── Crawl 1 ngày ─────────────────────────────────────────────────────────────

async function crawlDay(date, regionMap, provinceMap, stats) {
  const urlDate = toUrlDate(date)

  for (const [regionKey, regionCode] of [['MB','MB'],['MN','MN'],['MT','MT']]) {
    const region = regionMap[regionCode]
    if (!region) continue

    // Skip nhanh nếu đã có bất kỳ record nào của region này hôm nay
    const already = await LotteryResult.countDocuments({ date, region: region._id })
    if (already > 0) {
      stats.skipped++
      continue
    }

    const prefix = regionCode === 'MB' ? 'xsmb' : regionCode === 'MN' ? 'xsmn' : 'xsmt'
    const url = `${BASE_URL}/${prefix}-${urlDate}.html`

    try {
      const html = await fetchHtml(url)

      if (regionCode === 'MB') {
        const province = provinceMap['XSMB']
        if (!province) continue
        const prizes = parseMB(html)
        if (!Object.keys(prizes).length) { stats.empty++; continue }
        await LotteryResult.findOneAndUpdate(
          { date, province: province._id },
          { date, province: province._id, region: region._id, prizes },
          { upsert: true, new: true, runValidators: true }
        )
        stats.saved++

      } else {
        const byProvince = parseMNMT(html)
        if (!byProvince) { stats.empty++; continue }
        for (const [code, prizes] of Object.entries(byProvince)) {
          const province = provinceMap[code]
          if (!province || !Object.keys(prizes).length) continue
          await LotteryResult.findOneAndUpdate(
            { date, province: province._id },
            { date, province: province._id, region: region._id, prizes },
            { upsert: true, new: true, runValidators: true }
          )
          stats.saved++
        }
      }
    } catch (e) {
      // 404 = trang không tồn tại (ngày chưa có hoặc nguồn không lưu xa)
      if (e.response?.status === 404) {
        stats.notFound++
      } else {
        stats.errors++
        console.error(`\n  ✗ ${regionCode} ${toDisplayDate(date)}: ${e.message}`)
      }
    }

    await sleep(DELAY_MS)
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { fromDate, toDate } = parseArgs()

  await mongoose.connect(process.env.MONGO_URI)
  console.log('MongoDB connected\n')

  const regions  = await Region.find()
  if (!regions.length) {
    console.error('Chưa có dữ liệu Region. Chạy `npm run seed` trước.')
    process.exit(1)
  }
  const regionMap   = Object.fromEntries(regions.map(r => [r.code, r]))
  const provinces   = await Province.find()
  const provinceMap = Object.fromEntries(provinces.map(p => [p.code, p]))

  // Build danh sách ngày
  const dates = []
  const cur   = new Date(fromDate)
  while (cur <= toDate) {
    dates.push(new Date(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  const totalDays   = dates.length
  // Ước tính: mỗi ngày tối đa 3 region × DELAY_MS (skip không mất thời gian đáng kể)
  const estMs       = totalDays * 3 * DELAY_MS

  console.log(`Crawl lịch sử KQXS`)
  console.log(`  Khoảng: ${toDisplayDate(fromDate)} → ${toDisplayDate(toDate)}`)
  console.log(`  Số ngày: ${totalDays.toLocaleString()}`)
  console.log(`  Ước tính (không skip): ~${formatETA(estMs)}`)
  console.log(`  (Các ngày đã có data trong DB sẽ được bỏ qua tự động)\n`)

  const stats = { saved: 0, skipped: 0, errors: 0, notFound: 0, empty: 0 }
  let stopping = false

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n⚠  Nhận tín hiệu dừng — hoàn thành ngày hiện tại rồi thoát...')
    stopping = true
  })

  const startTime = Date.now()

  for (let i = 0; i < dates.length; i++) {
    if (stopping) break

    const date    = dates[i]
    const elapsed = Date.now() - startTime
    const rate    = i > 0 ? elapsed / i : 0
    const eta     = rate > 0 ? formatETA(rate * (totalDays - i)) : '...'

    process.stdout.write(
      `\r[${String(i + 1).padStart(5)}/${totalDays}] ${toDisplayDate(date)}  ` +
      `saved:${stats.saved}  skip:${stats.skipped}  err:${stats.errors}  ETA:${eta}   `
    )

    await crawlDay(date, regionMap, provinceMap, stats)
  }

  const elapsed = ((Date.now() - startTime) / 60000).toFixed(1)
  console.log('\n')
  console.log('══════════════════════════════════════════')
  console.log(`✓ Hoàn thành sau ${elapsed} phút`)
  console.log(`  Đã lưu    : ${stats.saved.toLocaleString()} records`)
  console.log(`  Đã skip   : ${stats.skipped.toLocaleString()} ngày (đã có data)`)
  console.log(`  Không tìm : ${stats.notFound.toLocaleString()} ngày (404)`)
  console.log(`  Lỗi       : ${stats.errors}`)
  console.log('══════════════════════════════════════════')

  await mongoose.disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
