const axios = require('axios');

// Test the date conversion functionality
async function testDateConversion() {
  console.log('🧪 Testing Date Conversion (DD-MM-YYYY → YYMMDD)...\n');
  
  const testCases = [
    {
      input: "19-03-2023",
      expected: "230319"
    },
    {
      input: "05-12-2024", 
      expected: "241205"
    },
    {
      input: "31-01-2025",
      expected: "250131"
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`📤 Testing: ${testCase.input} → Expected: ${testCase.expected}`);
    
    const testData = {
      HeaderSwitchModel: {
        TargetSystemUserID: "SWITCHUSER"
      },
      LookUpData: {
        Details: {
          RRN: "456107036921",
          STAN: "543028",
          TXNAMT: "20000",
          TERMID: "888777",
          SETLDATE: testCase.input
        }
      }
    };
    
    try {
      const response = await axios.post('http://localhost:3000/api/inquired', testData, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`✅ Request successful for ${testCase.input}`);
      console.log(`📤 Response:`, JSON.stringify(response.data, null, 2));
      
    } catch (error) {
      if (error.response) {
        console.log(`❌ Error response for ${testCase.input}:`, error.response.status);
        console.log(`📤 Response:`, JSON.stringify(error.response.data, null, 2));
      } else {
        console.log(`❌ Network error for ${testCase.input}:`, error.message);
      }
    }
    
    console.log(''); // Empty line for readability
  }
}

// Run the test
testDateConversion().catch(console.error); 