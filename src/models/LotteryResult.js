const mongoose = require('mongoose')

// Miền Bắc:  Mã ĐB, G.ĐB(1×5) G.1(1×5) G.2(2×5) G.3(6×5) G.4(4×4) G.5(6×4) G.6(3×3) G.7(4×2)
// Miền T/N:  G.ĐB(1×6) G.1(1×5) G.2(1×5) G.3(2×5) G.4(7×5) G.5(1×4) G.6(3×4) G.7(1×3) G.8(1×2)
const prizesSchema = new mongoose.Schema(
  {
    specialCodes: { type: [String], default: [] },  // Mã ĐB — chỉ MB (vd: 10ZU, 11ZU)
    special: { type: [String], default: [] },        // G.ĐB
    first:   { type: [String], default: [] },        // G.1
    second:  { type: [String], default: [] },        // G.2
    third:   { type: [String], default: [] },        // G.3
    fourth:  { type: [String], default: [] },        // G.4
    fifth:   { type: [String], default: [] },        // G.5
    sixth:   { type: [String], default: [] },        // G.6
    seventh: { type: [String], default: [] },        // G.7
    eighth:  { type: [String], default: [] },        // G.8 — chỉ MT/MN
  },
  { _id: false }
)

const lotteryResultSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
    },
    province: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Province',
      required: true,
    },
    region: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Region',
      required: true,
    },
    prizes: {
      type: prizesSchema,
      required: true,
    },
  },
  { timestamps: true }
)

lotteryResultSchema.index({ date: 1, province: 1 }, { unique: true })
lotteryResultSchema.index({ date: 1, region: 1 })

module.exports = mongoose.model('LotteryResult', lotteryResultSchema)
