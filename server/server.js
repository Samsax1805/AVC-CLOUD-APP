require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();
// In production only the choir site may call the API from a browser
const ORIGINS = ['https://avcsb.com', 'https://www.avcsb.com'];
app.use(cors(process.env.NODE_ENV === 'production' ? { origin: ORIGINS } : {}));
app.disable('x-powered-by');
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/data', require('./routes/data.routes'));
app.use('/api/members', require('./routes/members.routes'));
app.use('/api/files', require('./routes/files.routes'));
app.use('/api/elections', require('./routes/elections.routes'));

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