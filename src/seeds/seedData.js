const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Album = require('../models/Album');
const Sticker = require('../models/Sticker');
const User = require('../models/User');
const UserCollection = require('../models/UserCollection');
const stickerFiles = require('./stickerFiles.json');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mialbum';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Rarity for each sticker: deterministic hash-based distribution (~70/20/8/2)
const pickRarity = (filename) => {
  let hash = 0;
  for (let i = 0; i < filename.length; i++) hash = (hash * 31 + filename.charCodeAt(i)) % 100;
  if (hash < 70) return 'common';
  if (hash < 90) return 'rare';
  if (hash < 98) return 'epic';
  return 'legendary';
};

const seedData = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    await Album.deleteMany({});
    await Sticker.deleteMany({});

    const album = new Album({
      name: 'Yofukashi no Uta Collection',
      description: 'The definitive digital album for Call of the Night.',
      totalStickers: stickerFiles.length
    });
    await album.save();
    console.log(`Album created with ${stickerFiles.length} stickers`);

    const stickers = stickerFiles.map((file, index) => {
      const rarity = pickRarity(file);
      return {
        albumId: album._id,
        number: index + 1,
        name: `Lámina #${index + 1}`,
        image: `/laminas/${file}`,
        rarity,
        rarityWeight: rarity === 'legendary' ? 2 : rarity === 'epic' ? 8 : rarity === 'rare' ? 20 : 70
      };
    });

    await Sticker.insertMany(stickers);

    const admin = await User.updateOne(
      { username: ADMIN_USERNAME },
      {
        $setOnInsert: {
          username: ADMIN_USERNAME,
          passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
          role: 'admin',
          credits: 100,
          xp: 500,
          level: 10
        }
      },
      { upsert: true }
    );
    console.log(`Admin user ready (${ADMIN_USERNAME}/${ADMIN_PASSWORD}) — upserted:`, admin.upsertedCount === 1);

    const adminUser = await User.findOne({ username: ADMIN_USERNAME });
    if (adminUser) {
      await UserCollection.updateOne(
        { userId: adminUser._id, albumId: album._id },
        { $setOnInsert: { userId: adminUser._id, albumId: album._id, collectedStickers: [] } },
        { upsert: true }
      );
      console.log('Admin collection ready');
    }

    console.log('Seed data inserted successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding data:', err);
    process.exit(1);
  }
};

seedData();