const errorHandler = (err, req, res, next) => {
  console.error(err.stack)

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message)
    return res.status(400).json({ success: false, message: messages.join(', ') })
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0]
    return res.status(400).json({ success: false, message: `${field} đã tồn tại` })
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'ID không hợp lệ' })
  }

  res.status(500).json({ success: false, message: 'Lỗi server' })
}

module.exports = errorHandler
