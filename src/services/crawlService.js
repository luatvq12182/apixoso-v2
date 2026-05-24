const axios   = require('axios')
const cheerio  = require('cheerio')
const LotteryResult = require('../models/LotteryResult')

const BASE_URL  = 'https://xosodaiphat.com'
const DELAY_MS  = 1500

const PRIZE_MAP = {
  'G.ĐB': 'special',
  'ĐB':   'special',
  'G.1':  'first',
  'G.2':  'second',
  'G.3':  'third',
  'G.4':  'fourth',
  'G.5':  'fifth',
  'G.6':  'sixth',
  'G.7':  'seventh',
  'G.8':  'eighth',
}

const REGION_URL = { MB: 'xsmb', MN: 'xsmn', MT: 'xsmt' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function toUrlDate(date) {
  const d = String(date.getUTCDate()).padStart(2, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const y = date.getUTCFullYear()
  return `${d}-${m}-${y}`
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
      $(tds[1]).find('span.special-code').each((_, span) => {
        const c = $(span).text().trim()
        if (c) codes.push(c)
      })
      if (codes.length) prizes.specialCodes = codes
      return
    }

    const key = PRIZE_MAP[label]
    if (!key) return
    const numbers = []
    $(tds[1]).find('span').each((_, span) => {
      const n = $(span).text().trim()
      if (n) numbers.push(n)
    })
    if (numbers.length) prizes[key] = numbers
  })

  return prizes
}

function parseMNMT(html) {
  const $ = cheerio.load(html)
  const table = $('table.table-xsmn').first()
  if (!table.length) return null

  const provinceCodes = []
  table.find('thead th a').each((_, a) => {
    const href  = $(a).attr('href') || ''
    const match = href.match(/\/(xs[a-z]+)-/)
    if (match) provinceCodes.push(match[1].toUpperCase())
  })
  if (!provinceCodes.length) return null

  const resultsByProvince = {}
  provinceCodes.forEach((code) => { resultsByProvince[code] = {} })

  table.find('tbody tr').each((_, row) => {
    const tds  = $(row).find('td')
    if (tds.length < 2) return
    const label = $(tds[0]).text().trim()
    const key   = PRIZE_MAP[label]
    if (!key) return

    provinceCodes.forEach((code, i) => {
      const cell = tds[i + 1]
      if (!cell) return
      const numbers = []
      $(cell).find('span').each((_, span) => {
        const n = $(span).text().trim()
        if (n) numbers.push(n)
      })
      if (numbers.length) resultsByProvince[code][key] = numbers
    })
  })

  return resultsByProvince
}

/**
 * Crawl kết quả của 1 miền cho 1 ngày.
 *
 * @param {Date}        date               - UTC midnight
 * @param {string}      regionCode         - 'MB' | 'MN' | 'MT'
 * @param {Object}      regionMap          - { 'MB': regionDoc, ... }
 * @param {Object}      provinceByCode     - { 'XSMB': provinceDoc, ... }
 * @param {string[]|null} filterProvinceCodes - chỉ lưu các tỉnh này; null = tất cả
 * @returns {{ crawled: string[], skipped: string[], errors: string[] }}
 */
async function crawlRegion(date, regionCode, regionMap, provinceByCode, filterProvinceCodes) {
  const out = { crawled: [], skipped: [], errors: [], partial: [] }
  const url = `${BASE_URL}/${REGION_URL[regionCode]}-${toUrlDate(date)}.html`

  let html
  try {
    html = await fetchHtml(url)
  } catch (e) {
    out.errors.push(`Lỗi fetch ${regionCode} (${url}): ${e.message}`)
    return out
  }

  const region = regionMap[regionCode]

  if (regionCode === 'MB') {
    const province = provinceByCode['XSMB']
    if (!province) { out.errors.push('Không tìm thấy XSMB trong DB'); return out }

    if (filterProvinceCodes && !filterProvinceCodes.includes('XSMB')) return out

    const existing = await LotteryResult.findOne({ date, province: province._id }).select('prizes.special').lean()
    if (existing) {
      if (existing.prizes?.special?.length > 0) { out.skipped.push('XSMB'); return out }
      // Record thiếu giải ĐB (crawl lúc chưa quay xong) → xóa để crawl lại
      await LotteryResult.deleteOne({ _id: existing._id })
      out.partial.push('XSMB')
    }

    const prizes = parseMB(html)
    if (!Object.keys(prizes).length) { out.errors.push('XSMB: không parse được dữ liệu'); return out }

    await LotteryResult.create({ date, province: province._id, region: region._id, prizes })
    out.crawled.push('XSMB')

  } else {
    const resultsByProvince = parseMNMT(html)
    if (!resultsByProvince) { out.errors.push(`${regionCode}: không parse được dữ liệu`); return out }

    for (const [code, prizes] of Object.entries(resultsByProvince)) {
      if (filterProvinceCodes && !filterProvinceCodes.includes(code)) continue

      const province = provinceByCode[code]
      if (!province || !Object.keys(prizes).length) continue

      const existing = await LotteryResult.findOne({ date, province: province._id }).select('prizes.special').lean()
      if (existing) {
        if (existing.prizes?.special?.length > 0) { out.skipped.push(code); continue }
        // Record thiếu giải ĐB → xóa để crawl lại
        await LotteryResult.deleteOne({ _id: existing._id })
        out.partial.push(code)
      }

      await LotteryResult.create({ date, province: province._id, region: region._id, prizes })
      out.crawled.push(code)
    }
  }

  return out
}

module.exports = { crawlRegion, fetchHtml, parseMB, parseMNMT, sleep, DELAY_MS, toUrlDate }
