const mongoose = require('mongoose')

const regionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      enum: ['MB', 'MT', 'MN'],
    },
    name: {
      type: String,
      required: true,
    },
    drawTime: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Region', regionSchema)
