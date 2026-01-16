const axios = require('axios');

async function testMeetingCreation() {
  try {
    console.log('🧪 Testing meeting creation via API...');
    
    // First login to get token
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'agrim@gmail.com',
      password: 'password123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful, token received');
    
    // Create a test meeting
    const meetingData = {
      title: 'Test Meeting for Notifications',
      description: 'This is a test meeting to check notification creation',
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(), // Tomorrow + 1 hour
      type: 'virtual',
      priority: 'medium',
      inviteeUserIds: ['68c8ced1c6c3949785efb199'], // Safikul's ID
      location: 'Virtual Meeting Room'
    };
    
    console.log('📋 Meeting data:', meetingData);
    
    const meetingResponse = await axios.post('http://localhost:5000/api/meetings', meetingData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Meeting created successfully:', meetingResponse.data);
    
    // Check notifications for the invitee
    const notificationsResponse = await axios.get('http://localhost:5000/api/notifications', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('📋 Notifications for user:', notificationsResponse.data);
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testMeetingCreation();




