const mongoose     = require('mongoose')
const LotteryResult = require('../models/LotteryResult')
const asyncHandler = require('../middlewares/asyncHandler')

const buildDateFilter = (dateStr) => {
  const d = new Date(dateStr)
  const start = new Date(d.setHours(0, 0, 0, 0))
  const end = new Date(d.setHours(23, 59, 59, 999))
  return { $gte: start, $lte: end }
}

const getAll = asyncHandler(async (req, res) => {
  const filter = {}
  if (req.query.date) filter.date = buildDateFilter(req.query.date)
  if (req.query.province) filter.province = req.query.province
  if (req.query.region) filter.region = req.query.region

  const results = await LotteryResult.find(filter)
    .populate('province', 'code name')
    .populate('region', 'code name')
    .sort({ date: -1 })
    .limit(Number(req.query.limit) || 20)

  res.json({ success: true, data: results })
})

const getOne = asyncHandler(async (req, res) => {
  const result = await LotteryResult.findById(req.params.id)
    .populate('province', 'code name schedule')
    .populate('region', 'code name drawTime')
  if (!result) return res.status(404).json({ success: false, message: 'Không tìm thấy kết quả' })
  res.json({ success: true, data: result })
})

const create = asyncHandler(async (req, res) => {
  const result = await LotteryResult.create(req.body)
  res.status(201).json({ success: true, data: result })
})

const update = asyncHandler(async (req, res) => {
  const result = await LotteryResult.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  })
  if (!result) return res.status(404).json({ success: false, message: 'Không tìm thấy kết quả' })
  res.json({ success: true, data: result })
})

const remove = asyncHandler(async (req, res) => {
  const result = await LotteryResult.findByIdAndDelete(req.params.id)
  if (!result) return res.status(404).json({ success: false, message: 'Không tìm thấy kết quả' })
  res.json({ success: true, message: 'Đã xóa' })
})

// VN: 1=T2, 2=T3, 3=T4, 4=T5, 5=T6, 6=T7, 7=CN
// MongoDB $dayOfWeek: 1=CN, 2=T2, ..., 7=T7
const VN_DAY_LABEL = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật']

function vnDayToMongo(vnDay) {
  return (vnDay % 7) + 1   // 1→2, 2→3, ..., 6→7, 7→1
}

function dateToVnDay(date) {
  // getUTCDay: 0=Sun,1=Mon,...,6=Sat → VN: CN=7,T2=1,...,T7=6
  const utcDay = new Date(date).getUTCDay()
  return utcDay === 0 ? 7 : utcDay   // 0→7, 1→1, ..., 6→6
}

// GET /api/results/by-ky?region=mb&province=XSHCM&day=2&limit=10&page=1
// Phân trang theo số kỳ quay thưởng thực tế.
// day: 1=T2, 2=T3, ..., 7=CN (tuỳ chọn, chỉ áp dụng với region, không áp dụng province lẻ)
const getByKy = asyncHandler(async (req, res) => {
  const page  = Math.max(parseInt(req.query.page)  || 1, 1)
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100)

  // Build match filter — resolveRegion đã chuyển alias → ObjectId string
  const match = {}
  if (req.query.province && mongoose.Types.ObjectId.isValid(req.query.province)) {
    match.province = new mongoose.Types.ObjectId(String(req.query.province))
  } else if (req.query.region && mongoose.Types.ObjectId.isValid(req.query.region)) {
    match.region = new mongoose.Types.ObjectId(String(req.query.region))
  }

  // Lọc theo thứ (chỉ có ý nghĩa với region, không áp dụng tỉnh lẻ)
  const dayVN = parseInt(req.query.day)
  const dayStages = (dayVN >= 1 && dayVN <= 7 && !req.query.province)
    ? [
        { $addFields: { _dow: { $dayOfWeek: '$date' } } },
        { $match:     { _dow: vnDayToMongo(dayVN) } },
      ]
    : []

  const basePipeline = [
    { $match: match },
    ...dayStages,
    { $group: { _id: '$date' } },
    { $sort:  { _id: -1 } },
  ]

  // Bước 1: đếm tổng số kỳ (distinct dates sau khi lọc thứ)
  const [countDoc] = await LotteryResult.aggregate([...basePipeline, { $count: 'total' }])
  const total      = countDoc?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  if (total === 0) {
    return res.json({ success: true, page, limit, total: 0, totalPages: 0, data: [] })
  }

  // Bước 2: lấy danh sách dates của trang hiện tại
  const dateDocs = await LotteryResult.aggregate([
    ...basePipeline,
    { $skip:  (page - 1) * limit },
    { $limit: limit },
  ])
  const dates = dateDocs.map(d => d._id)

  // Bước 3: fetch toàn bộ kết quả của các dates đó
  const results = await LotteryResult.find({ ...match, date: { $in: dates } })
    .sort({ date: -1 })
    .populate('province', 'code name schedule')
    .populate('region',   'code name drawTime')
    .lean()

  // Bước 4: gom nhóm theo ngày, giữ thứ tự đã phân trang
  const byDate = {}
  for (const r of results) {
    const key = r.date.toISOString().slice(0, 10)
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(r)
  }

  const data = dates.map(d => {
    const dateStr = d.toISOString().slice(0, 10)
    const vn      = dateToVnDay(d)
    return {
      date:       dateStr,
      dayOfWeek:  vn,
      dayLabel:   VN_DAY_LABEL[vn],
      results:    byDate[dateStr] || [],
    }
  })

  res.json({ success: true, page, limit, total, totalPages, data })
})

// VN day helpers (reused by getSo)
function fmtDate(date) { return new Date(date).toISOString().slice(0, 10) }

// GET /api/results/so?region=mb&days=30
// Trả về toàn bộ kết quả trong N ngày gần nhất, gom nhóm theo ngày.
// days: 10 | 30 | 60 | 90 | 200 | 300 (hoặc bất kỳ, tối đa 365)
const getSo = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365)

  const endDate   = new Date(); endDate.setUTCHours(0, 0, 0, 0)
  const startDate = new Date(endDate)
  startDate.setUTCDate(endDate.getUTCDate() - days + 1)

  const filter = { date: { $gte: startDate, $lte: endDate } }

  if (req.query.province && mongoose.Types.ObjectId.isValid(req.query.province)) {
    filter.province = new mongoose.Types.ObjectId(String(req.query.province))
  } else if (req.query.region && mongoose.Types.ObjectId.isValid(req.query.region)) {
    filter.region = new mongoose.Types.ObjectId(String(req.query.region))
  }

  const results = await LotteryResult.find(filter)
    .populate('province', 'code name schedule')
    .populate('region',   'code name drawTime')
    .sort({ date: -1 })
    .lean()

  // Gom theo ngày
  const byDate = {}
  for (const r of results) {
    const key = fmtDate(r.date)
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(r)
  }

  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  const data = sortedDates.map(dateStr => {
    const vn = dateToVnDay(dateStr)
    return {
      date:      dateStr,
      dayOfWeek: vn,
      dayLabel:  VN_DAY_LABEL[vn],
      results:   byDate[dateStr],
    }
  })

  res.json({
    success: true,
    period:  { from: fmtDate(startDate), to: fmtDate(endDate), days },
    totalKy: sortedDates.length,
    data,
  })
})

module.exports = { getAll, getByKy, getSo, getOne, create, update, remove }
