require('dotenv').config()
const axios = require('axios')
const cheerio = require('cheerio')
const mongoose = require('mongoose')
const Region = require('../models/Region')
const Province = require('../models/Province')
const LotteryResult = require('../models/LotteryResult')

const BASE_URL = 'https://xosodaiphat.com'
const DELAY_MS = 1500

const PRIZE_MAP = {
  'G.ĐB': 'special',
  'ĐB':   'special',  // một số trang dùng "ĐB" thay vì "G.ĐB"
  'G.1':  'first',
  'G.2':  'second',
  'G.3':  'third',
  'G.4':  'fourth',
  'G.5':  'fifth',
  'G.6':  'sixth',
  'G.7':  'seventh',
  'G.8':  'eighth',
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

// Ngày → DD-MM-YYYY (format của URL)
const toUrlDate = (date) => {
  const d = String(date.getUTCDate()).padStart(2, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const y = date.getUTCFullYear()
  return `${d}-${m}-${y}`
}

const toDisplayDate = (date) => {
  const d = String(date.getUTCDate()).padStart(2, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const y = date.getUTCFullYear()
  return `${d}/${m}/${y}`
}

async function fetchHtml(url) {
  const { data } = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept-Language': 'vi-VN,vi;q=0.9',
    },
    timeout: 20000,
  })
  return data
}

// Parse kết quả XSMB: 1 cột duy nhất
// HTML: <table class="table-xsmb">
//   <tr><td>Mã ĐB</td><td><div class="madb"><span class="special-code">10ZU</span>...</div></td></tr>
//   <tr><td>G.ĐB</td><td class="text-center"><span>38455</span></td></tr>
function parseMB(html) {
  const $ = cheerio.load(html)
  const prizes = {}

  const table = $('table.table-xsmb').first()
  if (!table.length) return prizes

  table.find('tr').each((_, row) => {
    const tds = $(row).find('td')
    if (tds.length < 2) return

    const label = $(tds[0]).text().trim()

    // Bắt Mã ĐB riêng (span.special-code trong div.madb)
    if (label === 'Mã ĐB') {
      const codes = []
      $(tds[1]).find('span.special-code').each((_, span) => {
        const code = $(span).text().trim()
        if (code) codes.push(code)
      })
      if (codes.length) prizes.specialCodes = codes
      return
    }

    const key = PRIZE_MAP[label]
    if (!key) return

    const numbers = []
    $(tds[1]).find('span').each((_, span) => {
      const num = $(span).text().trim()
      if (num) numbers.push(num)
    })
    if (numbers.length) prizes[key] = numbers
  })

  return prizes
}

// Parse kết quả XSMN/XSMT: nhiều cột theo đài
// Header: <thead><tr><th>Giải</th><th><a href="/xsvl-...">Vĩnh Long</a></th>...
// Body:   <tr><td>G.8</td><td class="tn_prize"><span>31</span></td>...
function parseMNMT(html) {
  const $ = cheerio.load(html)

  // Trang chứa cả XSMN và XSMT — lấy đúng bảng theo class
  const table = $('table.table-xsmn').first()
  if (!table.length) return null

  // Lấy mã đài từ href: /xsvl-xo-so-vinh-long.html → XSVL
  const provinceCodes = []
  table.find('thead th a').each((_, a) => {
    const href = $(a).attr('href') || ''
    const match = href.match(/\/(xs[a-z]+)-/)
    if (match) provinceCodes.push(match[1].toUpperCase())
  })

  if (!provinceCodes.length) return null

  // Khởi tạo object kết quả cho mỗi đài
  const resultsByProvince = {}
  provinceCodes.forEach((code) => { resultsByProvince[code] = {} })

  table.find('tbody tr').each((_, row) => {
    const tds = $(row).find('td')
    if (tds.length < 2) return

    const label = $(tds[0]).text().trim()
    const key = PRIZE_MAP[label]
    if (!key) return

    provinceCodes.forEach((code, i) => {
      const cell = tds[i + 1]
      if (!cell) return
      const numbers = []
      $(cell).find('span').each((_, span) => {
        const num = $(span).text().trim()
        if (num) numbers.push(num)
      })
      if (numbers.length) resultsByProvince[code][key] = numbers
    })
  })

  return resultsByProvince
}

async function crawlDate(date, regionMap, provinceMap, stats) {
  const urlDate = toUrlDate(date)
  const displayDate = toDisplayDate(date)

  // ── Miền Bắc ──────────────────────────────────────────────
  try {
    const html = await fetchHtml(`${BASE_URL}/xsmb-${urlDate}.html`)
    const prizes = parseMB(html)

    if (Object.keys(prizes).length > 0) {
      const province = provinceMap['XSMB']
      const region = regionMap['MB']
      await LotteryResult.findOneAndUpdate(
        { date, province: province._id },
        { date, province: province._id, region: region._id, prizes },
        { upsert: true, new: true, runValidators: true }
      )
      stats.saved++
    }
  } catch (e) {
    stats.errors++
    console.log(`  ✗ MB  ${displayDate}: ${e.message}`)
  }

  await sleep(DELAY_MS)

  // ── Miền Nam ──────────────────────────────────────────────
  try {
    const html = await fetchHtml(`${BASE_URL}/xsmn-${urlDate}.html`)
    const resultsByProvince = parseMNMT(html)

    if (resultsByProvince) {
      const region = regionMap['MN']
      for (const [code, prizes] of Object.entries(resultsByProvince)) {
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
    stats.errors++
    console.log(`  ✗ MN  ${displayDate}: ${e.message}`)
  }

  await sleep(DELAY_MS)

  // ── Miền Trung ────────────────────────────────────────────
  try {
    const html = await fetchHtml(`${BASE_URL}/xsmt-${urlDate}.html`)
    const resultsByProvince = parseMNMT(html)

    if (resultsByProvince) {
      const region = regionMap['MT']
      for (const [code, prizes] of Object.entries(resultsByProvince)) {
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
    stats.errors++
    console.log(`  ✗ MT  ${displayDate}: ${e.message}`)
  }

  await sleep(DELAY_MS)
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI)
  console.log('MongoDB connected\n')

  const regions = await Region.find()
  if (!regions.length) {
    console.error('Chưa có dữ liệu Region. Chạy `npm run seed` trước.')
    process.exit(1)
  }
  const regionMap = Object.fromEntries(regions.map((r) => [r.code, r]))

  const provinces = await Province.find()
  const provinceMap = Object.fromEntries(provinces.map((p) => [p.code, p]))

  // Khoảng thời gian: 3 năm gần nhất
  const today = new Date()
  const startDate = new Date(today)
  startDate.setUTCFullYear(startDate.getUTCFullYear() - 3)

  // Chuẩn hóa về UTC midnight
  today.setUTCHours(0, 0, 0, 0)
  startDate.setUTCHours(0, 0, 0, 0)

  const dates = []
  const cur = new Date(startDate)
  while (cur <= today) {
    dates.push(new Date(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  console.log(`Crawling ${dates.length} ngày: ${toDisplayDate(startDate)} → ${toDisplayDate(today)}`)
  console.log(`Ước tính thời gian: ~${Math.round((dates.length * 3 * DELAY_MS) / 60000)} phút\n`)

  const stats = { saved: 0, errors: 0 }

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]
    process.stdout.write(`[${String(i + 1).padStart(3)}/${dates.length}] ${toDisplayDate(date)} ... `)
    const beforeSaved = stats.saved
    await crawlDate(date, regionMap, provinceMap, stats)
    const added = stats.saved - beforeSaved
    console.log(`+${added} records`)
  }

  console.log(`\n✓ Hoàn thành! Đã lưu: ${stats.saved} records | Lỗi: ${stats.errors}`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
