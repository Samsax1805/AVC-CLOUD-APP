const mongoose = require('mongoose');

module.exports = async () => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB (Atlas) connected');
};