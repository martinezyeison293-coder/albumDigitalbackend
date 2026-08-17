const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  credits: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  availablePacks: {
    basic: { type: Number, default: 0 },
    premium: { type: Number, default: 0 }
  },
  lastDailyCreditsAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);