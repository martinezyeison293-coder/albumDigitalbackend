const mongoose = require('mongoose');

const userCollectionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  albumId: { type: mongoose.Schema.Types.ObjectId, ref: 'Album' },
  collectedStickers: [{
    stickerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sticker' },
    quantity: { type: Number, default: 1 },
    isPlaced: { type: Boolean, default: false }
  }]
});

module.exports = mongoose.model('UserCollection', userCollectionSchema);
