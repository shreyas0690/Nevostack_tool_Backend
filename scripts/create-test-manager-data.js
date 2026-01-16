const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Task = require('../models/Task');
const Company = require('../models/Company');
const Department = require('../models/Department');

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nevostack');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Create test data
const createTestData = async () => {
  try {
    console.log('🚀 Creating test manager data...');

    // Create company
    const company = await Company.findOneAndUpdate(
      { name: 'Test Company' },
      {
        name: 'Test Company',
        domain: 'testcompany.com',
        subdomain: 'testcompany',
        isActive: true
      },
      { upsert: true, new: true }
    );
    console.log('✅ Company created/found:', company.name);

    // Create department
    const department = await Department.findOneAndUpdate(
      { name: 'Engineering' },
      {
        name: 'Engineering',
        companyId: company._id,
        isActive: true
      },
      { upsert: true, new: true }
    );
    console.log('✅ Department created/found:', department.name);

    // Create manager
    const hashedPassword = await bcrypt.hash('password123', 12);
    const manager = await User.findOneAndUpdate(
      { email: 'manager@testcompany.com' },
      {
        firstName: 'John',
        lastName: 'Manager',
        name: 'John Manager',
        email: 'manager@testcompany.com',
        password: hashedPassword,
        role: 'manager',
        companyId: company._id,
        departmentId: department._id.toString(),
        isActive: true,
        dateOfJoining: new Date('2023-01-01')
      },
      { upsert: true, new: true }
    );
    console.log('✅ Manager created/found:', manager.name);

    // Create team members
    const teamMembers = [];
    const memberData = [
      {
        firstName: 'Jane',
        lastName: 'Developer',
        email: 'jane@testcompany.com',
        role: 'member'
      },
      {
        firstName: 'Bob',
        lastName: 'Designer',
        email: 'bob@testcompany.com',
        role: 'member'
      },
      {
        firstName: 'Alice',
        lastName: 'Tester',
        email: 'alice@testcompany.com',
        role: 'member'
      }
    ];

    for (const memberInfo of memberData) {
      const member = await User.findOneAndUpdate(
        { email: memberInfo.email },
        {
          firstName: memberInfo.firstName,
          lastName: memberInfo.lastName,
          name: `${memberInfo.firstName} ${memberInfo.lastName}`,
          email: memberInfo.email,
          password: hashedPassword,
          role: memberInfo.role,
          companyId: company._id,
          departmentId: department._id.toString(),
          managerId: manager._id.toString(),
          isActive: true,
          dateOfJoining: new Date('2023-02-01')
        },
        { upsert: true, new: true }
      );
      teamMembers.push(member);
      console.log('✅ Team member created/found:', member.name);
    }

    // Create tasks for manager
    const managerTasks = [
      {
        title: 'Review Q4 Performance Reports',
        description: 'Analyze and review quarterly performance reports for team members',
        assignedTo: manager._id,
        assignedBy: manager._id,
        assignedByRole: 'manager',
        companyId: company._id,
        departmentId: department._id,
        priority: 'high',
        status: 'in_progress',
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        progress: 60
      },
      {
        title: 'Team Meeting Preparation',
        description: 'Prepare agenda and materials for weekly team meeting',
        assignedTo: manager._id,
        assignedBy: manager._id,
        assignedByRole: 'manager',
        companyId: company._id,
        departmentId: department._id,
        priority: 'medium',
        status: 'assigned',
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
        progress: 20
      }
    ];

    for (const taskData of managerTasks) {
      const task = await Task.findOneAndUpdate(
        { title: taskData.title, assignedTo: taskData.assignedTo },
        taskData,
        { upsert: true, new: true }
      );
      console.log('✅ Manager task created/found:', task.title);
    }

    // Create tasks for team members
    const teamMemberTasks = [
      {
        title: 'Implement User Authentication',
        description: 'Develop and implement user authentication system for the new application',
        assignedTo: teamMembers[0]._id,
        assignedBy: manager._id,
        assignedByRole: 'manager',
        companyId: company._id,
        departmentId: department._id,
        priority: 'urgent',
        status: 'in_progress',
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        progress: 75
      },
      {
        title: 'Database Optimization',
        description: 'Optimize database queries and improve performance',
        assignedTo: teamMembers[1]._id,
        assignedBy: manager._id,
        assignedByRole: 'manager',
        companyId: company._id,
        departmentId: department._id,
        priority: 'medium',
        status: 'assigned',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        progress: 10
      },
      {
        title: 'Write Unit Tests',
        description: 'Write comprehensive unit tests for the new features',
        assignedTo: teamMembers[2]._id,
        assignedBy: manager._id,
        assignedByRole: 'manager',
        companyId: company._id,
        departmentId: department._id,
        priority: 'high',
        status: 'in_progress',
        dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // 4 days from now
        progress: 40
      },
      {
        title: 'Code Review',
        description: 'Review code changes from team members',
        assignedTo: teamMembers[0]._id,
        assignedBy: manager._id,
        assignedByRole: 'manager',
        companyId: company._id,
        departmentId: department._id,
        priority: 'medium',
        status: 'completed',
        dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        progress: 100,
        completedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      },
      {
        title: 'Bug Fix - Login Issue',
        description: 'Fix the login issue reported by users',
        assignedTo: teamMembers[1]._id,
        assignedBy: manager._id,
        assignedByRole: 'manager',
        companyId: company._id,
        departmentId: department._id,
        priority: 'urgent',
        status: 'blocked',
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        progress: 30
      }
    ];

    for (const taskData of teamMemberTasks) {
      const task = await Task.findOneAndUpdate(
        { title: taskData.title, assignedTo: taskData.assignedTo },
        taskData,
        { upsert: true, new: true }
      );
      console.log('✅ Team member task created/found:', task.title);
    }

    console.log('🎉 Test data created successfully!');
    console.log('📊 Summary:');
    console.log(`   - Company: ${company.name}`);
    console.log(`   - Department: ${department.name}`);
    console.log(`   - Manager: ${manager.name} (${manager.email})`);
    console.log(`   - Team Members: ${teamMembers.length}`);
    console.log(`   - Manager Tasks: ${managerTasks.length}`);
    console.log(`   - Team Member Tasks: ${teamMemberTasks.length}`);
    console.log('');
    console.log('🔑 Login Credentials:');
    console.log(`   Manager: manager@testcompany.com / password123`);
    console.log(`   Team Members: jane@testcompany.com, bob@testcompany.com, alice@testcompany.com / password123`);

  } catch (error) {
    console.error('❌ Error creating test data:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await createTestData();
  process.exit(0);
};

main();
