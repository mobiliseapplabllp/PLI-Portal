const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const connectDB = require('./src/config/db');
const { errorHandler } = require('./src/middleware/errorHandler');
const routes = require('./src/routes');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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
  console.log(`PLI Portal API running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

module.exports = app;
