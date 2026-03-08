const authService = require('../services/authService');
const { initializeOracle, closePool } = require('../config/database');
const { connectMongoDB, disconnectMongoDB } = require('../config/mongodb');
const Token = require('../models/Token');
require('dotenv').config();

async function runTest() {
    console.log('🧪 Starting FX House API Test Setup...');

    try {
        // 1. Initialize DBs
        console.log('📦 Connecting to databases...');
        await connectMongoDB();
        await initializeOracle();

        const customerNumber = '000034024';
        console.log(`🔍 Generating token for Customer: ${customerNumber}`);

        // 2. Generate and save token (this calls Oracle for name and Mongo for saving)
        const token = await authService.generateToken(customerNumber);

        // 3. Verify it's in MongoDB
        const dbToken = await Token.findOne({ token });
        const customerName = dbToken ? dbToken.customer_name : 'Unknown';

        console.log('\n✅ Token generated and saved to MongoDB!');
        console.log('-----------------------------------');
        console.log(`👤 Customer: ${customerName} (${customerNumber})`);
        console.log(`🔑 Token: ${token}`);
        console.log('-----------------------------------');
        console.log('\n🚀 Use this Bearer token in Postman.');
        console.log('To "delete" (revoke) this token, call:');
        console.log('POST /api/auth/revoke');
        console.log('with this Bearer token in the header.');

    } catch (error) {
        console.error('❌ Error during test setup:', error.stack);
    } finally {
        await closePool();
        await disconnectMongoDB();
        process.exit(0);
    }
}

runTest();
