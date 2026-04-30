const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const connectDB = require('./src/config/db');
const { isDbReady } = connectDB;
const { errorHandler } = require('./src/middleware/errorHandler');
const routes = require('./src/routes');
const logger = require('./src/utils/logger');

const app = express();
const PORT = process.env.PORT || 5105;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// HTTP request logger — skips health-check noise
morgan.token('body-size', (req) => {
  const len = req.headers['content-length'];
  return len ? `${len}b` : '-';
});
app.use(
  morgan(':method :url :status :response-time ms - :body-size', {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip: (req) => req.url === '/health',
  })
);

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check (always available — shows DB readiness)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', db: isDbReady() ? 'connected' : 'connecting', timestamp: new Date().toISOString() });
});

// Block API requests until DB is ready — return a clean 503
app.use('/api', (req, res, next) => {
  if (!isDbReady()) {
    return res.status(503).json({
      success: false,
      error: { message: 'Server is starting up — database connecting. Please try again in a few seconds.' },
    });
  }
  next();
});

// API Routes
app.use('/api', routes);

// Global error handler
app.use(errorHandler);

// Serve frontend in production
const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'dist');
if (require('fs').existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  // All non-API routes serve the React app (SPA fallback)
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
} else {
  // 404 handler (dev mode — no frontend build)
  app.use((req, res) => {
    res.status(404).json({ success: false, error: { message: 'Route not found' } });
  });
}

app.listen(PORT, () => {
  logger.success(`PLI Portal API  →  http://localhost:${PORT}  (${process.env.NODE_ENV || 'development'})`);
  // Connect to DB after HTTP server is up — retries indefinitely until success
  connectDB();
});

module.exports = app;
