const Region = require('../models/Region')
const asyncHandler = require('../middlewares/asyncHandler')

const getAll = asyncHandler(async (req, res) => {
  const regions = await Region.find().sort('code')
  res.json({ success: true, data: regions })
})

const getOne = asyncHandler(async (req, res) => {
  const region = await Region.findById(req.params.id)
  if (!region) return res.status(404).json({ success: false, message: 'Không tìm thấy miền' })
  res.json({ success: true, data: region })
})

const create = asyncHandler(async (req, res) => {
  const region = await Region.create(req.body)
  res.status(201).json({ success: true, data: region })
})

const update = asyncHandler(async (req, res) => {
  const region = await Region.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  })
  if (!region) return res.status(404).json({ success: false, message: 'Không tìm thấy miền' })
  res.json({ success: true, data: region })
})

const remove = asyncHandler(async (req, res) => {
  const region = await Region.findByIdAndDelete(req.params.id)
  if (!region) return res.status(404).json({ success: false, message: 'Không tìm thấy miền' })
  res.json({ success: true, message: 'Đã xóa' })
})

module.exports = { getAll, getOne, create, update, remove }
