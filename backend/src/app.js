const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
dotenv.config();
const queueRoutes = require('./routes/queue.routes');
const authRoutes = require('./routes/auth.routes');
const staffRoutes = require('./routes/staff.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const masterRoutes = require('./routes/master.routes');
const { errorHandler } = require('./middleware/error.middleware');
const setupSocketHandlers = require('./sockets/socket.handler');
const { initializeDatabase } = require('./utils/database');
const QueueEngine = require('./modules/queue/queue.engine');
const QueueAutomator = require('./services/QueueAutomator.service');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
app.use(helmet());
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 50, 
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
const socketHandlers = setupSocketHandlers(io);
QueueEngine.setSocketEmitter(socketHandlers);


const otpLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 5 
});
app.use('/api/auth', otpLimiter);

app.use('/api/queue', queueRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/master', masterRoutes);
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
app.use(errorHandler);
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found'
  });
});
const PORT = process.env.PORT || 3000;
async function startServer() {
  try {
    await initializeDatabase();
    console.log('✅ Database initialized successfully');
    await QueueEngine.initializeWorker();
    console.log('✅ Queue engine initialized successfully');
    const queueAutomator = new QueueAutomator(io);
    queueAutomator.start();
    console.log('✅ Queue Automator service started');
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Socket.IO listening on ws://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});
process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});
startServer();
module.exports = { app, server, io };