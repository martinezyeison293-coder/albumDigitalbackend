const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// Models
const User = require('./models/User');
const Album = require('./models/Album');
const Sticker = require('./models/Sticker');
const UserCollection = require('./models/UserCollection');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mialbum';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- Auth Middleware ---
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token, auth denied' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// --- Endpoints ---

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    let user = await User.findOne({ username });
    if (user) return res.status(400).json({ message: 'User already exists' });
    
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    user = new User({ username, passwordHash, xp: 100, availablePacks: { basic: 3, premium: 0 } });
    await user.save();
    
    // Create empty collection for the first album
    const album = await Album.findOne();
    if (album) {
      const collection = new UserCollection({ userId: user._id, albumId: album._id, collectedStickers: [] });
      await collection.save();
    }
    
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { username, level: user.level, xp: user.xp, availablePacks: user.availablePacks } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
    
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user._id, username, level: user.level, xp: user.xp, availablePacks: user.availablePacks } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Album info and Stickers
app.get('/api/albums/current', authMiddleware, async (req, res) => {
  try {
    const album = await Album.findOne();
    const stickers = await Sticker.find({ albumId: album._id }).sort({ number: 1 });
    const collection = await UserCollection.findOne({ userId: req.user.id, albumId: album._id });
    
    res.json({ album, stickers, collection });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Open Pack
app.post('/api/packs/open', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.availablePacks.basic <= 0) return res.status(400).json({ message: 'No packs available' });
    
    user.availablePacks.basic -= 1;
    await user.save();
    
    // Gacha Engine (simplified)
    const album = await Album.findOne();
    const allStickers = await Sticker.find({ albumId: album._id });
    
    // Select 3 random stickers for a pack
    const obtainedStickers = [];
    for(let i=0; i<3; i++) {
       const randomIdx = Math.floor(Math.random() * allStickers.length);
       obtainedStickers.push(allStickers[randomIdx]);
    }
    
    // Save to collection
    const collection = await UserCollection.findOne({ userId: user._id, albumId: album._id });
    
    obtainedStickers.forEach(sticker => {
      const existing = collection.collectedStickers.find(s => s.stickerId.toString() === sticker._id.toString());
      if (existing) {
        existing.quantity += 1;
      } else {
        collection.collectedStickers.push({ stickerId: sticker._id, quantity: 1, isPlaced: false });
      }
    });
    
    await collection.save();
    
    res.json({ obtainedStickers, availablePacks: user.availablePacks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Place Sticker in Album
app.post('/api/collection/place/:stickerId', authMiddleware, async (req, res) => {
  try {
    const { stickerId } = req.params;
    const album = await Album.findOne();
    const collection = await UserCollection.findOne({ userId: req.user.id, albumId: album._id });
    
    const stickerInCol = collection.collectedStickers.find(s => s.stickerId.toString() === stickerId);
    
    if (!stickerInCol || stickerInCol.quantity <= 0) {
      return res.status(400).json({ message: 'You do not own this sticker' });
    }
    if (stickerInCol.isPlaced) {
      return res.status(400).json({ message: 'Sticker already placed' });
    }
    
    stickerInCol.isPlaced = true;
    
    // Grant XP
    const user = await User.findById(req.user.id);
    user.xp += 10;
    await user.save();
    
    await collection.save();
    
    res.json({ success: true, xp: user.xp, collection });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
