const mongoose = require('mongoose');

const stickerSchema = new mongoose.Schema({
  albumId: { type: mongoose.Schema.Types.ObjectId, ref: 'Album' },
  number: Number,
  name: String,
  image: String,
  rarity: { type: String, enum: ['common', 'rare', 'epic', 'legendary'] },
  rarityWeight: Number
});

module.exports = mongoose.model('Sticker', stickerSchema);
