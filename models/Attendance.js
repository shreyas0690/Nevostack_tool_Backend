const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  checkInTime: {
    type: Date
  },
  checkOutTime: {
    type: Date
  },
  workingHours: {
    type: Number,
    default: 0,
    min: 0
  },
  overtimeHours: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'half_day', 'work_from_home', 'holiday'],
    default: 'present'
  },
  checkInLocation: {
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    },
    address: String
  },
  checkOutLocation: {
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    },
    address: String
  },
  breaks: [{
    startTime: {
      type: Date,
      required: true
    },
    endTime: Date,
    duration: {
      type: Number,
      default: 0 // in minutes
    },
    type: {
      type: String,
      enum: ['lunch', 'short', 'other'],
      default: 'short'
    },
    reason: String
  }],
  notes: {
    type: String,
    trim: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectedReason: String,
  isManualEntry: {
    type: Boolean,
    default: false
  },
  deviceInfo: {
    deviceId: String,
    ipAddress: String,
    userAgent: String
  },
  metadata: {
    expectedCheckIn: Date,
    expectedCheckOut: Date,
    lateMinutes: {
      type: Number,
      default: 0
    },
    earlyLeaveMinutes: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for better performance
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ companyId: 1, date: 1 });
attendanceSchema.index({ departmentId: 1, date: 1 });
attendanceSchema.index({ status: 1 });
attendanceSchema.index({ checkInTime: 1 });
attendanceSchema.index({ checkOutTime: 1 });

// Virtual for total working time including breaks
attendanceSchema.virtual('totalWorkTime').get(function() {
  if (!this.checkInTime || !this.checkOutTime) return 0;
  
  const totalTime = this.checkOutTime.getTime() - this.checkInTime.getTime();
  const breakTime = this.breaks.reduce((total, br) => {
    return total + (br.duration || 0);
  }, 0);
  
  return Math.max(0, totalTime - (breakTime * 60 * 1000)); // Convert break minutes to milliseconds
});

// Virtual for formatted working hours
attendanceSchema.virtual('formattedWorkingHours').get(function() {
  const hours = Math.floor(this.workingHours);
  const minutes = Math.round((this.workingHours - hours) * 60);
  return `${hours}h ${minutes}m`;
});

// Virtual to check if user is currently on break
attendanceSchema.virtual('isOnBreak').get(function() {
  return this.breaks.some(br => br.startTime && !br.endTime);
});

// Method to start a break
attendanceSchema.methods.startBreak = function(type = 'short', reason = '') {
  // Check if already on break
  if (this.isOnBreak) {
    throw new Error('User is already on break');
  }
  
  this.breaks.push({
    startTime: new Date(),
    type,
    reason
  });
  
  return this.save();
};

// Method to end current break
attendanceSchema.methods.endBreak = function() {
  const currentBreak = this.breaks.find(br => br.startTime && !br.endTime);
  
  if (!currentBreak) {
    throw new Error('No active break found');
  }
  
  currentBreak.endTime = new Date();
  currentBreak.duration = Math.round((currentBreak.endTime - currentBreak.startTime) / (1000 * 60)); // minutes
  
  return this.save();
};

// Method to calculate working hours
attendanceSchema.methods.calculateWorkingHours = function() {
  if (!this.checkInTime || !this.checkOutTime) {
    this.workingHours = 0;
    return;
  }
  
  const totalMinutes = (this.checkOutTime - this.checkInTime) / (1000 * 60);
  const breakMinutes = this.breaks.reduce((total, br) => total + (br.duration || 0), 0);
  
  this.workingHours = Math.max(0, (totalMinutes - breakMinutes) / 60); // Convert to hours
  
  // Calculate overtime (assuming 8 hours standard)
  const standardHours = 8;
  this.overtimeHours = Math.max(0, this.workingHours - standardHours);
};

// Method to check in
attendanceSchema.methods.checkIn = function(location) {
  if (this.checkInTime) {
    throw new Error('Already checked in for today');
  }
  
  this.checkInTime = new Date();
  this.status = 'present';
  
  if (location) {
    this.checkInLocation = location;
  }
  
  return this.save();
};

// Method to check out
attendanceSchema.methods.checkOut = function(location) {
  if (!this.checkInTime) {
    throw new Error('Must check in first');
  }
  
  if (this.checkOutTime) {
    throw new Error('Already checked out for today');
  }
  
  // End any active breaks
  if (this.isOnBreak) {
    this.endBreak();
  }
  
  this.checkOutTime = new Date();
  
  if (location) {
    this.checkOutLocation = location;
  }
  
  // Calculate working hours
  this.calculateWorkingHours();
  
  return this.save();
};

// Static method to get attendance for date range
attendanceSchema.statics.getAttendanceByDateRange = function(userId, startDate, endDate) {
  return this.find({
    userId,
    date: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ date: -1 });
};

// Static method to get department attendance
attendanceSchema.statics.getDepartmentAttendance = function(departmentId, date) {
  return this.find({
    departmentId,
    date: date || new Date()
  }).populate('userId', 'firstName lastName email');
};

// Pre-save middleware
attendanceSchema.pre('save', function(next) {
  // Auto-calculate working hours if check times are present
  if (this.checkInTime && this.checkOutTime && !this.workingHours) {
    this.calculateWorkingHours();
  }
  
  // Set date from checkInTime if not provided
  if (this.checkInTime && !this.date) {
    this.date = new Date(this.checkInTime.getFullYear(), this.checkInTime.getMonth(), this.checkInTime.getDate());
  }
  
  next();
});

module.exports = mongoose.model('Attendance', attendanceSchema);