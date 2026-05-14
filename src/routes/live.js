const router = require('express').Router()
const { waitForUpdate } = require('../services/liveService')

const VALID_REGIONS = ['mb', 'mt', 'mn']

/**
 * GET /api/live/:region?since=<timestamp>
 *
 * Long polling — server giữ request đến khi có data mới hoặc timeout 25s.
 * Client nhận JSON rồi lập tức gọi lại với since=<ts mới nhận được>.
 * Dễ proxy qua WordPress / Nginx / bất kỳ HTTP proxy nào.
 */
router.get('/:region', async (req, res) => {
  const region = req.params.region.toLowerCase()
  if (!VALID_REGIONS.includes(region)) {
    return res.status(400).json({ success: false, message: 'Region phải là mb | mt | mn' })
  }

  const since = Number(req.query.since) || 0

  try {
    const payload = await waitForUpdate(region, since)

    if (!payload) {
      // Timeout — báo client poll lại
      return res.json({ ok: false, timeout: true, ts: Date.now() })
    }

    res.json(payload)
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, ts: Date.now() })
  }
})

module.exports = router
