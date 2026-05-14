const mongoose   = require('mongoose')
const asyncHandler = require('../middlewares/asyncHandler')
const Region     = require('../models/Region')
const Province   = require('../models/Province')
const { crawlRegion, sleep, DELAY_MS } = require('../services/crawlService')

const REGION_ALIAS = {
  north: 'MB', south: 'MN', center: 'MT',
  mb: 'MB', mn: 'MN', mt: 'MT',
}

function isObjectId(v) {
  return mongoose.Types.ObjectId.isValid(v) && String(new mongoose.Types.ObjectId(v)) === v
}

function parseRegionCode(param, regions) {
  if (!param) return null
  const alias = REGION_ALIAS[param.toLowerCase()]
  if (alias) return alias
  if (isObjectId(param)) {
    const r = regions.find((r) => String(r._id) === param)
    return r ? r.code : null
  }
  return null
}

function resolveProvince(param, provinces, regionById) {
  if (!param) return null
  if (isObjectId(param)) return provinces.find((p) => String(p._id) === param) || null
  const upper = param.toUpperCase()
  return (
    provinces.find((p) => p.code === upper) ||
    provinces.find((p) => p.name.toLowerCase() === param.toLowerCase()) ||
    null
  )
}

exports.crawlByDate = asyncHandler(async (req, res) => {
  const { date: dateStr, region: regionParam, province: provinceParam } = req.body

  if (!dateStr) {
    return res.status(400).json({ success: false, message: 'Thiếu tham số bắt buộc: date (YYYY-MM-DD)' })
  }

  const date = new Date(dateStr)
  date.setUTCHours(0, 0, 0, 0)
  if (isNaN(date.getTime())) {
    return res.status(400).json({ success: false, message: 'date không hợp lệ. Dùng định dạng YYYY-MM-DD' })
  }

  const [regions, allProvinces] = await Promise.all([
    Region.find().lean(),
    Province.find().lean(),
  ])

  const regionMap      = Object.fromEntries(regions.map((r) => [r.code, r]))
  const provinceByCode = Object.fromEntries(allProvinces.map((p) => [p.code, p]))
  const regionById     = Object.fromEntries(regions.map((r) => [String(r._id), r]))

  // Xác định danh sách miền và bộ lọc tỉnh cần crawl
  let targetRegionCodes  = ['MB', 'MN', 'MT']
  let filterProvinceCodes = null   // null = không lọc, lấy tất cả tỉnh trong miền

  if (provinceParam) {
    const prov = resolveProvince(provinceParam, allProvinces, regionById)
    if (!prov) {
      return res.status(404).json({ success: false, message: `Không tìm thấy tỉnh: ${provinceParam}` })
    }
    const provRegion = regionById[String(prov.region)]
    if (!provRegion) {
      return res.status(500).json({ success: false, message: 'Dữ liệu tỉnh không có miền hợp lệ' })
    }
    targetRegionCodes   = [provRegion.code]
    filterProvinceCodes = [prov.code]

  } else if (regionParam) {
    const code = parseRegionCode(regionParam, regions)
    if (!code) {
      return res.status(404).json({ success: false, message: `Không tìm thấy miền: ${regionParam}` })
    }
    targetRegionCodes = [code]
  }

  // Crawl từng miền tuần tự (tránh spam)
  const summary = { date: dateStr, crawled: [], skipped: [], errors: [] }

  for (let i = 0; i < targetRegionCodes.length; i++) {
    const result = await crawlRegion(
      date,
      targetRegionCodes[i],
      regionMap,
      provinceByCode,
      filterProvinceCodes
    )
    summary.crawled.push(...result.crawled)
    summary.skipped.push(...result.skipped)
    summary.errors.push(...result.errors)

    if (i < targetRegionCodes.length - 1) await sleep(DELAY_MS)
  }

  res.json({
    success: true,
    date:    dateStr,
    crawled: summary.crawled,
    skipped: summary.skipped,
    errors:  summary.errors,
    total:   { crawled: summary.crawled.length, skipped: summary.skipped.length, errors: summary.errors.length },
  })
})
