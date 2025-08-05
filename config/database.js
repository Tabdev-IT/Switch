const oracledb = require('oracledb');

// Oracle Database Configuration
const dbConfig = {
  user: 'cbl_user',
  password: 'Tabcbl_2024',
  connectString: `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=10.100.30.1)(PORT=1521))(CONNECT_DATA=(SERVER=DEDICATED)(SID=tabpubs1)))`,
  poolMin: 2,
  poolMax: 10,
  poolIncrement: 1,
  poolTimeout: 60,
  queueTimeout: 60000,
  _enableStats: true
};

// Initialize Oracle Client
async function initializeOracle() {
  try {
    // Set Oracle Client configuration
    oracledb.autoCommit = true;
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    
    // Create connection pool
    await oracledb.createPool(dbConfig);
    console.log('✅ Oracle connection pool created successfully');
  } catch (error) {
    console.error('❌ Error initializing Oracle database:', error);
    throw error;
  }
}

// Get connection from pool
async function getConnection() {
  try {
    const connection = await oracledb.getConnection();
    return connection;
  } catch (error) {
    console.error('❌ Error getting database connection:', error);
    throw error;
  }
}

// Close connection
async function closeConnection(connection) {
  try {
    if (connection) {
      await connection.close();
    }
  } catch (error) {
    console.error('❌ Error closing database connection:', error);
  }
}

// Close pool
async function closePool() {
  try {
    await oracledb.getPool().close();
    console.log('✅ Oracle connection pool closed');
  } catch (error) {
    console.error('❌ Error closing Oracle pool:', error);
  }
}

module.exports = {
  initializeOracle,
  getConnection,
  closeConnection,
  closePool,
  dbConfig
}; 