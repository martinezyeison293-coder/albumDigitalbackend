const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  availablePacks: {
    basic: { type: Number, default: 3 },
    premium: { type: Number, default: 0 }
  }
});

module.exports = mongoose.model('User', userSchema);
