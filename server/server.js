require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();
// In production only the choir site may call the API from a browser
const ORIGINS = ['https://avcsb.com', 'https://www.avcsb.com'];
app.use(cors(process.env.NODE_ENV === 'production' ? { origin: ORIGINS } : {}));
app.disable('x-powered-by');
// Only the whole-choir save carries large data (pictures in member profiles); everything else is small
app.use(['/api/data', '/api/state'], express.json({ limit: '50mb' }));
app.use(express.json({ limit: '5mb' }));
app.use(require('./middleware/shield'));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/data', require('./routes/data.routes'));
app.use('/api/members', require('./routes/members.routes'));
app.use('/api/files', require('./routes/files.routes'));
app.use('/api/elections', require('./routes/elections.routes'));
app.use('/api/security', require('./routes/security.routes'));
app.use('/api/assistant', require('./routes/assistant.routes'));
app.use('/api/psalmists', require('./routes/psalmists.routes'));
app.use('/api/messages', require('./routes/messages.routes'));
app.use('/api/finance', require('./routes/finance.routes'));
app.use('/api/attendance', require('./routes/attendance.routes'));

app.use((req, res) => {
  res.status(404).json({ msg: `Route not found: ${req.method} ${req.path}` });
});

// A request that fails in an unexpected way is logged; it must never stop the API for everyone
process.on('unhandledRejection', (e) => console.error('Unhandled request failure:', e?.message || e));

const PORT = process.env.PORT || 5000;
// In production the API answers only Nginx on this machine, never the internet directly
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : undefined);
connectDB()
  .then(() => app.listen(PORT, HOST, () => {
    console.log(`🚀 API running on http://localhost:${PORT}`);
    require('./services/birthday.service').start();
    require('./services/psalmist.service').start();
  }))
  .catch((e) => {
    console.error('❌ DB failed:', e.message);
    process.exit(1);
  });