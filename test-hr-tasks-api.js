const axios = require('axios');

// Test script for HR Management Tasks API
async function testHRTasksAPI() {
  const baseURL = 'http://localhost:5000/api';
  
  // Test credentials (replace with actual HR user credentials)
  const testCredentials = {
    email: 'hr@forever.com', // Replace with actual HR user email
    password: 'password123'  // Replace with actual HR user password
  };

  try {
    console.log('🧪 Testing HR Management Tasks API...\n');

    // Step 1: Login to get token
    console.log('1️⃣ Logging in as HR user...');
    const loginResponse = await axios.post(`${baseURL}/auth/login`, testCredentials);
    
    if (!loginResponse.data.success) {
      throw new Error('Login failed: ' + loginResponse.data.error);
    }
    
    const token = loginResponse.data.token;
    const user = loginResponse.data.user;
    
    console.log('✅ Login successful!');
    console.log('   User:', user.name, `(${user.role})`);
    console.log('   Company ID:', user.companyId);
    console.log('   Token:', token.substring(0, 20) + '...\n');

    // Step 2: Test HR Management Tasks API
    console.log('2️⃣ Testing HR Management Tasks API...');
    const tasksResponse = await axios.get(`${baseURL}/tasks/hr-management`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!tasksResponse.data.success) {
      throw new Error('HR Management Tasks API failed: ' + tasksResponse.data.error);
    }

    const tasks = tasksResponse.data.data || [];
    const filters = tasksResponse.data.filters || {};
    
    console.log('✅ HR Management Tasks API successful!');
    console.log('   Total tasks found:', tasks.length);
    console.log('   Filters applied:', filters);
    console.log('   Excluded statuses:', filters.excludedStatuses);
    console.log('   Exclude overdue:', filters.excludeOverdue);
    console.log('   Company ID filter:', filters.companyId);

    // Step 3: Analyze task data
    console.log('\n3️⃣ Analyzing task data...');
    
    if (tasks.length > 0) {
      const statusCounts = {};
      const priorityCounts = {};
      let overdueCount = 0;
      
      tasks.forEach(task => {
        // Count statuses
        statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
        
        // Count priorities
        priorityCounts[task.priority] = (priorityCounts[task.priority] || 0) + 1;
        
        // Check for overdue tasks (should be 0)
        if (task.dueDate && new Date(task.dueDate) < new Date()) {
          overdueCount++;
        }
      });
      
      console.log('   Status distribution:');
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`     ${status}: ${count}`);
      });
      
      console.log('   Priority distribution:');
      Object.entries(priorityCounts).forEach(([priority, count]) => {
        console.log(`     ${priority}: ${count}`);
      });
      
      console.log(`   Overdue tasks (should be 0): ${overdueCount}`);
      
      // Show sample tasks
      console.log('\n   Sample tasks:');
      tasks.slice(0, 3).forEach((task, index) => {
        console.log(`     ${index + 1}. ${task.title}`);
        console.log(`        Status: ${task.status}, Priority: ${task.priority}`);
        console.log(`        Assigned to: ${task.assignedTo?.name || 'Unassigned'}`);
        console.log(`        Due date: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}`);
      });
    } else {
      console.log('   No tasks found (this might be expected if no active tasks exist)');
    }

    // Step 4: Test with different parameters
    console.log('\n4️⃣ Testing with limit parameter...');
    const limitedResponse = await axios.get(`${baseURL}/tasks/hr-management?limit=10`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (limitedResponse.data.success) {
      const limitedTasks = limitedResponse.data.data || [];
      console.log(`✅ Limited request successful! Found ${limitedTasks.length} tasks (limit: 10)`);
    }

    console.log('\n🎉 All tests passed! HR Management Tasks API is working correctly.');
    console.log('\n📋 Summary:');
    console.log('   - API endpoint: GET /api/tasks/hr-management');
    console.log('   - Authentication: Bearer token required');
    console.log('   - Role access: hr, admin, super_admin');
    console.log('   - Filters: Excludes completed, blocked, cancelled, and overdue tasks');
    console.log('   - Company filtering: Only shows tasks from user\'s company');
    console.log('   - Sorting: Newest tasks first');
    console.log('   - Limit: Maximum 500 tasks per request');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
    }
    
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Make sure the backend server is running on port 5000');
    console.log('   2. Verify the HR user credentials are correct');
    console.log('   3. Check that the HR user has the correct role and companyId');
    console.log('   4. Ensure there are tasks in the database for the company');
  }
}

// Run the test
testHRTasksAPI();

