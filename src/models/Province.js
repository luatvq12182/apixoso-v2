const mongoose = require('mongoose')

const provinceSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
    },
    region: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Region',
      required: true,
    },
    // 1=Thứ 2, 2=Thứ 3, ..., 7=Chủ Nhật
    schedule: {
      type: [Number],
      required: true,
      validate: {
        validator: (arr) => arr.every((d) => d >= 1 && d <= 7),
        message: 'schedule chỉ nhận giá trị từ 1 đến 7',
      },
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Province', provinceSchema)
