const mongoose = require('mongoose');
const Album = require('../models/Album');
const Sticker = require('../models/Sticker');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mialbum';

const seedData = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await Album.deleteMany({});
    await Sticker.deleteMany({});

    // Create Album
    const album = new Album({
      name: 'Yofukashi no Uta Collection',
      description: 'The definitive digital album for Call of the Night.',
      totalStickers: 5
    });
    await album.save();

    // Create Stickers
    const stickersData = [
      { name: 'Call of the Night', image: '/stickers/call_of_the_night.png', rarity: 'common', rarityWeight: 70 },
      { name: 'The NightTime Call', image: '/stickers/nighttime_call.png', rarity: 'rare', rarityWeight: 20 },
      { name: 'City Lights after Dark', image: '/stickers/city_lights.png', rarity: 'epic', rarityWeight: 8 },
      { name: 'Creatures of the Night', image: '/stickers/creatures.png', rarity: 'legendary', rarityWeight: 2 },
      { name: "The Insomniac's Club", image: '/stickers/insomniac.png', rarity: 'common', rarityWeight: 70 }
    ];

    const stickers = stickersData.map((s, index) => ({
      ...s,
      albumId: album._id,
      number: index + 1
    }));

    await Sticker.insertMany(stickers);
    console.log('Seed data inserted successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding data:', err);
    process.exit(1);
  }
};

seedData();
