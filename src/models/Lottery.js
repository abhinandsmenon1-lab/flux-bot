const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    amount: { type: Number, required: true, default: 0 }
  },
  { _id: false }
);

const lotterySchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  channelId: String,
  startingPrize: { type: Number, default: 0 },
  prizePool: { type: Number, default: 0 },
  minEntry: { type: Number, default: 1 },
  maxEntry: { type: Number, default: 20000 },
  drawAt: Date,
  participants: { type: [participantSchema], default: [] },
  active: { type: Boolean, default: false }
});

module.exports = mongoose.model('Lottery', lotterySchema);
