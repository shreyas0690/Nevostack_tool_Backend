// Export all models for easy importing in Express.js

const User = require('./User.js');
const Device = require('./Device.js');
const Company = require('./Company.js');
const Department = require('./Department.js');
const Attendance = require('./Attendance.js');
const Leave = require('./Leave.js');
const Meeting = require('./Meeting.js');
const Task = require('./Task.js');
const Notification = require('./Notification.js');
const Workspace = require('./Workspace.js');
const AuditLog = require('./AuditLog.js');
const Plan = require('./Plan.js');

module.exports = {
  User,
  Device,
  Company,
  Department,
  Attendance,
  Leave,
  Meeting,
  Task,
  Notification,
  Workspace,
  AuditLog,
  Plan
};