const mongoose = require('mongoose');
const Notification = require('./models/Notification');
const User = require('./models/User');

async function createTestNotification() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/nevostack', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Find a user (preferably a manager)
    const user = await User.findOne({ role: { $in: ['manager', 'department_head'] } });
    if (!user) {
      console.log('❌ No manager found, using any user');
      const anyUser = await User.findOne();
      if (!anyUser) {
        console.log('❌ No users found');
        return;
      }
      user = anyUser;
    }
    
    console.log('👤 Found user:', user.name, user.email, user.role);

    // Create a test notification
    const testNotification = new Notification({
      recipient: user._id,
      sender: user._id,
      companyId: user.companyId,
      title: 'New Task Assigned: Complete Project Review',
      message: 'You have been assigned a new task: Complete Project Review. Please review the project documentation and provide feedback.',
      type: 'task_assigned',
      priority: 'high',
      actionUrl: '/tasks/123',
      actionText: 'View Task',
      data: {
        taskId: '123',
        taskTitle: 'Complete Project Review',
        assignedBy: user._id
      }
    });

    await testNotification.save();
    console.log('✅ Test notification created:', testNotification._id);

    // Check unread count
    const unreadCount = await Notification.getUnreadCount(user._id);
    console.log('🔔 Unread count for user:', unreadCount);

    // Show recent notifications
    const recentNotifications = await Notification.find({ recipient: user._id })
      .sort({ createdAt: -1 })
      .limit(5);
    
    console.log('\n📋 Recent notifications:');
    recentNotifications.forEach((notif, index) => {
      console.log(`${index + 1}. ${notif.title} - ${notif.isRead ? 'Read' : 'Unread'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

createTestNotification();




