const mongoose = require('mongoose');
const { Notification, User } = require('./models');

// Test notification creation
async function testNotification() {
  try {
    console.log('🔔 Testing notification system...');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nevostack');
    console.log('✅ Database connected');
    
    // Get a user
    const user = await User.findOne();
    if (!user) {
      console.log('❌ No users found in database');
      return;
    }
    
    console.log('👤 Found user:', user.email);
    
    // Create test notification
    const notification = new Notification({
      recipient: user._id,
      sender: user._id,
      companyId: user.companyId,
      title: 'Test Notification from Script',
      message: 'This is a test notification created by the test script',
      type: 'system_notification',
      priority: 'medium'
    });
    
    await notification.save();
    console.log('✅ Test notification created:', notification._id);
    
    // Check notifications count
    const count = await Notification.countDocuments();
    console.log('📊 Total notifications in database:', count);
    
    // Get unread count for user
    const unreadCount = await Notification.countDocuments({
      recipient: user._id,
      isRead: false
    });
    console.log('🔔 Unread notifications for user:', unreadCount);
    
    console.log('🎉 Notification system test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run test
testNotification();




