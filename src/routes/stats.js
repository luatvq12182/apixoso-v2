const router        = require('express').Router()
const resolveRegion = require('../middlewares/resolveRegion')
const c             = require('../controllers/statsController')

// Tất cả endpoint nhận ?region=&province=&days= (resolveRegion xử lý alias)

// GET /api/stats/lo-tan-suat?region=mb&days=30
router.get('/lo-tan-suat', resolveRegion, c.loTanSuat)

// GET /api/stats/lo-gan?region=mb&days=365
router.get('/lo-gan', resolveRegion, c.loGan)

// GET /api/stats/de-tan-suat?region=south&days=30
router.get('/de-tan-suat', resolveRegion, c.deTanSuat)

// GET /api/stats/de-gan?region=south
router.get('/de-gan', resolveRegion, c.deGan)

// GET /api/stats/dau-duoi?region=mb&days=30
router.get('/dau-duoi', resolveRegion, c.dauDuoi)

// GET /api/stats/chu-ky?region=mb&days=90
router.get('/chu-ky', resolveRegion, c.chuKy)

// GET /api/stats/lo-matrix?region=mb&days=30&parity=all|even|odd
// Ma trận ngày × số: mỗi hàng là 1 ngày, cột là 00-99, kèm tổng và đánh dấu ĐB
router.get('/lo-matrix', resolveRegion, c.loMatrix)

// GET /api/stats/cap-lo?region=mb&days=30&top=20
// Tần suất cặp loto: 2 số hay về cùng nhau nhất
router.get('/cap-lo', resolveRegion, c.capLo)

// GET /api/stats/quick?region=mb&days=30&trend=7&top=10
// Trả về toàn bộ dữ liệu UI thống kê nhanh trong 1 request
router.get('/quick', resolveRegion, c.quickStats)

module.exports = router
