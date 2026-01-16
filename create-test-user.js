const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import User model
const User = require('./models/User');

async function createTestUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nevostack', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Check if test user already exists
    const existingUser = await User.findOne({ email: 'test@example.com' });
    if (existingUser) {
      console.log('Test user already exists:', existingUser.email);
      return existingUser;
    }

    // Create test user
    const testUser = new User({
      username: 'testuser',
      firstName: 'John',
      lastName: 'Doe',
      name: 'John Doe',
      email: 'test@example.com',
      password: 'password123',
      role: 'member',
      phone: '+1 (555) 123-4567',
      mobileNumber: '+1 (555) 987-6543',
      status: 'active',
      isActive: true,
      dateOfJoining: new Date(),
      securitySettings: {
        twoFactorEnabled: false,
        requireDeviceApproval: false,
        maxActiveDevices: 5,
        sessionTimeout: 24 * 60 * 60 * 1000
      },
      devicePreferences: {
        defaultTheme: 'light',
        language: 'en',
        timezone: 'UTC',
        notifications: {
          email: true,
          push: true,
          sms: false
        }
      }
    });

    await testUser.save();
    console.log('Test user created successfully:', testUser.email);
    console.log('User ID:', testUser._id);
    
    return testUser;
  } catch (error) {
    console.error('Error creating test user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the function
createTestUser();

