const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const { User, Company, Department, Task, Leave } = require('./models');

// MongoDB connection
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nevostack', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

// Create test data for HOD integration
async function createHODTestData() {
  try {
    console.log('Creating HOD test data...');

    // Clean existing test data
    await User.deleteMany({ 
      $or: [
        { email: { $in: ['hod@test.com', 'member1@test.com', 'member2@test.com'] } },
        { username: { $in: ['john_hod', 'alice_dev', 'bob_designer'] } }
      ]
    });
    await Task.deleteMany({ title: { $in: ['Complete React Dashboard', 'Design User Interface', 'Code Review', 'Urgent Bug Fix'] } });
    await Leave.deleteMany({ reason: { $in: ['Medical appointment', 'Family vacation'] } });
    await Company.deleteOne({ name: 'Test Company HOD' });
    await Department.deleteOne({ name: 'Test Department HOD' });

    // 1. Create test company
    const company = new Company({
      name: 'Test Company HOD',
      domain: 'testhod.nevostack.com',
      email: 'admin@testhod.com',
      phone: '+1234567890',
      status: 'active',
      subscription: {
        plan: 'pro',
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      }
    });
    await company.save();
    console.log('✅ Created test company:', company.name);

    // 2. Create test department
    const department = new Department({
      name: 'Test Department HOD',
      description: 'Test department for HOD integration testing',
      companyId: company._id,
      color: '#3B82F6',
      isActive: true,
      createdAt: new Date()
    });
    await department.save();
    console.log('✅ Created test department:', department.name);

    // 3. Create HOD user
    const hashedPassword = await bcrypt.hash('password123', 10);
    const hodUser = new User({
      firstName: 'John',
      lastName: 'HOD',
      email: 'hod@test.com',
      username: 'john_hod',
      password: hashedPassword,
      role: 'department_head',
      companyId: company._id,
      departmentId: department._id,
      status: 'active',
      isActive: true,
      createdAt: new Date()
    });
    await hodUser.save();

    // Update department with HOD
    department.headId = hodUser._id;
    await department.save();
    console.log('✅ Created HOD user:', hodUser.email);

    // 4. Create department members
    const member1 = new User({
      firstName: 'Alice',
      lastName: 'Developer',
      email: 'member1@test.com',
      username: 'alice_dev',
      password: hashedPassword,
      role: 'member',
      companyId: company._id,
      departmentId: department._id,
      status: 'active',
      isActive: true,
      createdAt: new Date()
    });
    await member1.save();

    const member2 = new User({
      firstName: 'Bob',
      lastName: 'Designer',
      email: 'member2@test.com',
      username: 'bob_designer',
      password: hashedPassword,
      role: 'member',
      companyId: company._id,
      departmentId: department._id,
      status: 'active',
      isActive: true,
      createdAt: new Date()
    });
    await member2.save();
    console.log('✅ Created department members');

    // 5. Create test tasks
    const tasks = [
      {
        title: 'Complete React Dashboard',
        description: 'Build the main dashboard for the application',
        status: 'in_progress',
        priority: 'high',
        companyId: company._id,
        departmentId: department._id,
        assignedTo: member1._id,
        assignedBy: hodUser._id,
        assignedByRole: 'department_head',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        createdAt: new Date()
      },
      {
        title: 'Design User Interface',
        description: 'Create wireframes and mockups for new features',
        status: 'assigned',
        priority: 'medium',
        companyId: company._id,
        departmentId: department._id,
        assignedTo: member2._id,
        assignedBy: hodUser._id,
        assignedByRole: 'department_head',
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        createdAt: new Date()
      },
      {
        title: 'Code Review',
        description: 'Review pull requests and provide feedback',
        status: 'completed',
        priority: 'medium',
        companyId: company._id,
        departmentId: department._id,
        assignedTo: hodUser._id,
        assignedBy: hodUser._id,
        assignedByRole: 'department_head',
        dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        completedDate: new Date(),
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
      },
      {
        title: 'Urgent Bug Fix',
        description: 'Fix critical bug in production',
        status: 'assigned',
        priority: 'urgent',
        companyId: company._id,
        departmentId: department._id,
        assignedTo: member1._id,
        assignedBy: hodUser._id,
        assignedByRole: 'department_head',
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
        createdAt: new Date()
      }
    ];

    await Task.insertMany(tasks);
    console.log('✅ Created test tasks:', tasks.length);

    // 6. Create test leave requests
    const leaves = [
      {
        type: 'sick',
        startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        days: 3,
        reason: 'Medical appointment',
        status: 'pending',
        userId: member1._id,
        companyId: company._id,
        departmentId: department._id,
        createdAt: new Date()
      },
      {
        type: 'annual',
        startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks from now
        endDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 3 weeks from now
        days: 7,
        reason: 'Family vacation',
        status: 'approved',
        userId: member2._id,
        companyId: company._id,
        departmentId: department._id,
        createdAt: new Date()
      }
    ];

    await Leave.insertMany(leaves);
    console.log('✅ Created test leave requests:', leaves.length);

    console.log('\n🎉 HOD test data created successfully!');
    console.log('\n📝 Test Credentials:');
    console.log('HOD User: hod@test.com / password123');
    console.log('Member 1: member1@test.com / password123');
    console.log('Member 2: member2@test.com / password123');
    console.log('\n🏢 Test Company:', company.name);
    console.log('📁 Department:', department.name);
    console.log('👥 Department ID:', department._id);
    console.log('🏢 Company ID:', company._id);

    return {
      company,
      department,
      hodUser,
      members: [member1, member2],
      tasks,
      leaves
    };

  } catch (error) {
    console.error('Error creating HOD test data:', error);
    throw error;
  }
}

// Test HOD API endpoints
async function testHODAPIs(testData) {
  try {
    console.log('\n🔍 Testing HOD API endpoints...');

    const axios = require('axios');
    const baseURL = 'http://localhost:5000/api';

    // First, login to get authentication token
    console.log('🔐 Logging in as HOD...');
    const loginResponse = await axios.post(`${baseURL}/auth/login`, {
      email: 'hod@test.com',
      password: 'password123'
    });

    console.log('Login response:', loginResponse.data);

    if (!loginResponse.data.success) {
      throw new Error('Login failed: ' + loginResponse.data.error);
    }

    const token = loginResponse.data.token || loginResponse.data.accessToken;
    if (!token) {
      console.log('Available fields in login response:', Object.keys(loginResponse.data));
      throw new Error('No token found in login response');
    }

    const headers = { Authorization: `Bearer ${token}` };
    console.log('✅ Login successful, token:', token.substring(0, 20) + '...');

    // Test HOD overview endpoint
    console.log('📊 Testing HOD overview endpoint...');
    const overviewResponse = await axios.get(`${baseURL}/analytics/hod/overview`, {
      headers,
      params: {
        companyId: testData.company._id,
        departmentId: testData.department._id
      }
    });

    if (overviewResponse.data.success) {
      console.log('✅ HOD overview API working');
      console.log('📈 Data preview:', {
        department: overviewResponse.data.data.department?.name,
        totalMembers: overviewResponse.data.data.members?.total,
        totalTasks: overviewResponse.data.data.tasks?.total,
        completedTasks: overviewResponse.data.data.tasks?.completed,
        pendingLeaves: overviewResponse.data.data.leaves?.pending
      });
    } else {
      console.log('❌ HOD overview API failed');
    }

    // Test HOD tasks endpoint
    console.log('📋 Testing HOD tasks endpoint...');
    const tasksResponse = await axios.get(`${baseURL}/analytics/hod/tasks`, {
      headers,
      params: {
        companyId: testData.company._id
      }
    });

    if (tasksResponse.data.success) {
      console.log('✅ HOD tasks API working');
      console.log('📊 Tasks found:', tasksResponse.data.data.length);
    }

    // Test department members endpoint
    console.log('👥 Testing department members endpoint...');
    const membersResponse = await axios.get(`${baseURL}/analytics/hod/department/members`, {
      headers,
      params: {
        companyId: testData.company._id,
        departmentId: testData.department._id
      }
    });

    if (membersResponse.data.success) {
      console.log('✅ Department members API working');
      console.log('👤 Members found:', membersResponse.data.data.length);
    }

    console.log('\n🎉 All HOD APIs are working correctly!');
    return true;

  } catch (error) {
    console.error('❌ HOD API test failed:', error.response?.data || error.message);
    return false;
  }
}

// Main execution
async function main() {
  try {
    console.log('🚀 Starting HOD Integration Test\n');

    // Connect to database
    await connectDB();

    // Create test data
    const testData = await createHODTestData();

    // Test APIs
    const apiTestPassed = await testHODAPIs(testData);

    if (apiTestPassed) {
      console.log('\n✅ HOD Integration Test Completed Successfully!');
      console.log('\n📍 Next Steps:');
      console.log('1. Open frontend application: http://localhost:3000');
      console.log('2. Login with: hod@test.com / password123');
      console.log('3. Navigate to HOD Dashboard');
      console.log('4. Verify that real data is displayed instead of mock data');
    } else {
      console.log('\n❌ HOD Integration Test Failed');
      console.log('Please check the backend server and database connections.');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Handle async errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  main();
}

module.exports = { createHODTestData, testHODAPIs };
