require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const { initializeOracle, closePool } = require('./config/database');
const { connectMongoDB, disconnectMongoDB } = require('./config/mongodb');

// Import routes
const inquiredRoutes = require('./routes/inquired');
const smsRoutes = require('./routes/sms');
const webhookRoutes = require('./routes/webhook');
const fxHouseRoutes = require('./routes/fxHouse');
const authRoutes = require('./routes/auth');
const otpRoutes = require('./routes/otp');
const oracle = require('./utils/Oracle');

// Import SMPP services
const { Sms, SMSManager } = require('./services/smppService');
const smppConfig = require('./config/smpp');

// Initialize SMPP services immediately
console.log('📱 Initializing SMPP services...');
const SMS_Libyana = new Sms('Libyana', smppConfig.smpp.libyana);
const SMS_Madar = new Sms('Almadar', smppConfig.smpp.almadar);
const smsManager = new SMSManager(SMS_Libyana, SMS_Madar);

// Make SMPP services available globally
global.SMS_Libyana = SMS_Libyana;
global.SMS_Madar = SMS_Madar;
global.smsManager = smsManager;

console.log('📱 SMPP services initialized successfully');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3300;

// Security middleware
app.use(helmet());

// CORS middleware
app.use(cors({
  origin: '*', // Configure this based on your requirements
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📨 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Bank Inquired API',
    version: '1.0.0'
  });
});

// Webhook routes - NO body parsing, raw body needed for HMAC
app.use('/webhooks', webhookRoutes);

// Body parsing middleware (MUST be before routes that use req.body)
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api', inquiredRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/fx', fxHouseRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/otp', otpRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.originalUrl} does not exist`
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Global error handler:', error);

  res.status(500).json({
    Result: [{
      Code: 'E9',
      Message: 'Core bank system error'
    }]
  });
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  await closePool();
  await disconnectMongoDB();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  await closePool();
  await disconnectMongoDB();
  process.exit(0);
});

// Initialize database and start server
async function startServer() {
  try {
    console.log('🎬 Starting server...');
    // Initialize Oracle pool from utility
    console.log('⏳ Initializing new Oracle class...');
    await oracle.init();
    console.log('✅ New Oracle class initialized');

    // Initialize Oracle database connection (legacy)
    console.log('⏳ Initializing legacy Oracle connection...');
    await initializeOracle();
    console.log('✅ Legacy Oracle connection initialized');

    // Initialize MongoDB connection
    console.log('⏳ Connecting to MongoDB...');
    await connectMongoDB();
    console.log('✅ MongoDB connected');

    // Start Express server
    app.listen(PORT, '0.0.0.0', () => {
      console.log('🚀 Bank Inquired API server started successfully!');
      console.log(`📍 Server running on port ${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`📡 API endpoint: http://localhost:${PORT}/api/inquired`);
      console.log('⏰', new Date().toISOString());

      // Log SMPP connection status after server starts
      setTimeout(() => {
        console.log('\n📱 SMPP Connection Status:');
        console.log(`   Libyana: ${global.SMS_Libyana.isConnected() ? '✅ Connected' : '❌ Disconnected'}`);
        console.log(`   Almadar: ${global.SMS_Madar.isConnected() ? '✅ Connected' : '❌ Disconnected'}`);

        if (global.SMS_Libyana.isConnected() || global.SMS_Madar.isConnected()) {
          console.log('🎉 SMPP services are ready for SMS operations!');
        } else {
          console.log('⚠️  SMPP services are not connected. Check your network and SMPP provider settings.');
        }
      }, 3000); // Wait 3 seconds for connections to establish
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer(); 