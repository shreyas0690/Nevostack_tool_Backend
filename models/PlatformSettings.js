const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema({
  // General Settings
  platformName: { type: String, default: 'NevoStack SaaS Platform', trim: true },
  platformDomain: { type: String, default: 'nevostack.com', trim: true },
  supportEmail: { type: String, default: 'support@nevostack.com', trim: true },
  contactPhone: { type: String, default: '+1 (555) 123-4567', trim: true },
  timezone: { type: String, default: 'UTC', trim: true },
  language: { type: String, default: 'en', trim: true },

  // Contact Person Info
  firstName: { type: String, default: '', trim: true },
  lastName: { type: String, default: '', trim: true },

  // Security Settings
  requireStrongPassword: { type: Boolean, default: true }
}, {
  timestamps: true,
  // Ensure only one document exists
  versionKey: false
});

// Static method to get the settings (there should only be one document)
platformSettingsSchema.statics.getSettings = function() {
  return this.findOne().lean();
};

// Static method to update or create settings
platformSettingsSchema.statics.upsertSettings = function(settings) {
  return this.findOneAndUpdate(
    {}, // Empty filter to match any document
    { $set: settings },
    {
      new: true,
      upsert: true, // Create if doesn't exist
      runValidators: true
    }
  );
};

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
