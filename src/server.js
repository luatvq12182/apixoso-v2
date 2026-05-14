require('dotenv').config()
const mongoose = require('mongoose')
const app = require('./app')

const PORT = process.env.PORT || 3083
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/kqxs'

const { initWebSocket }              = require('./services/liveService')
const { scheduleFallbacks, startupCheck } = require('./services/autoCrawl')

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected')

    // Kết nối WebSocket ngay khi server start (không chờ có client poll)
    initWebSocket()

    // Kiểm tra nếu server restart sau giờ quay thưởng → crawl liền
    await startupCheck()

    // Lên lịch fallback hàng ngày cho cả 3 miền
    scheduleFallbacks()

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err)
    process.exit(1)
  })
