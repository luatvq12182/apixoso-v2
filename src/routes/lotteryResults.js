const router = require('express').Router()
const c = require('../controllers/lotteryResultController')
const resolveRegion = require('../middlewares/resolveRegion')

// GET /api/results?date=2026-04-18&region=south|north|center|mn|mt|mb|<id>&province=<id>&limit=20
router.get('/', resolveRegion, c.getAll)

// GET /api/results/by-ky?region=mb&day=2&limit=10&page=1
// Phân trang theo số kỳ quay thưởng thực tế.
// day: 1=T2, 2=T3, 3=T4, 4=T5, 5=T6, 6=T7, 7=CN (tuỳ chọn, chỉ dùng với region)
router.get('/by-ky', resolveRegion, c.getByKy)

// GET /api/results/so?region=mb&days=30
// Sổ kết quả: toàn bộ kết quả trong N ngày gần nhất, gom nhóm theo ngày.
// days: 10 | 30 | 60 | 90 | 200 | 300 (tối đa 365)
router.get('/so', resolveRegion, c.getSo)

router.get('/:id', c.getOne)
router.post('/', c.create)
router.put('/:id', c.update)
router.delete('/:id', c.remove)

module.exports = router
