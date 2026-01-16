const mongoose = require('mongoose');
const { User } = require('./models');

async function checkAvatars() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nevostack');
    const usersWithAvatars = await User.find({
      avatar: { $exists: true, $ne: null, $ne: '' }
    }).select('firstName lastName email avatar').limit(5);

    console.log('Users with avatars:', usersWithAvatars.length);
    usersWithAvatars.forEach(user => {
      console.log(`-${user.firstName} ${user.lastName}: ${user.avatar}`);
    });

    if (usersWithAvatars.length === 0) {
      console.log('No users found with avatars. Users need to upload avatars first.');
    }

    // Also check total users
    const totalUsers = await User.countDocuments();
    console.log(`Total users in database: ${totalUsers}`);

  } catch (error) {
    console.error('Error checking avatars:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkAvatars();





