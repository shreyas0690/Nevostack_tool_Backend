const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organizerRole: {
    type: String,
    required: true,
    enum: ['admin', 'super_admin', 'department_head', 'manager', 'member', 'hr', 'hr_manager']
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
  departmentIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  }],
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    // optional: endTime may be omitted; we primarily use startTime as required
  },
  meetingLink: {
    type: String,
    trim: true
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  type: {
    type: String,
    enum: ['physical', 'virtual', 'hybrid'],
    default: 'physical'
  },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'postponed'],
    default: 'scheduled'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  location: {
    physical: {
      room: String,
      building: String,
      address: String,
      floor: String
    },
    virtual: {
      platform: {
        type: String,
        enum: ['zoom', 'teams', 'meet', 'webex', 'other']
      },
      meetingUrl: String,
      meetingId: String,
      password: String
    }
  },
  // Explicit list of user IDs invited to the meeting
  inviteeUserIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Optional roles that can be invited (e.g., ['manager'])
  inviteeRoles: [{
    type: String,
    enum: ['admin', 'super_admin', 'department_head', 'manager', 'member', 'hr', 'hr_manager']
  }],
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['organizer', 'required', 'optional'],
      default: 'required'
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'tentative'],
      default: 'pending'
    },
    joinedAt: Date,
    leftAt: Date,
    responseAt: Date,
    responseNote: String
  }],
  agenda: [{
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: String,
    duration: Number, // in minutes
    presenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    order: {
      type: Number,
      required: true
    }
  }],
  attachments: [{
    name: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    size: Number,
    type: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  notes: {
    type: String,
    trim: true
  },
  recording: {
    available: {
      type: Boolean,
      default: false
    },
    url: String,
    duration: Number, // in minutes
    size: Number // in bytes
  },
  recurring: {
    isRecurring: {
      type: Boolean,
      default: false
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly']
    },
    interval: {
      type: Number,
      default: 1
    },
    daysOfWeek: [Number], // 0-6 (Sunday-Saturday)
    endDate: Date,
    occurrences: Number
  },
  reminders: [{
    time: {
      type: Number,
      required: true // minutes before meeting
    },
    type: {
      type: String,
      enum: ['email', 'push', 'sms'],
      default: 'email'
    },
    sent: {
      type: Boolean,
      default: false
    },
    sentAt: Date
  }],
  settings: {
    allowJoinBeforeHost: {
      type: Boolean,
      default: false
    },
    requirePassword: {
      type: Boolean,
      default: false
    },
    recordMeeting: {
      type: Boolean,
      default: false
    },
    allowScreenShare: {
      type: Boolean,
      default: true
    },
    mutePalTickpantsOnJoin: {
      type: Boolean,
      default: false
    },
    maxParticipants: {
      type: Number,
      default: 100
    }
  },
  feedback: [{
    participant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    submittedAt: {
      type: Date,
      default: Date.now
    }
  }],
  actionItems: [{
    description: {
      type: String,
      required: true
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    dueDate: Date,
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending'
    },
    completedAt: Date
  }]
}, {
  timestamps: true
});

// Indexes for better performance
meetingSchema.index({ organizer: 1, startTime: 1 });
meetingSchema.index({ companyId: 1, startTime: 1 });
meetingSchema.index({ departmentId: 1, startTime: 1 });
meetingSchema.index({ 'participants.user': 1, startTime: 1 });
meetingSchema.index({ inviteeUserIds: 1, startTime: 1 });
meetingSchema.index({ status: 1, startTime: 1 });
meetingSchema.index({ startTime: 1, endTime: 1 });

// Virtual for duration in minutes
meetingSchema.virtual('duration').get(function() {
  if (!this.endTime) return null;
  return Math.round((this.endTime - this.startTime) / (1000 * 60));
});

// Virtual for meeting status
meetingSchema.virtual('isActive').get(function() {
  const now = new Date();
  if (!this.startTime) return false;
  if (!this.endTime) return this.startTime <= now; // start-only meetings considered active at/after start
  return this.startTime <= now && this.endTime > now;
});

// Virtual for meeting completion status
meetingSchema.virtual('isCompleted').get(function() {
  if (this.status === 'completed') return true;
  if (this.endTime) return this.endTime < new Date();
  return false;
});

// Virtual for participant count
meetingSchema.virtual('participantCount').get(function() {
  return this.participants.length;
});

// Virtual for accepted participants count
meetingSchema.virtual('acceptedCount').get(function() {
  return this.participants.filter(p => p.status === 'accepted').length;
});

// Method to add participant
meetingSchema.methods.addParticipant = function(userId, role = 'required') {
  const existingParticipant = this.participants.find(p => p.user.equals(userId));
  
  if (!existingParticipant) {
    this.participants.push({
      user: userId,
      role
    });
  }
  
  return this.save();
};

// Method to remove participant
meetingSchema.methods.removeParticipant = function(userId) {
  this.participants = this.participants.filter(p => !p.user.equals(userId));
  return this.save();
};

// Method to update participant response
meetingSchema.methods.updateParticipantResponse = function(userId, status, note = '') {
  const participant = this.participants.find(p => p.user.equals(userId));
  
  if (participant) {
    participant.status = status;
    participant.responseAt = new Date();
    participant.responseNote = note;
  }
  
  return this.save();
};

// Method to add agenda item
meetingSchema.methods.addAgendaItem = function(title, description, duration, presenter) {
  const order = this.agenda.length + 1;
  
  this.agenda.push({
    title,
    description,
    duration,
    presenter,
    order
  });
  
  return this.save();
};

// Method to add attachment
meetingSchema.methods.addAttachment = function(attachmentData, uploadedBy) {
  this.attachments.push({
    ...attachmentData,
    uploadedBy
  });
  
  return this.save();
};

// Method to start meeting
meetingSchema.methods.startMeeting = function() {
  this.status = 'in_progress';
  
  // Mark organizer as joined
  const organizer = this.participants.find(p => p.role === 'organizer');
  if (organizer) {
    organizer.joinedAt = new Date();
  }
  
  return this.save();
};

// Method to end meeting
meetingSchema.methods.endMeeting = function(notes = '') {
  this.status = 'completed';
  this.notes = notes;
  
  // Mark all joined participants as left
  this.participants.forEach(p => {
    if (p.joinedAt && !p.leftAt) {
      p.leftAt = new Date();
    }
  });
  
  return this.save();
};

// Method to cancel meeting
meetingSchema.methods.cancelMeeting = function(reason = '') {
  this.status = 'cancelled';
  this.notes = reason;
  return this.save();
};

// Method to add action item
meetingSchema.methods.addActionItem = function(description, assignedTo, dueDate) {
  this.actionItems.push({
    description,
    assignedTo,
    dueDate
  });
  
  return this.save();
};

// Method to mark participant as joined
meetingSchema.methods.markParticipantJoined = function(userId) {
  const participant = this.participants.find(p => p.user.equals(userId));
  
  if (participant && !participant.joinedAt) {
    participant.joinedAt = new Date();
  }
  
  return this.save();
};

// Method to mark participant as left
meetingSchema.methods.markParticipantLeft = function(userId) {
  const participant = this.participants.find(p => p.user.equals(userId));
  
  if (participant && participant.joinedAt && !participant.leftAt) {
    participant.leftAt = new Date();
  }
  
  return this.save();
};

// Static method to get upcoming meetings
meetingSchema.statics.getUpcomingMeetings = function(userId, limit = 10) {
  return this.find({
    $or: [
      { 'participants.user': userId },
      { inviteeUserIds: userId },
      { organizer: userId }
    ],
    startTime: { $gte: new Date() },
    status: { $in: ['scheduled', 'in_progress'] }
  })
  .sort({ startTime: 1 })
  .limit(limit)
  .populate('organizer participants.user inviteeUserIds', 'firstName lastName email avatar');
};

// Static method to get meetings by date range
meetingSchema.statics.getMeetingsByDateRange = function(startDate, endDate, userId = null) {
  const query = {
    startTime: { $gte: startDate, $lte: endDate }
  };
  
  if (userId) {
    query.$or = [
      { 'participants.user': userId },
      { inviteeUserIds: userId },
      { organizer: userId }
    ];
  }
  
  return this.find(query)
    .sort({ startTime: 1 })
    .populate('organizer participants.user inviteeUserIds', 'firstName lastName email avatar');
};

// Static method to check for conflicts
meetingSchema.statics.checkConflicts = function(startTime, endTime, participantIds, excludeMeetingId = null) {
  const query = {
    $or: [
      { startTime: { $lt: endTime }, endTime: { $gt: startTime } }
    ],
    'participants.user': { $in: participantIds },
    status: { $nin: ['cancelled', 'completed'] }
  };
  
  if (excludeMeetingId) {
    query._id = { $ne: excludeMeetingId };
  }
  
  return this.find(query);
};

// Pre-save middleware
meetingSchema.pre('save', function(next) {
  // Validate end time is after start time (only when endTime provided)
  if (this.endTime && this.endTime <= this.startTime) {
    next(new Error('End time must be after start time'));
    return;
  }
  
  // Sort agenda items by order
  if (this.agenda.length > 0) {
    this.agenda.sort((a, b) => a.order - b.order);
  }
  
  next();
});

module.exports = mongoose.model('Meeting', meetingSchema);