const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/otp'; // Adjust port if your server runs on a different port
const TEST_PHONENUMBER = '218923686840';

async function runTests() {
    console.log('🔄 Starting OTP API Tests...\n');

    try {
        // ------------------------------------------------------------------
        // TEST 1: Request OTP
        // ------------------------------------------------------------------
        console.log(`📝 [TEST 1] Requesting OTP for phone number: ${TEST_PHONENUMBER}`);
        const sendResponse = await axios.post(`${BASE_URL}/send`, {
            phoneNumber: TEST_PHONENUMBER
        });

        console.log('✅ Response:', sendResponse.data);
        console.log('\n⚠️  ACTION REQUIRED: Look at your server console logs to find the generated 6-digit OTP code.');
        console.log('   (It should also log that it simulated sending an SMS to 0923686840)');

        // ------------------------------------------------------------------
        // TEST 2: Instructions for Verification
        // ------------------------------------------------------------------
        console.log('\n---------------------------------------------------------');
        console.log('To test verifying the OTP, run the following code or use Postman:');
        console.log('---------------------------------------------------------');
        console.log(`
        const verifyResponse = await axios.post('${BASE_URL}/verify', {
            phoneNumber: '${TEST_PHONENUMBER}',
            otpCode: '<INSERT_CODE_HERE>'
        });
        console.log(verifyResponse.data);
        `);

    } catch (error) {
        console.error('❌ Test failed:', error.response ? error.response.data : error.message);
    }
}

runTests();
