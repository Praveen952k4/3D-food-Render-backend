const mongoose = require('mongoose');

const gstAuditEventSchema = new mongoose.Schema({
  restaurantId: {
    type: String,
    required: true,
    default: 'default_restaurant',
    index: true,
  },
  action: {
    type: String,
    required: true,
    index: true,
  },
  actor: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    phone: String,
    role: String,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  correlationId: {
    type: String,
    index: true,
  },
  ipAddress: {
    type: String,
    default: '127.0.0.1',
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Enforce append-only semantics - prevent updates or deletes on audit events
gstAuditEventSchema.pre('updateOne', function() {
  throw new Error('Audit trail records cannot be updated.');
});
gstAuditEventSchema.pre('findOneAndUpdate', function() {
  throw new Error('Audit trail records cannot be updated.');
});
gstAuditEventSchema.pre('deleteOne', function() {
  throw new Error('Audit trail records cannot be deleted.');
});
gstAuditEventSchema.pre('findOneAndDelete', function() {
  throw new Error('Audit trail records cannot be deleted.');
});

module.exports = mongoose.model('GSTAuditEvent', gstAuditEventSchema);
