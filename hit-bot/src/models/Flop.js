const mongoose = require('mongoose');

const flopSchema = new mongoose.Schema(
  {
    guildId: String,
    messageId: String,
    channelId: String,
    hitterId: String,
    middlemanId: String,
    creatorId: String,
    description: String,
    imageUrl: String,
    milk: String,
    victimJoined: String,
    status: { type: String, default: 'pending' }, // pending | accepted | rejected
    ticketChannelId: String
  },
  { timestamps: true }
);

module.exports = mongoose.model('Flop', flopSchema);
