const router = require('express').Router()
const c = require('../controllers/crawlController')

// POST /api/crawl
// Body: { date: "YYYY-MM-DD", region?: "south|north|center|mn|mt|mb|<id>", province?: "XSHCM|<name>|<id>" }
router.post('/', c.crawlByDate)

module.exports = router
