const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Support multiple assignees while keeping a primary for legacy flows
  assignedToList: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }],
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedByRole: {
    type: String,
    enum: ['super_admin', 'admin', 'hr_manager', 'hr', 'department_head', 'manager', 'member'],
    required: true
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
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['todo', 'assigned', 'in_progress', 'review', 'completed', 'cancelled', 'blocked'],
    default: 'assigned'
  },
  assigneeType: {
    type: String,
    enum: ['user', 'role', 'department'],
    default: 'user'
  },
  assignedToRole: {
    type: String,
    trim: true
  },
  assignmentHistory: [{
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byRole: String,
    at: { type: Date, default: Date.now },
    note: String
  }],
  visibleToRoles: [{
    type: String
  }],
  category: {
    type: String,
    enum: ['development', 'design', 'testing', 'research', 'meeting', 'documentation', 'bug_fix', 'feature', 'other'],
    default: 'other'
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  dueDate: {
    type: Date
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  completedDate: {
    type: Date
  },
  estimatedHours: {
    type: Number,
    min: 0,
    max: 1000
  },
  actualHours: {
    type: Number,
    default: 0,
    min: 0
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  attachments: [{
    name: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    size: {
      type: Number
    },
    type: {
      type: String
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    text: {
      type: String,
      required: true,
      trim: true
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task.comments'
    },
    attachments: [{
      id: String,
      name: String,
      url: String,
      size: Number,
      type: String,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }],
    createdAt: {
      type: Date,
      default: Date.now
    },
    editedAt: Date,
    isEdited: {
      type: Boolean,
      default: false
    }
  }],
  subtasks: [{
    title: {
      type: String,
      required: true,
      trim: true
    },
    completed: {
      type: Boolean,
      default: false
    },
    completedAt: Date,
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  dependencies: [{
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    },
    type: {
      type: String,
      enum: ['blocks', 'blocked_by', 'related'],
      default: 'related'
    }
  }],
  timeLog: [{
    date: {
      type: Date,
      default: Date.now
    },
    hours: {
      type: Number,
      required: true,
      min: 0
    },
    description: {
      type: String,
      trim: true
    },
    loggedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }],
  watchers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  labels: [{
    name: String,
    color: String
  }],
  recurring: {
    isRecurring: {
      type: Boolean,
      default: false
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly']
    },
    interval: {
      type: Number,
      default: 1
    },
    endDate: Date
  },
  approval: {
    required: {
      type: Boolean,
      default: false
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    rejectedReason: String
  }
}, {
  timestamps: true
});

// Indexes for better performance
taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ assignedBy: 1 });
taskSchema.index({ companyId: 1, status: 1 });
taskSchema.index({ departmentId: 1 });
taskSchema.index({ priority: 1, status: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ category: 1 });
taskSchema.index({ tags: 1 });
taskSchema.index({ createdAt: -1 });

// Virtual for overdue status
taskSchema.virtual('isOverdue').get(function () {
  return this.dueDate && this.dueDate < new Date() && this.status !== 'completed';
});

// Virtual for days remaining
taskSchema.virtual('daysRemaining').get(function () {
  if (!this.dueDate) return null;
  const today = new Date();
  const diffTime = this.dueDate - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for completion percentage of subtasks
taskSchema.virtual('subtaskCompletion').get(function () {
  if (this.subtasks.length === 0) return 100;
  const completed = this.subtasks.filter(st => st.completed).length;
  return Math.round((completed / this.subtasks.length) * 100);
});

// Virtual for total logged hours
taskSchema.virtual('totalLoggedHours').get(function () {
  return this.timeLog.reduce((total, log) => total + log.hours, 0);
});

// Method to add comment
taskSchema.methods.addComment = function (text, authorId) {
  this.comments.push({
    text,
    author: authorId
  });
  return this.save();
};

// Method to update progress
taskSchema.methods.updateProgress = function (progress) {
  this.progress = Math.max(0, Math.min(100, progress));

  if (this.progress === 100 && this.status !== 'completed') {
    this.status = 'completed';
    this.completedDate = new Date();
  } else if (this.progress > 0 && this.status === 'todo') {
    this.status = 'in_progress';
  }

  return this.save();
};

// Method to add time log
taskSchema.methods.logTime = function (hours, description, userId) {
  this.timeLog.push({
    hours,
    description,
    loggedBy: userId
  });

  this.actualHours += hours;
  return this.save();
};

// Method to add subtask
taskSchema.methods.addSubtask = function (title, assignedTo) {
  this.subtasks.push({
    title,
    assignedTo
  });
  return this.save();
};

// Method to complete subtask
taskSchema.methods.completeSubtask = function (subtaskId) {
  const subtask = this.subtasks.id(subtaskId);
  if (subtask) {
    subtask.completed = true;
    subtask.completedAt = new Date();

    // Update main task progress based on subtask completion
    const completionPercentage = this.subtaskCompletion;
    this.progress = Math.max(this.progress, completionPercentage);
  }
  return this.save();
};

// Method to add attachment
taskSchema.methods.addAttachment = function (attachmentData, uploadedBy) {
  this.attachments.push({
    ...attachmentData,
    uploadedBy
  });
  return this.save();
};

// Method to add watcher
taskSchema.methods.addWatcher = function (userId) {
  if (!this.watchers.includes(userId)) {
    this.watchers.push(userId);
  }
  return this.save();
};

// Method to remove watcher
taskSchema.methods.removeWatcher = function (userId) {
  this.watchers = this.watchers.filter(id => !id.equals(userId));
  return this.save();
};

// Static method to get tasks by status
taskSchema.statics.getTasksByStatus = function (status, userId = null) {
  const query = { status };
  if (userId) {
    query.assignedTo = userId;
  }
  return this.find(query).populate('assignedTo assignedBy', 'firstName lastName email role');
};

// Static method to get overdue tasks
taskSchema.statics.getOverdueTasks = function (userId = null) {
  const query = {
    dueDate: { $lt: new Date() },
    status: { $nin: ['completed', 'blocked'] }
  };
  if (userId) {
    query.assignedTo = userId;
  }
  return this.find(query).populate('assignedTo assignedBy', 'firstName lastName email role');
};

// Static method to get tasks by priority
taskSchema.statics.getTasksByPriority = function (priority, userId = null) {
  const query = { priority };
  if (userId) {
    query.assignedTo = userId;
  }
  return this.find(query).populate('assignedTo assignedBy', 'firstName lastName email');
};

// Pre-save middleware
taskSchema.pre('save', async function (next) {
  this.comments = (this.comments || []).map(comment => ({
    ...{ attachments: [] },
    ...comment,
    text: comment.text || '',
    createdAt: comment.createdAt || new Date()
  }));

  // Auto-populate assignedByRole if not set
  if (this.isNew && this.assignedBy && !this.assignedByRole) {
    try {
      const User = mongoose.model('User');
      const assigner = await User.findById(this.assignedBy).select('role');
      if (assigner) {
        this.assignedByRole = assigner.role;
      }
    } catch (error) {
      // If we can't find the user, continue without setting the role
      console.warn('Could not populate assignedByRole:', error.message);
    }
  }

  // Auto-update progress based on subtasks if no manual progress set
  if (this.subtasks && this.subtasks.length > 0 && this.progress === 0) {
    this.progress = this.subtaskCompletion;
  }

  // Set completed date when status changes to completed
  if (this.status === 'completed' && !this.completedDate) {
    this.completedDate = new Date();
    this.progress = 100;
  }

  // Clear completed date if status changes from completed
  if (this.status !== 'completed' && this.completedDate) {
    this.completedDate = null;
  }

  next();
});

// Post-save middleware to notify watchers
taskSchema.post('save', function (doc) {
  // Here you can add notification logic for watchers
  // This is where you'd typically trigger notifications
});

module.exports = mongoose.model('Task', taskSchema);
