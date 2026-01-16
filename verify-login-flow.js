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

// Simulate the exact login flow
const simulateLoginFlow = async () => {
  const testEmail = 'agamon@gmail.com';
  const testPassword = 'Agamon@123';

  console.log('🔍 SIMULATING EXACT LOGIN FLOW\n');
  console.log(`📧 Email: ${testEmail}`);
  console.log(`🔒 Password: ${testPassword}\n`);

  try {
    // Step 1: Find user (exactly like backend auth.js does)
    console.log('📊 Step 1: Finding user in database...');
    const user = await User.findOne({ email: testEmail }).select('+password');

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log(`✅ User found: ${user.username}`);
    console.log(`   - Password field exists: ${!!user.password}`);
    console.log(`   - Password type: ${typeof user.password}`);
    console.log(`   - Password length: ${user.password ? user.password.length : 'N/A'}`);

    // Step 2: Verify password (exactly like backend does)
    console.log('\n📊 Step 2: Password verification...');
    console.log(`   - Input password: "${testPassword}"`);
    console.log(`   - Stored hash: "${user.password}"`);

    const isPasswordValid = await bcrypt.compare(testPassword, user.password);
    console.log(`   - Password comparison result: ${isPasswordValid}`);

    // Step 3: Analysis
    console.log('\n📊 Step 3: Analysis');
    if (isPasswordValid) {
      console.log('✅ SUCCESS: Password verification works correctly!');
      console.log('💡 The login should work from frontend');
    } else {
      console.log('❌ FAILURE: Password verification failed');

      // Additional checks
      console.log('\n🔍 Additional Debugging:');

      // Check if password is plaintext
      if (user.password === testPassword) {
        console.log('⚠️  WARNING: Password is stored as PLAIN TEXT!');
        console.log('💡 This means password was never hashed during registration');
      }

      // Check hash format
      if (user.password && user.password.startsWith('$2a$')) {
        console.log('✅ Password is in correct bcrypt format');

        // Try different variations
        const variations = [
          testPassword.toUpperCase(),
          testPassword.toLowerCase(),
          testPassword + ' ',
          ' ' + testPassword
        ];

        console.log('\n🔍 Testing variations:');
        for (const variation of variations) {
          const result = await bcrypt.compare(variation, user.password);
          if (result) {
            console.log(`✅ Found matching variation: "${variation}"`);
          }
        }
      } else {
        console.log('❌ Password is NOT in bcrypt format');
        console.log(`   - Format: ${user.password ? user.password.substring(0, 10) + '...' : 'N/A'}`);
      }
    }

  } catch (error) {
    console.error('❌ Error during simulation:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔚 Disconnected from database');
  }
};

// Run the simulation
const runSimulation = async () => {
  await connectDB();
  await simulateLoginFlow();
};

runSimulation();






