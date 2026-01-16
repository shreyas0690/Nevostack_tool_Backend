const mongoose = require('mongoose');

const adminPanelSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  
  dashboard: {
    widgets: [{
      name: String,
      enabled: { type: Boolean, default: true },
      position: { x: Number, y: Number },
      size: { width: Number, height: Number }
    }],
    layout: { type: String, default: 'grid' }
  },

  permissions: {
    userManagement: {
      view: { type: Boolean, default: true },
      create: { type: Boolean, default: true },
      edit: { type: Boolean, default: true },
      delete: { type: Boolean, default: false }
    },
    departmentManagement: {
      view: { type: Boolean, default: true },
      create: { type: Boolean, default: true },
      edit: { type: Boolean, default: true },
      delete: { type: Boolean, default: false }
    },
    systemSettings: {
      view: { type: Boolean, default: true },
      edit: { type: Boolean, default: false }
    }
  },

  quickActions: [{
    name: String,
    icon: String,
    action: String,
    enabled: { type: Boolean, default: true }
  }],

  theme: {
    primaryColor: { type: String, default: '#3B82F6' },
    darkMode: { type: Boolean, default: false }
  },

  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

adminPanelSchema.index({ workspaceId: 1 }, { unique: true });

module.exports = mongoose.model('AdminPanel', adminPanelSchema);
