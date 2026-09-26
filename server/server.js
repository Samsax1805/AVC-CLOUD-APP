require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/data', require('./routes/data.routes'));

app.use((req, res) => {
  res.status(404).json({ msg: `Route not found: ${req.method} ${req.path}` });
});

const PORT = process.env.PORT || 5000;
connectDB()
  .then(() => app.listen(PORT, () => {
    console.log(`🚀 API running on http://localhost:${PORT}`);
  }))
  .catch((e) => {
    console.error('❌ DB failed:', e.message);
    process.exit(1);
  });