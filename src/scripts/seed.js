require('dotenv').config()
const mongoose = require('mongoose')
const Region = require('../models/Region')
const Province = require('../models/Province')

const regions = [
  { code: 'MB', name: 'Miền Bắc', drawTime: '18:15' },
  { code: 'MT', name: 'Miền Trung', drawTime: '17:15' },
  { code: 'MN', name: 'Miền Nam', drawTime: '16:15' },
]

// schedule: 1=Thứ 2, 2=Thứ 3, 3=Thứ 4, 4=Thứ 5, 5=Thứ 6, 6=Thứ 7, 7=Chủ Nhật
const provincesData = {
  MB: [
    { code: 'XSMB', name: 'Miền Bắc', schedule: [1, 2, 3, 4, 5, 6, 7] },
  ],
  MT: [
    { code: 'XSPY',  name: 'Phú Yên',     schedule: [1] },
    { code: 'XSTTH', name: 'Huế',          schedule: [1, 7] },
    { code: 'XSDLK', name: 'Đắk Lắk',     schedule: [2] },
    { code: 'XSQNA', name: 'Quảng Nam',    schedule: [2] },
    { code: 'XSDNA', name: 'Đà Nẵng',      schedule: [3, 6] },
    { code: 'XSKH',  name: 'Khánh Hòa',    schedule: [3, 7] },
    { code: 'XSQB',  name: 'Quảng Bình',   schedule: [4] },
    { code: 'XSBDI', name: 'Bình Định',     schedule: [4] },
    { code: 'XSQT',  name: 'Quảng Trị',    schedule: [4] },
    { code: 'XSGL',  name: 'Gia Lai',       schedule: [5] },
    { code: 'XSNT',  name: 'Ninh Thuận',    schedule: [5] },
    { code: 'XSQNG', name: 'Quảng Ngãi',   schedule: [6] },
    { code: 'XSDNO', name: 'Đắk Nông',     schedule: [6] },
    { code: 'XSKT',  name: 'Kon Tum',       schedule: [7] },
  ],
  MN: [
    { code: 'XSHCM', name: 'TP. Hồ Chí Minh', schedule: [1, 6] },
    { code: 'XSDT',  name: 'Đồng Tháp',        schedule: [1] },
    { code: 'XSCM',  name: 'Cà Mau',            schedule: [1] },
    { code: 'XSBTR', name: 'Bến Tre',           schedule: [2] },
    { code: 'XSVT',  name: 'Vũng Tàu',          schedule: [2] },
    { code: 'XSBL',  name: 'Bạc Liêu',          schedule: [2] },
    { code: 'XSDN',  name: 'Đồng Nai',          schedule: [3] },
    { code: 'XSCT',  name: 'Cần Thơ',           schedule: [3] },
    { code: 'XSST',  name: 'Sóc Trăng',         schedule: [3] },
    { code: 'XSAG',  name: 'An Giang',           schedule: [4] },
    { code: 'XSTN',  name: 'Tây Ninh',           schedule: [4] },
    { code: 'XSBTH', name: 'Bình Thuận',         schedule: [4] },
    { code: 'XSVL',  name: 'Vĩnh Long',          schedule: [5] },
    { code: 'XSBD',  name: 'Bình Dương',         schedule: [5] },
    { code: 'XSTV',  name: 'Trà Vinh',           schedule: [5] },
    { code: 'XSLA',  name: 'Long An',            schedule: [6] },
    { code: 'XSBP',  name: 'Bình Phước',         schedule: [6] },
    { code: 'XSHG',  name: 'Hậu Giang',          schedule: [6] },
    { code: 'XSTG',  name: 'Tiền Giang',         schedule: [7] },
    { code: 'XSKG',  name: 'Kiên Giang',         schedule: [7] },
    { code: 'XSDL',  name: 'Đà Lạt',             schedule: [7] },
  ],
}

async function seed() {
  await mongoose.connect(process.env.MONGO_URI)
  console.log('MongoDB connected')

  // Xóa data cũ
  await Region.deleteMany({})
  await Province.deleteMany({})
  console.log('Cleared old data')

  // Tạo regions
  const createdRegions = await Region.insertMany(regions)
  const regionMap = {}
  createdRegions.forEach((r) => { regionMap[r.code] = r._id })
  console.log('Regions created:', createdRegions.map((r) => r.code).join(', '))

  // Tạo provinces
  const provincesToInsert = []
  for (const [regionCode, provinces] of Object.entries(provincesData)) {
    for (const p of provinces) {
      provincesToInsert.push({ ...p, region: regionMap[regionCode] })
    }
  }

  const createdProvinces = await Province.insertMany(provincesToInsert)
  console.log(`Provinces created: ${createdProvinces.length} đài`)

  await mongoose.disconnect()
  console.log('Done!')
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
