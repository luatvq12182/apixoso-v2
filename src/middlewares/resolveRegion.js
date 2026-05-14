const mongoose = require('mongoose')
const Region   = require('../models/Region')
const Province = require('../models/Province')

const REGION_ALIAS = {
  north:  'MB',
  south:  'MN',
  center: 'MT',
  mb:     'MB',
  mn:     'MN',
  mt:     'MT',
}

const regionCache   = {}   // code  → ObjectId string
const provinceCache = {}   // code  → ObjectId string

function isObjectId(v) {
  return mongoose.Types.ObjectId.isValid(v) && String(new mongoose.Types.ObjectId(v)) === v
}

async function resolveRegionId(value) {
  if (!value || isObjectId(value)) return value
  const code = REGION_ALIAS[value.toLowerCase()]
  if (!code) return value
  if (regionCache[code]) return regionCache[code]
  const doc = await Region.findOne({ code }).lean()
  if (doc) regionCache[code] = String(doc._id)
  return regionCache[code] || value
}

async function resolveProvinceId(value) {
  if (!value || isObjectId(value)) return value
  const key = value.toUpperCase()
  if (provinceCache[key]) return provinceCache[key]
  // Tìm theo code (vd: XSHCM) hoặc name (vd: "TP. Hồ Chí Minh")
  const doc = await Province.findOne({
    $or: [{ code: key }, { name: new RegExp(`^${value}$`, 'i') }],
  }).lean()
  if (doc) provinceCache[key] = String(doc._id)
  return provinceCache[key] || value
}

module.exports = async (req, res, next) => {
  try {
    const [region, province] = await Promise.all([
      resolveRegionId(req.query.region),
      resolveProvinceId(req.query.province),
    ])
    if (region)   req.query.region   = region
    if (province) req.query.province = province
    next()
  } catch (e) {
    next(e)
  }
}
