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
const Activity = require('./models/Activity');

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mialbum';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

const CREDITS_ON_REGISTER = 100;
const DAILY_CREDITS = 20;
const PACK_COST = { basic: 25, premium: 60 };

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const allowedOrigins = [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'albumdigitalbackend' });
});

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

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  next();
};

// Helpers
const logActivity = async (userId, username, action, details = {}) => {
  try {
    await Activity.create({ userId, username, action, details });
  } catch (err) { /* non-blocking */ }
};

const publicUser = (user) => ({
  id: user._id,
  username: user.username,
  role: user.role,
  credits: user.credits,
  xp: user.xp,
  level: user.level,
  availablePacks: user.availablePacks
});

// --- Endpoints ---

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });

    let user = await User.findOne({ username });
    if (user) return res.status(400).json({ message: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    user = new User({
      username,
      passwordHash,
      role: 'user',
      credits: CREDITS_ON_REGISTER,
      xp: 100,
      level: 1,
      availablePacks: { basic: 3, premium: 0 }
    });
    await user.save();

    // Create empty collection for the first album
    const album = await Album.findOne();
    if (album) {
      const collection = new UserCollection({ userId: user._id, albumId: album._id, collectedStickers: [] });
      await collection.save();
    }

    await logActivity(user._id, user.username, 'register', { creditsGranted: CREDITS_ON_REGISTER });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: publicUser(user) });
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

    // Daily credits (once per day)
    let dailyCreditsGranted = false;
    const today = new Date().toDateString();
    const lastDaily = user.lastDailyCreditsAt ? new Date(user.lastDailyCreditsAt).toDateString() : null;
    if (lastDaily !== today) {
      user.credits += DAILY_CREDITS;
      user.lastDailyCreditsAt = new Date();
      dailyCreditsGranted = true;
      await user.save();
      await logActivity(user._id, user.username, 'daily_credits', { creditsGranted: DAILY_CREDITS });
    }

    await logActivity(user._id, user.username, 'login', { dailyCreditsGranted });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: publicUser(user), dailyCreditsGranted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Me
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: publicUser(user) });
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

// Open Pack (costs a free pack if available, otherwise credits)
app.post('/api/packs/open', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    let freePacks = user.availablePacks.basic + user.availablePacks.premium;
    if (freePacks <= 0 && user.credits < PACK_COST.basic) {
      return res.status(400).json({ message: 'No tienes sobres ni créditos suficientes' });
    }

    if (freePacks > 0) {
      if (user.availablePacks.premium > 0) user.availablePacks.premium -= 1;
      else user.availablePacks.basic -= 1;
    } else {
      user.credits -= PACK_COST.basic;
    }
    await user.save();

    // Gacha Engine (simplified)
    const album = await Album.findOne();
    const allStickers = await Sticker.find({ albumId: album._id });

    // Select 3 random stickers for a pack
    const obtainedStickers = [];
    for (let i = 0; i < 3; i++) {
      const randomIdx = Math.floor(Math.random() * allStickers.length);
      obtainedStickers.push(allStickers[randomIdx]);
    }

    // Save to collection
    const collection = await UserCollection.findOne({ userId: user._id, albumId: album._id });
    if (!collection) {
      return res.status(400).json({ message: 'Colección no encontrada' });
    }

    const newOnes = [];
    obtainedStickers.forEach(sticker => {
      const existing = collection.collectedStickers.find(s => s.stickerId.toString() === sticker._id.toString());
      if (existing) {
        existing.quantity += 1;
      } else {
        collection.collectedStickers.push({ stickerId: sticker._id, quantity: 1, isPlaced: false });
        newOnes.push(sticker);
      }
    });

    await collection.save();

    await logActivity(user._id, user.username, 'pack_open', { packType: 'basic', count: obtainedStickers.length });
    if (newOnes.length) {
      await logActivity(user._id, user.username, 'sticker_obtained', { newCount: newOnes.length, stickers: newOnes.map(s => s.number) });
    }

    res.json({ obtainedStickers, availablePacks: user.availablePacks, credits: user.credits, newOnes });
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

    await logActivity(user._id, user.username, 'sticker_placed', { stickerId });

    res.json({ success: true, xp: user.xp, credits: user.credits, collection });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Admin endpoints ---
app.get('/api/admin/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/activity', authMiddleware, adminOnly, async (req, res) => {
  try {
    const activities = await Activity.find().sort({ createdAt: -1 }).limit(300);
    res.json({ activities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [users, stickers, collections, activities] = await Promise.all([
      User.countDocuments(),
      Sticker.countDocuments(),
      UserCollection.countDocuments(),
      Activity.countDocuments()
    ]);
    res.json({ users, stickers, collections, activities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));