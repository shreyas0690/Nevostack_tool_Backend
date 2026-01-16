const mongoose = require('mongoose');
const Notification = require('./models/Notification');
const User = require('./models/User');

async function createSimpleNotification() {
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

    // Create a simple notification
    const notification = new Notification({
      recipient: user._id,
      sender: user._id,
      companyId: user.companyId,
      title: 'Simple Test Notification',
      message: 'This is a simple test notification to check if the list displays properly.',
      type: 'system_notification',
      priority: 'medium'
    });

    await notification.save();
    console.log('✅ Simple notification created:', notification._id);

    // Check total notifications
    const totalNotifications = await Notification.find({ recipient: user._id });
    console.log('📋 Total notifications for user:', totalNotifications.length);

    // Check unread count
    const unreadCount = await Notification.getUnreadCount(user._id);
    console.log('🔔 Unread count:', unreadCount);

    // Show all notifications
    console.log('\n📝 All notifications:');
    totalNotifications.forEach((notif, index) => {
      console.log(`${index + 1}. ${notif.title} - ${notif.isRead ? 'Read' : 'Unread'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

createSimpleNotification();




