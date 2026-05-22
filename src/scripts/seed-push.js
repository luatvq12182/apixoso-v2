/**
 * Seed Region + Province lên remote API.
 * Chạy trên máy local trước khi crawl-push.js.
 *
 * Usage:
 *   node src/scripts/seed-push.js
 *   node src/scripts/seed-push.js --api=https://apikqxs.org
 *   API_URL=https://apikqxs.org node src/scripts/seed-push.js
 */

require('dotenv').config()
const axios = require('axios')

const API_BASE = (
  process.argv.find(a => a.startsWith('--api='))?.split('=')[1]
  || process.env.API_URL
  || 'https://apikqxs.org'
).replace(/\/$/, '')

// ── Seed data (giống seed.js) ─────────────────────────────────────────────────

const REGIONS = [
  { code: 'MB', name: 'Miền Bắc',  drawTime: '18:15' },
  { code: 'MT', name: 'Miền Trung', drawTime: '17:15' },
  { code: 'MN', name: 'Miền Nam',  drawTime: '16:15' },
]

// schedule: 1=T2, 2=T3, 3=T4, 4=T5, 5=T6, 6=T7, 7=CN
const PROVINCES = {
  MB: [
    { code: 'XSMB', name: 'Miền Bắc', schedule: [1,2,3,4,5,6,7] },
  ],
  MT: [
    { code: 'XSPY',  name: 'Phú Yên',      schedule: [1] },
    { code: 'XSTTH', name: 'Huế',           schedule: [1,7] },
    { code: 'XSDLK', name: 'Đắk Lắk',      schedule: [2] },
    { code: 'XSQNA', name: 'Quảng Nam',     schedule: [2] },
    { code: 'XSDNA', name: 'Đà Nẵng',       schedule: [3,6] },
    { code: 'XSKH',  name: 'Khánh Hòa',     schedule: [3,7] },
    { code: 'XSQB',  name: 'Quảng Bình',    schedule: [4] },
    { code: 'XSBDI', name: 'Bình Định',      schedule: [4] },
    { code: 'XSQT',  name: 'Quảng Trị',     schedule: [4] },
    { code: 'XSGL',  name: 'Gia Lai',        schedule: [5] },
    { code: 'XSNT',  name: 'Ninh Thuận',     schedule: [5] },
    { code: 'XSQNG', name: 'Quảng Ngãi',    schedule: [6] },
    { code: 'XSDNO', name: 'Đắk Nông',      schedule: [6] },
    { code: 'XSKT',  name: 'Kon Tum',        schedule: [7] },
  ],
  MN: [
    { code: 'XSHCM', name: 'TP. Hồ Chí Minh', schedule: [1,6] },
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function post(path, body) {
  const res = await axios.post(`${API_BASE}${path}`, body, { timeout: 10000 })
  return res.data.data
}

async function checkExisting(path) {
  const res = await axios.get(`${API_BASE}${path}`, { timeout: 10000 })
  return res.data.data || []
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nAPI target: ${API_BASE}\n`)

  // Test kết nối
  try {
    await axios.get(`${API_BASE}/api/regions`, { timeout: 5000 })
  } catch (e) {
    console.error(`✗ Không kết nối được tới API: ${e.message}`)
    process.exit(1)
  }

  // ── Kiểm tra region đã tồn tại chưa ───────────────────────────────────────
  const existingRegions = await checkExisting('/api/regions')
  if (existingRegions.length > 0) {
    console.log(`⚠  Đã có ${existingRegions.length} region trong DB:`)
    existingRegions.forEach(r => console.log(`   - ${r.code}: ${r.name}`))
    console.log('\nBỏ qua bước tạo region (không ghi đè).\n')
  }

  // ── Tạo Regions (chỉ tạo code nào chưa có) ────────────────────────────────
  const regionMap = Object.fromEntries(existingRegions.map(r => [r.code, r._id]))
  const missingRegions = REGIONS.filter(r => !regionMap[r.code])

  if (missingRegions.length) {
    console.log('Đang tạo regions...')
    for (const r of missingRegions) {
      const created = await post('/api/regions', r)
      regionMap[r.code] = created._id
      console.log(`  ✓ ${r.code} — ${r.name}`)
    }
  } else {
    console.log('✓ Regions đã đầy đủ.')
  }

  // ── Kiểm tra province đã tồn tại chưa ─────────────────────────────────────
  const existingProvinces = await checkExisting('/api/provinces')
  const existingCodes = new Set(existingProvinces.map(p => p.code))

  if (existingProvinces.length > 0) {
    console.log(`\n⚠  Đã có ${existingProvinces.length} province trong DB.`)
    console.log('Chỉ tạo thêm những tỉnh còn thiếu.\n')
  }

  // ── Tạo Provinces (chỉ tạo code nào chưa có) ──────────────────────────────
  console.log('Đang tạo provinces...')
  let created = 0
  let skipped = 0

  for (const [regionCode, provinces] of Object.entries(PROVINCES)) {
    const regionId = regionMap[regionCode]
    if (!regionId) {
      console.error(`  ✗ Không tìm thấy region ${regionCode}`)
      continue
    }

    for (const p of provinces) {
      if (existingCodes.has(p.code)) {
        skipped++
        continue
      }
      await post('/api/provinces', { ...p, region: regionId })
      console.log(`  ✓ ${p.code} — ${p.name} (${regionCode})`)
      created++
    }
  }

  console.log(`\n══════════════════════════════════`)
  console.log(`✓ Seed hoàn thành!`)
  console.log(`  Regions  : ${Object.keys(regionMap).length} (${missingRegions.length} mới tạo)`)
  console.log(`  Provinces: ${created} mới tạo, ${skipped} đã tồn tại`)
  console.log(`══════════════════════════════════`)
  console.log(`\nBước tiếp theo: chạy crawl-push.js để đẩy kết quả lên API.\n`)
}

main().catch(err => {
  console.error('✗', err.response?.data || err.message)
  process.exit(1)
})
