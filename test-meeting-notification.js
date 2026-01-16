const mongoose = require('mongoose');
const Meeting = require('./models/Meeting');
const User = require('./models/User');
const Notification = require('./models/Notification');

async function testMeetingNotification() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/nevostack', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Find a user to be organizer
    const organizer = await User.findOne();
    if (!organizer) {
      console.log('❌ No users found');
      return;
    }
    console.log('👤 Found organizer:', organizer.name, organizer.email);

    // Find another user to invite
    const invitee = await User.findOne({ _id: { $ne: organizer._id } });
    if (!invitee) {
      console.log('❌ No other users found to invite');
      return;
    }
    console.log('👤 Found invitee:', invitee.name, invitee.email);

    // Create a test meeting
    const meeting = new Meeting({
      title: 'Test Meeting for Notifications',
      description: 'This is a test meeting to check notification creation',
      organizer: organizer._id,
      organizerRole: organizer.role,
      companyId: organizer.companyId,
      departmentId: organizer.departmentId,
      inviteeUserIds: [invitee._id],
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000), // Tomorrow + 1 hour
      type: 'virtual',
      priority: 'medium',
      status: 'scheduled'
    });

    await meeting.save();
    console.log('✅ Test meeting created:', meeting._id);

    // Check if notification was created
    const notification = await Notification.findOne({
      recipient: invitee._id,
      type: 'meeting_scheduled'
    });

    if (notification) {
      console.log('✅ Notification found:', notification.title);
    } else {
      console.log('❌ No notification found for invitee');
    }

    // Check total notifications
    const totalNotifications = await Notification.find({ recipient: invitee._id });
    console.log('📋 Total notifications for invitee:', totalNotifications.length);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testMeetingNotification();




