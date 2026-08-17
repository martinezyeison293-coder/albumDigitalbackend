const mongoose = require('mongoose');

const albumSchema = new mongoose.Schema({
  name: String,
  description: String,
  totalStickers: Number
});

module.exports = mongoose.model('Album', albumSchema);
