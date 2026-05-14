const router = require('express').Router()
const c = require('../controllers/provinceController')
const resolveRegion = require('../middlewares/resolveRegion')

// GET /api/provinces?region=south|north|center|mn|mt|mb|<id>&day=1
router.get('/', resolveRegion, c.getAll)
router.get('/:id', c.getOne)
router.post('/', c.create)
router.put('/:id', c.update)
router.delete('/:id', c.remove)

module.exports = router
