const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const API_ENDPOINT = `${BASE_URL}/api/inquired`;

// Test cases
const testCases = [
  {
    name: 'Valid Transaction Request',
    data: {
      HeaderSwitchModel: {
        TargetSystemUserID: "SWITCHUSER"
      },
      LookUpData: {
        Details: {
          RRN: "456107036921",
          STAN: "543028",
          TXNAMT: "20000",
          TERMID: "888777",
          SETLDATE: "19-03-2025"
        }
      }
    },
    expectedStatus: 200
  },
  {
    name: 'Invalid RRN (less than 12 digits)',
    data: {
      HeaderSwitchModel: {
        TargetSystemUserID: "SWITCHUSER"
      },
      LookUpData: {
        Details: {
          RRN: "123456789",
          STAN: "543028",
          TXNAMT: "20000",
          TERMID: "888777",
          SETLDATE: "19-03-2025"
        }
      }
    },
    expectedStatus: 400,
    expectedError: 'E2'
  },
  {
    name: 'Invalid STAN (not 6 digits)',
    data: {
      HeaderSwitchModel: {
        TargetSystemUserID: "SWITCHUSER"
      },
      LookUpData: {
        Details: {
          RRN: "456107036921",
          STAN: "5430",
          TXNAMT: "20000",
          TERMID: "888777",
          SETLDATE: "19-03-2025"
        }
      }
    },
    expectedStatus: 400,
    expectedError: 'E3'
  },
  {
    name: 'Invalid TXNAMT (non-numeric)',
    data: {
      HeaderSwitchModel: {
        TargetSystemUserID: "SWITCHUSER"
      },
      LookUpData: {
        Details: {
          RRN: "456107036921",
          STAN: "543028",
          TXNAMT: "abc",
          TERMID: "888777",
          SETLDATE: "19-03-2025"
        }
      }
    },
    expectedStatus: 400,
    expectedError: 'E4'
  },
  {
    name: 'Invalid TERMID (too short)',
    data: {
      HeaderSwitchModel: {
        TargetSystemUserID: "SWITCHUSER"
      },
      LookUpData: {
        Details: {
          RRN: "456107036921",
          STAN: "543028",
          TXNAMT: "20000",
          TERMID: "12345",
          SETLDATE: "19-03-2025"
        }
      }
    },
    expectedStatus: 400,
    expectedError: 'E5'
  },
  {
    name: 'Invalid Date Format',
    data: {
      HeaderSwitchModel: {
        TargetSystemUserID: "SWITCHUSER"
      },
      LookUpData: {
        Details: {
          RRN: "456107036921",
          STAN: "543028",
          TXNAMT: "20000",
          TERMID: "888777",
          SETLDATE: "2025-03-19"
        }
      }
    },
    expectedStatus: 400,
    expectedError: 'E7'
  },
  {
    name: 'Missing TargetSystemUserID',
    data: {
      HeaderSwitchModel: {
        TargetSystemUserID: ""
      },
      LookUpData: {
        Details: {
          RRN: "456107036921",
          STAN: "543028",
          TXNAMT: "20000",
          TERMID: "888777",
          SETLDATE: "19-03-2025"
        }
      }
    },
    expectedStatus: 400,
    expectedError: 'E1'
  }
];

async function runTests() {
  console.log('🧪 Starting API Tests...\n');
  
  let passedTests = 0;
  let totalTests = testCases.length;
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`📋 Test ${i + 1}: ${testCase.name}`);
    
    try {
      const response = await axios.post(API_ENDPOINT, testCase.data, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      if (response.status === testCase.expectedStatus) {
        if (testCase.expectedError) {
          const result = response.data.Result[0];
          if (result.Code === testCase.expectedError) {
            console.log(`✅ PASSED - Expected error ${testCase.expectedError}: ${result.Message}`);
            passedTests++;
          } else {
            console.log(`❌ FAILED - Expected error ${testCase.expectedError}, got ${result.Code}`);
          }
        } else {
          console.log(`✅ PASSED - Status ${response.status}`);
          console.log(`📤 Response: ${JSON.stringify(response.data, null, 2)}`);
          passedTests++;
        }
      } else {
        console.log(`❌ FAILED - Expected status ${testCase.expectedStatus}, got ${response.status}`);
      }
      
    } catch (error) {
      if (error.response) {
        const response = error.response;
        if (response.status === testCase.expectedStatus) {
          if (testCase.expectedError) {
            const result = response.data.Result[0];
            if (result.Code === testCase.expectedError) {
              console.log(`✅ PASSED - Expected error ${testCase.expectedError}: ${result.Message}`);
              passedTests++;
            } else {
              console.log(`❌ FAILED - Expected error ${testCase.expectedError}, got ${result.Code}`);
            }
          } else {
            console.log(`❌ FAILED - Unexpected error response`);
          }
        } else {
          console.log(`❌ FAILED - Expected status ${testCase.expectedStatus}, got ${response.status}`);
        }
      } else {
        console.log(`❌ FAILED - Network error: ${error.message}`);
      }
    }
    
    console.log(''); // Empty line for readability
  }
  
  console.log(`📊 Test Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Please check the implementation.');
  }
}

// Health check function
async function healthCheck() {
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    console.log('🏥 Health check passed:', response.data);
    return true;
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
    return false;
  }
}

// Main execution
async function main() {
  console.log('🔍 Checking if server is running...');
  
  const isHealthy = await healthCheck();
  if (!isHealthy) {
    console.log('❌ Server is not running. Please start the server first:');
    console.log('   npm run dev');
    console.log('   or');
    console.log('   npm start');
    return;
  }
  
  console.log('✅ Server is running. Starting tests...\n');
  await runTests();
}

// Run tests if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { runTests, healthCheck }; 