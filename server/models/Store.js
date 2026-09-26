const mongoose = require('mongoose');
const StoreSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  data: mongoose.Schema.Types.Mixed,
}, { timestamps: true });
module.exports = mongoose.model('Store', StoreSchema);