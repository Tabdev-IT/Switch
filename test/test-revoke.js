const axios = require('axios');
const authService = require('../services/authService');
const { initializeOracle, closePool } = require('../config/database');
const { connectMongoDB, disconnectMongoDB } = require('../config/mongodb');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = 'http://localhost:3000';

async function testRevocation() {
    console.log('🧪 Starting Token Revocation Test...');

    try {
        await connectMongoDB();
        await initializeOracle();

        // 1. Generate a fresh token
        const customerNumber = '000059975';
        console.log(`\nStep 1: Generating token for ${customerNumber}...`);
        const token = await authService.generateToken(customerNumber);
        console.log(`✅ Token: ${token.substring(0, 20)}...`);

        // 2. Test protected endpoint (Balance – uses token → customer → accounts → balance by CUST_AC_NO)
        console.log('\nStep 2: Testing protected endpoint (/api/fx/balance)...');
        const balanceRes = await axios.get(`${BASE_URL}/api/fx/balance`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`✅ Success! customer_number=${balanceRes.data.customer_number}, accounts=${balanceRes.data.accounts?.length ?? 0}`);

        // 3. Revoke the token
        console.log('\nStep 3: Revoking the token (/api/auth/revoke)...');
        const revokeRes = await axios.post(`${BASE_URL}/api/auth/revoke`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`✅ Revoke response: ${revokeRes.data.message}`);

        // 4. Test the protected endpoint again (Should fail)
        console.log('\nStep 4: Testing protected endpoint after revocation...');
        try {
            await axios.get(`${BASE_URL}/api/fx/balance`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('❌ Error: The request should have failed but it succeeded.');
        } catch (error) {
            console.log(`✅ Confirmed: Request failed as expected with status: ${error.response.status}`);
            console.log(`   Message: ${error.response.data.message}`);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) console.error('Response Data:', error.response.data);
    } finally {
        await closePool();
        await disconnectMongoDB();
        process.exit(0);
    }
}

testRevocation();
