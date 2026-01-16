// Test email service
require('dotenv').config();
const { sendWelcomeEmail, sendPaymentConfirmationEmail, sendUserCreationEmail, sendManagerAddedNotification, sendMemberAddedNotificationToHOD, sendMemberAddedNotificationToManager } = require('./services/emailService');

async function testEmails() {
  console.log('🧪 Testing email service...\n');

  // Test data
  const testData = {
    email: 'test@example.com',
    companyName: 'Test Company',
    planName: 'Basic Plan',
    adminName: 'John Doe',
    amount: 299
  };

  try {
    // Test welcome email
    console.log('📧 Testing welcome email...');
    const welcomeResult = await sendWelcomeEmail(
      testData.email,
      testData.companyName,
      testData.planName,
      testData.adminName
    );

    if (welcomeResult.success) {
      console.log('✅ Welcome email sent successfully!');
      console.log('📨 Message ID:', welcomeResult.messageId);
    } else {
      console.log('❌ Welcome email failed:', welcomeResult.error);
    }

    // Test payment confirmation email
    console.log('\n💳 Testing payment confirmation email...');
    const paymentResult = await sendPaymentConfirmationEmail(
      testData.email,
      testData.companyName,
      testData.planName,
      testData.adminName,
      testData.amount,
      'INR'
    );

    if (paymentResult.success) {
      console.log('✅ Payment confirmation email sent successfully!');
      console.log('📨 Message ID:', paymentResult.messageId);
    } else {
      console.log('❌ Payment confirmation email failed:', paymentResult.error);
    }

    // Test user creation emails
    console.log('\n👤 Testing user creation emails...\n');

    // Test HOD user creation
    console.log('🏢 Testing HOD user creation email...');
    const hodResult = await sendUserCreationEmail(
      'newuser@example.com',
      { firstName: 'John', lastName: 'Smith', role: 'member', email: 'newuser@example.com' },
      { firstName: 'Sarah', lastName: 'Johnson', role: 'hod', email: 'hod@company.com' },
      { name: 'IT Department', hodName: 'Sarah Johnson' },
      'ABC Company'
    );

    if (hodResult.success) {
      console.log('✅ HOD user creation email sent successfully!');
    } else {
      console.log('❌ HOD user creation email failed:', hodResult.error);
    }

    // Test Manager user creation
    console.log('\n👔 Testing Manager user creation email...');
    const managerResult = await sendUserCreationEmail(
      'newuser2@example.com',
      { firstName: 'Jane', lastName: 'Doe', role: 'member', email: 'newuser2@example.com' },
      { firstName: 'Mike', lastName: 'Wilson', role: 'manager', email: 'manager@company.com' },
      { name: 'Sales Department', hodName: 'David Brown', managerName: 'Mike Wilson' },
      'ABC Company'
    );

    if (managerResult.success) {
      console.log('✅ Manager user creation email sent successfully!');
    } else {
      console.log('❌ Manager user creation email failed:', managerResult.error);
    }

    // Test Member user creation
    console.log('\n👥 Testing Member user creation email...');
    const memberResult = await sendUserCreationEmail(
      'newuser3@example.com',
      { firstName: 'Bob', lastName: 'Taylor', role: 'member', email: 'newuser3@example.com' },
      { firstName: 'Alice', lastName: 'Cooper', role: 'member', email: 'member@company.com' },
      { name: 'HR Department', managerName: 'Tom Anderson' },
      'ABC Company'
    );

    if (memberResult.success) {
      console.log('✅ Member user creation email sent successfully!');
    } else {
      console.log('❌ Member user creation email failed:', memberResult.error);
    }

    // Test Admin user creation
    console.log('\n👑 Testing Admin user creation email...');
    const adminResult = await sendUserCreationEmail(
      'newuser4@example.com',
      { firstName: 'Admin', lastName: 'User', role: 'hr', email: 'newuser4@example.com' },
      { firstName: 'Super', lastName: 'Admin', role: 'admin', email: 'admin@company.com' },
      { name: 'Administration' },
      'ABC Company'
    );

    if (adminResult.success) {
      console.log('✅ Admin user creation email sent successfully!');
    } else {
      console.log('❌ Admin user creation email failed:', adminResult.error);
    }

    // Test notification emails
    console.log('\n📧 Testing notification emails...\n');

    // Test Manager Added Notification
    console.log('🏢 Testing Manager Added Notification to HOD...');
    const managerNotificationResult = await sendManagerAddedNotification(
      'hod@company.com',
      'Sarah Johnson',
      {
        firstName: 'Mike',
        lastName: 'Wilson',
        email: 'mike.wilson@company.com',
        createdBy: 'Super Admin'
      },
      {
        id: '507f1f77bcf86cd799439011',
        name: 'IT Department',
        hodName: 'Sarah Johnson'
      },
      'ABC Company'
    );

    if (managerNotificationResult.success) {
      console.log('✅ Manager added notification sent successfully!');
    } else {
      console.log('❌ Manager added notification failed:', managerNotificationResult.error);
    }

    // Test Member Added Notification to HOD
    console.log('\n👤 Testing Member Added Notification to HOD...');
    const memberHODNotificationResult = await sendMemberAddedNotificationToHOD(
      'hod@company.com',
      'Sarah Johnson',
      {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@company.com',
        role: 'member',
        managerName: 'Mike Wilson',
        createdBy: 'Super Admin'
      },
      {
        id: '507f1f77bcf86cd799439011',
        name: 'IT Department',
        hodName: 'Sarah Johnson'
      },
      'ABC Company'
    );

    if (memberHODNotificationResult.success) {
      console.log('✅ Member added notification to HOD sent successfully!');
    } else {
      console.log('❌ Member added notification to HOD failed:', memberHODNotificationResult.error);
    }

    // Test Member Assigned Notification to Manager
    console.log('\n👥 Testing Member Assigned Notification to Manager...');
    const memberManagerNotificationResult = await sendMemberAddedNotificationToManager(
      'manager@company.com',
      'Mike Wilson',
      {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@company.com',
        role: 'member',
        createdBy: 'Super Admin'
      },
      {
        name: 'IT Department',
        hodName: 'Sarah Johnson'
      },
      'ABC Company'
    );

    if (memberManagerNotificationResult.success) {
      console.log('✅ Member assigned notification to manager sent successfully!');
    } else {
      console.log('❌ Member assigned notification to manager failed:', memberManagerNotificationResult.error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run test if called directly
if (require.main === module) {
  testEmails();
}

module.exports = { testEmails };
