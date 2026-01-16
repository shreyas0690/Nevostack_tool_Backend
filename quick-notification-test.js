const mongoose = require('mongoose');
const Notification = require('./models/Notification');
const User = require('./models/User');

async function testNotifications() {
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

    // Check notifications for this user
    const notifications = await Notification.find({ recipient: user._id });
    console.log('📋 Total notifications for user:', notifications.length);

    const unreadCount = await Notification.getUnreadCount(user._id);
    console.log('🔔 Unread count:', unreadCount);

    // Show recent notifications
    if (notifications.length > 0) {
      console.log('\n📝 Recent notifications:');
      notifications.slice(0, 5).forEach((notif, index) => {
        console.log(`${index + 1}. ${notif.title} - ${notif.isRead ? 'Read' : 'Unread'}`);
      });
    }

    // Create a test notification
    const testNotification = new Notification({
      recipient: user._id,
      sender: user._id,
      companyId: user.companyId,
      title: 'Quick Test Notification',
      message: 'This is a quick test notification',
      type: 'system_notification',
      priority: 'medium'
    });

    await testNotification.save();
    console.log('✅ Test notification created:', testNotification._id);

    // Check unread count again
    const newUnreadCount = await Notification.getUnreadCount(user._id);
    console.log('🔔 New unread count:', newUnreadCount);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testNotifications();




