const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User } = require('./models');

// Connect to database
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb+srv://agamonjprince785:Agamon123@cluster0.qjfxyto.mongodb.net/NevoStackTool?retryWrites=true&w=majority&appName=Cluster0";

    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4
    };

    await mongoose.connect(mongoUri, options);
    console.log('✅ Connected to MongoDB Atlas');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Test different password variations
const testPasswordVariations = async () => {
  const testEmail = 'agamon@gmail.com';
  const storedHash = "$2a$12$RhaekS3wg1fxe8cCqOnzJeAutfAE8IhOSroZx8zZZmy5.k7sFUeOO";

  console.log('🔍 Testing password variations for:', testEmail);
  console.log('📦 Stored hash:', storedHash);
  console.log('');

  // Common password variations to test
  const variations = [
    'Agamon@123',
    'agamon@123',
    'AGAMON@123',
    'Agamon123',
    'agamon123',
    'AGAMON123',
    'password123',
    'Password123',
    'admin123',
    'Admin123',
    '123456',
    'qwerty'
  ];

  console.log('🧪 Testing variations:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const password of variations) {
    const isMatch = await bcrypt.compare(password, storedHash);
    console.log(`   "${password}"${' '.repeat(15 - password.length)} → ${isMatch ? '✅ MATCH!' : '❌ No match'}`);
  }

  console.log('');
  console.log('🎯 Analysis:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const matchingPasswords = variations.filter(async pwd => await bcrypt.compare(pwd, storedHash));
  if (matchingPasswords.length > 0) {
    console.log('✅ Found matching passwords:', matchingPasswords);
  } else {
    console.log('❌ None of the common variations matched');
    console.log('');
    console.log('💡 This means the user was registered with a different password');
    console.log('💡 Solutions:');
    console.log('   1. Ask the user what password they used during registration');
    console.log('   2. Reset the password using forgot password feature');
    console.log('   3. Create a new user with the desired credentials');
  }
};

// Run the test
const runTest = async () => {
  await connectDB();
  await testPasswordVariations();
  await mongoose.disconnect();
  console.log('\n🔚 Disconnected from database');
};

runTest();






