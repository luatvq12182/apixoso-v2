const mongoose    = require('mongoose')
const asyncHandler = require('../middlewares/asyncHandler')
const LotteryResult = require('../models/LotteryResult')

// ─── Helpers ────────────────────────────────────────────────────────────────

const PRIZE_FIELDS = ['special','first','second','third','fourth','fifth','sixth','seventh','eighth']

/** Trả về tất cả lô (2 chữ số cuối) từ một kết quả */
function extractLos(result) {
  return PRIZE_FIELDS.flatMap(f =>
    (result.prizes?.[f] || [])
      .filter(n => n && n.length >= 2)
      .map(n => n.slice(-2))
  )
}

/** 2 chữ số cuối G.ĐB */
function extractDe(result) {
  const sp = result.prizes?.special
  if (!sp?.length) return null
  const n = sp[0]
  return n && n.length >= 2 ? n.slice(-2) : null
}

function fmtDate(date) {
  return new Date(date).toISOString().slice(0, 10)
}

/** Tất cả cặp lô 00–99 */
function initFreq() {
  const f = {}
  for (let i = 0; i <= 99; i++) f[String(i).padStart(2, '0')] = 0
  return f
}

/** parity: 'even' | 'odd' | 'all' (default) */
function applyParity(lo, parity) {
  if (parity === 'even') return parseInt(lo) % 2 === 0
  if (parity === 'odd')  return parseInt(lo) % 2 === 1
  return true
}

function parseParity(query) {
  return ['even', 'odd'].includes(query.parity) ? query.parity : 'all'
}

/**
 * Xây filter Mongoose từ req.query (sau khi resolveRegion đã chạy).
 * days: số ngày nhìn lại (1 = chỉ hôm nay, 30 = 30 ngày gần nhất)
 */
function buildFilter(query, days) {
  const match = {}

  if (query.province && mongoose.Types.ObjectId.isValid(query.province)) {
    match.province = new mongoose.Types.ObjectId(query.province)
  } else if (query.region && mongoose.Types.ObjectId.isValid(query.region)) {
    match.region = new mongoose.Types.ObjectId(query.region)
  }

  const endDate   = new Date(); endDate.setUTCHours(0, 0, 0, 0)
  const startDate = new Date(endDate)
  startDate.setUTCDate(endDate.getUTCDate() - days + 1)

  match.date = { $gte: startDate, $lte: endDate }
  return { match, startDate, endDate }
}

// ─── 1. Tần suất lô ─────────────────────────────────────────────────────────

// parity: 'even' | 'odd' | 'all'
exports.loTanSuat = asyncHandler(async (req, res) => {
  const days   = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365)
  const parity = parseParity(req.query)
  const { match, startDate, endDate } = buildFilter(req.query, days)

  const results = await LotteryResult.find(match).select('prizes').lean()

  const freq = initFreq()
  for (const r of results) {
    for (const lo of extractLos(r)) {
      if (applyParity(lo, parity)) freq[lo]++
    }
  }

  const data = Object.entries(freq)
    .filter(([lo]) => applyParity(lo, parity))
    .map(([lo, count]) => ({ lo, dau: lo[0], duoi: lo[1], count }))
    .sort((a, b) => b.count - a.count || a.lo.localeCompare(b.lo))

  res.json({
    success: true,
    period:  { from: fmtDate(startDate), to: fmtDate(endDate), days },
    parity,
    data,
  })
})

// ─── 2. Lô gan ──────────────────────────────────────────────────────────────

// parity: 'even' | 'odd' | 'all'
exports.loGan = asyncHandler(async (req, res) => {
  const days   = Math.min(Math.max(parseInt(req.query.days) || 365, 1), 365)
  const parity = parseParity(req.query)
  const { match, endDate } = buildFilter(req.query, days)

  const results = await LotteryResult.find(match).select('prizes date').sort({ date: -1 }).lean()

  const lastSeen = {}
  for (const r of results) {
    const d = fmtDate(r.date)
    for (const lo of extractLos(r)) {
      if (applyParity(lo, parity) && !lastSeen[lo]) lastSeen[lo] = d
    }
  }

  const today    = fmtDate(endDate)
  const msPerDay = 86400000

  const data = []
  for (let i = 0; i <= 99; i++) {
    const lo = String(i).padStart(2, '0')
    if (!applyParity(lo, parity)) continue
    const lastDate = lastSeen[lo] || null
    const gan = lastDate
      ? Math.floor((new Date(today) - new Date(lastDate)) / msPerDay)
      : null
    data.push({ lo, dau: lo[0], duoi: lo[1], gan, lastDate })
  }

  data.sort((a, b) => (b.gan ?? -1) - (a.gan ?? -1))

  res.json({ success: true, asOf: today, parity, data })
})

// ─── 3. Tần suất đề ─────────────────────────────────────────────────────────

exports.deTanSuat = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365)
  const { match, startDate, endDate } = buildFilter(req.query, days)

  const results = await LotteryResult.find(match).select('prizes').lean()

  const freq = initFreq()
  for (const r of results) {
    const de = extractDe(r)
    if (de) freq[de]++
  }

  const data = Object.entries(freq)
    .map(([de, count]) => ({ de, dau: de[0], duoi: de[1], count }))
    .sort((a, b) => b.count - a.count || a.de.localeCompare(b.de))

  res.json({
    success: true,
    period:  { from: fmtDate(startDate), to: fmtDate(endDate), days },
    data,
  })
})

// ─── 4. Đề gan ──────────────────────────────────────────────────────────────

exports.deGan = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 365, 1), 365)
  const { match, endDate } = buildFilter(req.query, days)

  const results = await LotteryResult.find(match).select('prizes date').sort({ date: -1 }).lean()

  const lastSeen = {}
  for (const r of results) {
    const de = extractDe(r)
    if (de && !lastSeen[de]) lastSeen[de] = fmtDate(r.date)
  }

  const today = fmtDate(endDate)
  const msPerDay = 86400000

  const data = []
  for (let i = 0; i <= 99; i++) {
    const de = String(i).padStart(2, '0')
    const lastDate = lastSeen[de] || null
    const gan = lastDate
      ? Math.floor((new Date(today) - new Date(lastDate)) / msPerDay)
      : null
    data.push({ de, dau: de[0], duoi: de[1], gan, lastDate })
  }

  data.sort((a, b) => (b.gan ?? -1) - (a.gan ?? -1))

  res.json({ success: true, asOf: today, data })
})

// ─── 5. Thống kê đầu / đuôi ─────────────────────────────────────────────────

exports.dauDuoi = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365)
  const { match, startDate, endDate } = buildFilter(req.query, days)

  const results = await LotteryResult.find(match).select('prizes').lean()

  const dauFreq  = Array(10).fill(0)
  const duoiFreq = Array(10).fill(0)
  let total = 0

  for (const r of results) {
    for (const lo of extractLos(r)) {
      dauFreq[parseInt(lo[0])]++
      duoiFreq[parseInt(lo[1])]++
      total++
    }
  }

  const pct = (n) => total ? Math.round((n / total) * 1000) / 10 : 0

  const dau  = dauFreq.map((count, i)  => ({ dau:  String(i), count, pct: pct(count) }))
  const duoi = duoiFreq.map((count, i) => ({ duoi: String(i), count, pct: pct(count) }))

  res.json({
    success: true,
    period:  { from: fmtDate(startDate), to: fmtDate(endDate), days },
    total,
    dau,
    duoi,
  })
})

// ─── 6. Chu kỳ trung bình ───────────────────────────────────────────────────

exports.chuKy = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 90, 7), 365)
  const { match, startDate, endDate } = buildFilter(req.query, days)

  const results = await LotteryResult.find(match).select('prizes date').sort({ date: 1 }).lean()

  // Gom theo ngày để tránh đếm trùng khi nhiều tỉnh cùng ngày
  const byDate = {}
  for (const r of results) {
    const d = fmtDate(r.date)
    if (!byDate[d]) byDate[d] = new Set()
    for (const lo of extractLos(r)) byDate[d].add(lo)
  }

  // Xây danh sách ngày xuất hiện cho từng lô
  const appearances = {}
  for (let i = 0; i <= 99; i++) appearances[String(i).padStart(2, '0')] = []

  for (const [d, losSet] of Object.entries(byDate).sort()) {
    const ts = new Date(d).getTime()
    for (const lo of losSet) appearances[lo].push(ts)
  }

  const msPerDay = 86400000

  const data = Object.entries(appearances).map(([lo, dates]) => {
    const count    = dates.length
    const lastDate = count ? fmtDate(new Date(dates[count - 1])) : null

    let chuKy = null
    if (count >= 2) {
      let totalGap = 0
      for (let i = 1; i < dates.length; i++) totalGap += (dates[i] - dates[i - 1]) / msPerDay
      chuKy = Math.round((totalGap / (count - 1)) * 10) / 10
    }

    return { lo, dau: lo[0], duoi: lo[1], chuKy, appearances: count, lastDate }
  })

  // Sắp xếp theo chu kỳ tăng dần (về thường nhất trước), null xuống cuối
  data.sort((a, b) => {
    if (a.chuKy === null && b.chuKy === null) return 0
    if (a.chuKy === null) return 1
    if (b.chuKy === null) return -1
    return a.chuKy - b.chuKy
  })

  res.json({
    success: true,
    period:  { from: fmtDate(startDate), to: fmtDate(endDate), days },
    data,
  })
})

// ─── 7. Ma trận ngày × số ───────────────────────────────────────────────────
// GET /api/stats/lo-matrix?region=mb&days=30&parity=all|even|odd
// Mỗi phần tử matrix: { date, counts: {lo: n}, special: "XX" }
// summary: tổng lần về của mỗi số trong khoảng

exports.loMatrix = asyncHandler(async (req, res) => {
  const days   = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 1000)
  const parity = parseParity(req.query)
  const { match, startDate, endDate } = buildFilter(req.query, days)

  const results = await LotteryResult.find(match)
    .select('prizes date')
    .sort({ date: -1 })
    .lean()

  // Gom theo ngày
  const byDate = {}
  for (const r of results) {
    const d = fmtDate(r.date)
    if (!byDate[d]) byDate[d] = { counts: {}, special: null }

    for (const lo of extractLos(r)) {
      if (!applyParity(lo, parity)) continue
      byDate[d].counts[lo] = (byDate[d].counts[lo] || 0) + 1
    }

    if (!byDate[d].special) {
      const de = extractDe(r)
      if (de) byDate[d].special = de   // giữ ĐB dù có filter (để highlight)
    }
  }

  // Summary: tổng count mỗi số
  const summary = {}
  for (let i = 0; i <= 99; i++) {
    const lo = String(i).padStart(2, '0')
    if (applyParity(lo, parity)) summary[lo] = 0
  }
  for (const { counts } of Object.values(byDate)) {
    for (const [lo, cnt] of Object.entries(counts)) {
      if (summary[lo] !== undefined) summary[lo] += cnt
    }
  }

  // Matrix: mỗi hàng là 1 ngày, sort mới → cũ
  const matrix = Object.entries(byDate)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, { counts, special }]) => ({ date, counts, special }))

  res.json({
    success: true,
    period:  { from: fmtDate(startDate), to: fmtDate(endDate), days },
    parity,
    summary,
    matrix,
  })
})

// ─── 8. Tần suất cặp loto ────────────────────────────────────────────────────
// GET /api/stats/cap-lo?region=mb&days=30&top=20
// Đếm số lần 2 lô cùng về trong 1 ngày quay

exports.capLo = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365)
  const top  = Math.min(Math.max(parseInt(req.query.top)  || 20, 1), 200)
  const { match, startDate, endDate } = buildFilter(req.query, days)

  const results = await LotteryResult.find(match)
    .select('prizes date')
    .lean()

  // Gom lô unique theo ngày (dùng Set để tránh đếm trùng trong 1 ngày)
  const byDate = {}
  for (const r of results) {
    const d = fmtDate(r.date)
    if (!byDate[d]) byDate[d] = new Set()
    for (const lo of extractLos(r)) byDate[d].add(lo)
  }

  // Đếm đồng xuất hiện của từng cặp
  const pairCount = {}
  for (const loSet of Object.values(byDate)) {
    const arr = Array.from(loSet).sort()
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = arr[i] + '_' + arr[j]
        pairCount[key] = (pairCount[key] || 0) + 1
      }
    }
  }

  const data = Object.entries(pairCount)
    .map(([key, count]) => {
      const [a, b] = key.split('_')
      return { pair: [a, b], count }
    })
    .sort((a, b) => b.count - a.count || a.pair[0].localeCompare(b.pair[0]))
    .slice(0, top)

  res.json({
    success: true,
    period:  { from: fmtDate(startDate), to: fmtDate(endDate), days },
    data,
  })
})

// ─── 9. Quick stats — tất cả dữ liệu UI thống kê nhanh ──────────────────────
// GET /api/stats/quick?region=mb&days=30&trend=7&top=10
// Trả về: summary + loNong + loGan + dau — chỉ 1 DB query, tính in-memory
// Lô gan tính theo số KỲ thực tế (đúng với MN/MT quay không đều)

exports.quickStats = asyncHandler(async (req, res) => {
  const days  = Math.min(Math.max(parseInt(req.query.days)  || 30, 1), 365)
  const trend = Math.min(Math.max(parseInt(req.query.trend) || 7,  1), days)
  const top   = Math.min(Math.max(parseInt(req.query.top)   || 10, 1), 50)

  const { match, startDate, endDate } = buildFilter(req.query, days)

  // ── 1 DB query duy nhất ─────────────────────────────────────────────────
  const results = await LotteryResult.find(match).select('prizes date').lean()

  if (!results.length) {
    return res.json({
      success: true,
      summary: { totalKy: 0, period: { from: fmtDate(startDate), to: fmtDate(endDate), days } },
      loNong: [], loGan: [], dau: [],
    })
  }

  // ── Gom theo ngày ────────────────────────────────────────────────────────
  // loSet: unique lô per day (cho lô gan đúng kỳ)
  // loArr: tất cả lô per day kể cả trùng (cho tần suất)
  const byDate = {}
  for (const r of results) {
    const d = fmtDate(r.date)
    if (!byDate[d]) byDate[d] = { loSet: new Set(), loArr: [] }
    for (const lo of extractLos(r)) {
      byDate[d].loSet.add(lo)
      byDate[d].loArr.push(lo)
    }
  }

  // Danh sách ngày quay, sort mới → cũ
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))
  const totalKy = sortedDates.length

  // ── Tần suất lô & đầu số ────────────────────────────────────────────────
  const loFreq  = initFreq()
  const dauFreq = Array(10).fill(0)

  for (const d of sortedDates) {
    for (const lo of byDate[d].loArr) {
      loFreq[lo]++
      dauFreq[parseInt(lo[0])]++
    }
  }

  // ── Trend: đếm riêng trong `trend` ngày gần nhất ────────────────────────
  const trendStart = new Date(endDate)
  trendStart.setUTCDate(trendStart.getUTCDate() - trend + 1)
  const trendStartStr = fmtDate(trendStart)

  const loTrend = initFreq()
  for (const d of sortedDates) {
    if (d < trendStartStr) break   // sortedDates DESC → break khi qua vùng trend
    for (const lo of byDate[d].loArr) loTrend[lo]++
  }

  // ── Lô gan theo kỳ ──────────────────────────────────────────────────────
  // loLastIdx[lo] = index trong sortedDates của lần xuất hiện gần nhất
  // gan = số kỳ đã qua = chính là index đó (sortedDates[0] = kỳ mới nhất)
  const loLastIdx = {}
  for (let i = 0; i < sortedDates.length; i++) {
    for (const lo of byDate[sortedDates[i]].loSet) {
      if (loLastIdx[lo] === undefined) loLastIdx[lo] = i
    }
  }

  // ── Build loNong ─────────────────────────────────────────────────────────
  const loNong = Object.entries(loFreq)
    .map(([lo, count]) => ({
      lo,
      count,
      trend:    loTrend[lo] || 0,
      lastDate: loLastIdx[lo] !== undefined ? sortedDates[loLastIdx[lo]] : null,
    }))
    .sort((a, b) => b.count - a.count || a.lo.localeCompare(b.lo))
    .slice(0, top)

  // ── Build loGan ──────────────────────────────────────────────────────────
  const loGanAll = []
  for (let i = 0; i <= 99; i++) {
    const lo  = String(i).padStart(2, '0')
    const idx = loLastIdx[lo]
    loGanAll.push({
      lo,
      gan:      idx !== undefined ? idx : null,   // null = chưa về trong kỳ
      lastDate: idx !== undefined ? sortedDates[idx] : null,
    })
  }
  loGanAll.sort((a, b) => (b.gan ?? -1) - (a.gan ?? -1))
  const loGan = loGanAll.slice(0, top)

  // ── Đầu số ──────────────────────────────────────────────────────────────
  const dau = dauFreq.map((count, i) => ({ dau: String(i), count }))

  // ── Lô liên tiếp ─────────────────────────────────────────────────────────
  // Chỉ tính lô đang ra trong kỳ gần nhất và liên tiếp ít nhất 2 kỳ
  const recentSet = byDate[sortedDates[0]]?.loSet || new Set()
  const loLienTiep = []
  for (let i = 0; i <= 99; i++) {
    const lo = String(i).padStart(2, '0')
    if (!recentSet.has(lo)) continue   // không có ở kỳ gần nhất → streak = 0
    let streak = 1
    for (let j = 1; j < sortedDates.length; j++) {
      if (byDate[sortedDates[j]]?.loSet.has(lo)) streak++
      else break
    }
    if (streak >= 2) loLienTiep.push({ lo, streak })
  }
  loLienTiep.sort((a, b) => b.streak - a.streak || a.lo.localeCompare(b.lo))
  const loLienTiepTop = loLienTiep.slice(0, top)

  // ── Summary ──────────────────────────────────────────────────────────────
  const topLo  = Object.entries(loFreq).sort((a, b) => b[1] - a[1])[0]
  const topGan = loGanAll[0]
  const topDau = dau.reduce((max, d) => d.count > max.count ? d : max)

  res.json({
    success: true,
    summary: {
      totalKy,
      period:      { from: fmtDate(startDate), to: fmtDate(endDate), days },
      loNhieuNhat: topLo  ? { lo: topLo[0],  count: topLo[1], outOf: totalKy } : null,
      loGanDai:    topGan ? { lo: topGan.lo, gan:   topGan.gan, lastDate: topGan.lastDate } : null,
      dauDanDau:   topDau ? { dau: topDau.dau, count: topDau.count } : null,
    },
    loNong,        // top N lô về nhiều nhất + trend count
    loGan,         // top N lô gan dài nhất (theo kỳ)
    loLienTiep: loLienTiepTop,  // top N lô đang ra liên tiếp (streak >= 2 kỳ gần nhất)
    dau,           // tần suất đầu số 0–9
  })
})
