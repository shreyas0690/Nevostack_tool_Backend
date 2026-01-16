const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const { User } = require('./models');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://agamonjprince785:Agamon123@cluster0.qjfxyto.mongodb.net/NevoStackTool?retryWrites=true&w=majority&appName=Cluster0";

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }
}

async function debugPassword(email, testPassword) {
  await connectDB();

  try {
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      console.error('User not found for email:', email);
      process.exit(1);
    }

    console.log('User found:', { email: user.email, username: user.username, status: user.status });
    console.log('Stored password:', user.password);

    const isBcrypt = typeof user.password === 'string' && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$'));
    console.log('Is bcrypt hash:', isBcrypt);

    if (isBcrypt) {
      const isValid = await bcrypt.compare(testPassword, user.password);
      console.log('bcrypt.compare result:', isValid);
    } else {
      console.log('Plaintext comparison result:', user.password === testPassword);
    }

  } catch (err) {
    console.error('Error during debug:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

debugPassword('somapon@gmail.com', 'Agamon@123');


