const mongoose = require('mongoose');

const mongoURI = 'mongodb://internal.tab.ly:27017/tab-cbl';

const connectMongoDB = async () => {
  try {
    console.log('🔌 Attempting to connect to MongoDB...');
    console.log(`🔌 URI: ${mongoURI}`);
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ MongoDB connected successfully');
    console.log(`📍 Database: tab-cbl`);
    console.log(`🔗 URI: ${mongoURI}`);
    
    // Log connection status
    console.log('🔌 MongoDB connection state:', mongoose.connection.readyState);
    console.log('🔌 MongoDB connection name:', mongoose.connection.name);
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.error('❌ Full error:', error);
    process.exit(1);
  }
};

const disconnectMongoDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('✅ MongoDB disconnected successfully');
  } catch (error) {
    console.error('❌ MongoDB disconnection error:', error.message);
  }
};

module.exports = {
  connectMongoDB,
  disconnectMongoDB,
  mongoURI
};
