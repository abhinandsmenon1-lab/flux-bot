const mongoose = require('mongoose');

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ Missing MONGODB_URI environment variable.');
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err));
  mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected.'));

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');
}

module.exports = { connectDB };
