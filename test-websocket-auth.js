const jwt = require('jsonwebtoken');
const User = require('./models/User');
const mongoose = require('mongoose');

async function testWebSocketAuth() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/nevostack', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Find a user
    const user = await User.findOne();
    if (!user) {
      console.log('❌ No users found');
      return;
    }
    console.log('👤 Found user:', user.name, user.email);

    // Create a test token
    const jwtSecret = process.env.JWT_ACCESS_SECRET || 'your-access-secret-key';
    console.log('🔑 JWT Secret:', jwtSecret ? 'Set' : 'Not set');

    const token = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        role: user.role,
        companyId: user.companyId
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    console.log('🎫 Generated token:', token.substring(0, 50) + '...');

    // Verify the token
    try {
      const decoded = jwt.verify(token, jwtSecret);
      console.log('✅ Token verification successful:', decoded);
    } catch (verifyError) {
      console.error('❌ Token verification failed:', verifyError.message);
    }

    // Test user lookup
    const foundUser = await User.findById(user._id);
    if (foundUser) {
      console.log('✅ User lookup successful:', foundUser.email);
    } else {
      console.log('❌ User lookup failed');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testWebSocketAuth();
