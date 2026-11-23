const mongoose = require('mongoose');

// One phone or computer that has said yes to notifications from the choir site
const PushSubscriptionSchema = new mongoose.Schema({
  userId: { type: String, index: true },
  endpoint: { type: String, unique: true },
  keys: { p256dh: String, auth: String },
  device: String,
  lastOkAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);
