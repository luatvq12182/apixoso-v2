const path = require('path')
const express = require('express')
const errorHandler = require('./middlewares/errorHandler')

const app = express()

app.use(express.json())

if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, '../public')))
}

app.use('/api/regions', require('./routes/regions'))
app.use('/api/provinces', require('./routes/provinces'))
app.use('/api/results', require('./routes/lotteryResults'))
app.use('/api/live', require('./routes/live'))
app.use('/api/crawl', require('./routes/crawl'))
app.use('/api/stats', require('./routes/stats'))

app.use(errorHandler)

module.exports = app
