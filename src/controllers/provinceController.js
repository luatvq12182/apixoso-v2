const Province = require('../models/Province')
const asyncHandler = require('../middlewares/asyncHandler')

const getAll = asyncHandler(async (req, res) => {
  const filter = {}
  if (req.query.region) filter.region = req.query.region
  if (req.query.day) filter.schedule = Number(req.query.day)

  const provinces = await Province.find(filter).populate('region', 'code name drawTime').sort('code')
  res.json({ success: true, data: provinces })
})

const getOne = asyncHandler(async (req, res) => {
  const province = await Province.findById(req.params.id).populate('region', 'code name drawTime')
  if (!province) return res.status(404).json({ success: false, message: 'Không tìm thấy đài' })
  res.json({ success: true, data: province })
})

const create = asyncHandler(async (req, res) => {
  const province = await Province.create(req.body)
  res.status(201).json({ success: true, data: province })
})

const update = asyncHandler(async (req, res) => {
  const province = await Province.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  })
  if (!province) return res.status(404).json({ success: false, message: 'Không tìm thấy đài' })
  res.json({ success: true, data: province })
})

const remove = asyncHandler(async (req, res) => {
  const province = await Province.findByIdAndDelete(req.params.id)
  if (!province) return res.status(404).json({ success: false, message: 'Không tìm thấy đài' })
  res.json({ success: true, message: 'Đã xóa' })
})

module.exports = { getAll, getOne, create, update, remove }
