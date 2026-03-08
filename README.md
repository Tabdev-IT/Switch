# Bank Inquired API

A Node.js Express API for inquiring bank transactions with Oracle database integration.

## 🚀 Features

- **Oracle Database Integration**: Connects to Oracle database for transaction lookup
- **Input Validation**: Comprehensive validation for all input fields
- **Error Handling**: Proper error handling with specific error codes
- **Security**: CORS, Helmet, and other security middleware
- **Logging**: Detailed request/response logging
- **PM2 Support**: Production-ready PM2 configuration
- **SMPP Integration**: SMS services via Libyana and Almadar providers
- **Webhook Support**: Receive transaction status updates from bank/FI systems

## 📋 Prerequisites

- Node.js (v16 or higher)
- Oracle Database access
- Oracle Instant Client (for oracledb)

### Oracle Instant Client Installation

#### Windows:
1. Download Oracle Instant Client from [Oracle website](https://www.oracle.com/database/technologies/instant-client/winx64-downloads.html)
2. Extract to a directory (e.g., `C:\oracle\instantclient_21_8`)
3. Add the directory to your PATH environment variable
4. Set `OCI_LIB_DIR` environment variable to the Instant Client directory

#### Linux:
```bash
# Ubuntu/Debian
sudo apt-get install libaio1

# Download and install Oracle Instant Client
wget https://download.oracle.com/otn_software/linux/instantclient/218000/instantclient-basic-linux.x64-21.8.0.0.0dbru.zip
unzip instantclient-basic-linux.x64-21.8.0.0.0dbru.zip
sudo mv instantclient_21_8 /opt/oracle/
echo 'export LD_LIBRARY_PATH=/opt/oracle/instantclient_21_8:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc
```

## 📦 Installation

1. **Clone or download the project**
2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create logs directory**:
   ```bash
   mkdir logs
   ```

4. **Install PM2 globally** (for production deployment):
   ```bash
   npm install -g pm2
   ```

## 🔧 Configuration

### Database Configuration

The Oracle database configuration is in `config/database.js`:

```
```

### Environment Variables

Create a `.env` file (optional):

```env
NODE_ENV=production
PORT=3000
WEBHOOK_BEARER_TOKEN=your-secure-bearer-token-here
```

## 🚀 Running the Application

### Development Mode

```bash
# Using npm
npm run dev

# Using node directly
node server.js
```

### Production Mode

```bash
# Using npm
npm start

# Using PM2
npm run pm2:start
```

## 📡 API Endpoints

### POST /api/inquired

Inquire about a transaction status.

**Request Body:**
```json
{
  "HeaderSwitchModel": {
    "TargetSystemUserID": "SWITCHUSER"
  },
  "LookUpData": {
    "Details": {
      "RRN": "456107036921",
      "STAN": "543028",
      "TXNAMT": "20000",
      "TERMID": "888777",
      "SETLDATE": "19-03-2025"
    }
  }
}
```

**Response Examples:**

✅ Transaction Found (MSG_TYPE = 420):
```json
{
  "Result": [
    {
      "Code": "R2",
      "Message": "Transaction is already Reversed",
      "TransactionType": "DEBIT"
    }
  ]
}
```

✅ Transaction Found (MSG_TYPE = 1200, WORK_PROGRESS = S):
```json
{
  "Result": [
    {
      "Code": "R3",
      "Message": "Transaction is already Processed",
      "TransactionType": "DEBIT"
    }
  ]
}
```

❌ Transaction Failed (MSG_TYPE = 1200, WORK_PROGRESS = F):
```json
{
  "Result": [
    {
      "Code": "R1",
      "Message": "Transaction Failed",
      "TransactionType": "DEBIT"
    }
  ]
}
```

❌ Transaction Not Found:
```json
{
  "Result": [
    {
      "Code": "R4",
      "Message": "Transaction is not Found"
    }
  ]
}
```

### GET /health

Health check endpoint.

## 🔍 Validation Rules

| Field | Validation |
|-------|------------|
| RRN | 12 digits, no special characters |
| STAN | 6 digits, no special characters |
| TXNAMT | Numeric, positive value |
| TERMID | 6-8 digits, no special characters |
| SETLDATE | DD-MM-YYYY format |
| TargetSystemUserID | Required, non-empty string |

## ⚠️ Error Codes

| Code | Message |
|------|---------|
| E1 | Please check user id |
| E2 | Please check RRN must be 12 digit and not include any characters |
| E3 | Please check STAN must be 6 digit and not include any characters |
| E4 | Please check TXNAMT |
| E5 | Please check termid must be not less than 6 and not more then 8 digit and not include any special characters |
| E6 | Please check txn date |
| E7 | Date format must be DD-MM-YYYY |
| E8 | ORA-12543: TNS:destination host unreachable |
| E9 | Core bank system error |

## 🚀 PM2 Deployment

### Starting with PM2

```bash
# Start the application
npm run pm2:start

# Or directly with PM2
pm2 start ecosystem.config.js
```

### PM2 Commands

```bash
# Check status
npm run pm2:status
# or
pm2 status

# View logs
npm run pm2:logs
# or
pm2 logs bank-inquired-api

# Restart application
npm run pm2:restart
# or
pm2 restart bank-inquired-api

# Stop application
npm run pm2:stop
# or
pm2 stop bank-inquired-api

# Delete application from PM2
npm run pm2:delete
# or
pm2 delete bank-inquired-api
```

### PM2 Monitoring

```bash
# Monitor processes
pm2 monit

# Monitor with web interface
pm2 web
```

## 📊 Testing

### Testing Transaction Inquiry API

#### Using curl

```bash
curl -X POST http://localhost:3000/api/inquired \
  -H "Content-Type: application/json" \
  -d '{
    "HeaderSwitchModel": {
      "TargetSystemUserID": "SWITCHUSER"
    },
    "LookUpData": {
      "Details": {
        "RRN": "456107036921",
        "STAN": "543028",
        "TXNAMT": "20000",
        "TERMID": "888777",
        "SETLDATE": "19-03-2025"
      }
    }
  }'
```

### Testing Webhook Endpoint

#### Using curl

```bash
# Test successful transaction webhook
curl --location 'http://localhost:3000/webhooks' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer your-secure-bearer-token-here' \
--data '{
  "webhook": "transaction_status_update",
  "data": {
    "payment_reference": "REF123456789",
    "status": "completed",
    "status_code": "04",
    "amount": {
      "amount": "50000",
      "currency": "LYD"
    }
  }
}'
```

#### Using the Webhook Test Utility

```bash
# Generate test scenarios and cURL commands
node utils/webhookTest.js
```

### Using Postman

1. Set method to `POST`
2. URL: `http://localhost:3000/bank-url/api/inquired`
3. Headers: `Content-Type: application/json`
4. Body (raw JSON): Use the example request body above

## 🔧 Troubleshooting

### Oracle Connection Issues

1. **ORA-12543**: Check if Oracle database is accessible
2. **ORA-12541**: Check if Oracle listener is running
3. **ORA-12154**: Check connection string format

### Common Solutions

1. **Verify Oracle Instant Client installation**
2. **Check environment variables** (PATH, LD_LIBRARY_PATH)
3. **Verify database credentials**
4. **Check network connectivity to database server**

### Logs

- Application logs: `logs/combined.log`
- Output logs: `logs/out.log`
- Error logs: `logs/error.log`

## 📁 Project Structure

```
├── config/
│   ├── database.js          # Oracle database configuration
│   ├── smpp.js             # SMPP provider configuration
│   └── webhook.js          # Webhook configuration
├── routes/
│   ├── inquired.js          # Transaction inquiry API routes
│   ├── sms.js              # SMS service routes
│   └── webhook.js          # Webhook endpoint routes
├── services/
│   ├── transactionService.js # Transaction business logic
│   └── smppService.js       # SMPP SMS service
├── utils/
│   ├── validation.js        # Input validation
│   └── webhookTest.js       # Webhook testing utility
├── logs/                    # Log files (created automatically)
├── ecosystem.config.js      # PM2 configuration
├── package.json            # Dependencies and scripts
├── server.js               # Main application file
└── README.md              # This file
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## Webhook Integration

### Overview
The system supports webhook notifications for real-time transaction updates from bank/FI systems.

### Supported Webhook Types

#### 1. Transaction Status Update (`transaction_status_update`)
Notifies about the status changes of outgoing transactions (completed, failed, declined, pending, cancelled).

**Payload Example:**
```json
{
  "webhook": "transaction_status_update",
  "data": {
    "payment_reference": "REF123456789",
    "status": "completed",
    "status_code": "04",
    "amount": {
      "amount": "50000",
      "currency": "LYD"
    }
  }
}
```

#### 2. Transaction Credit Notice (`transaction_credit_notice`)
Notifies about incoming transfers (حوالة واردة) to creditor accounts.

**Payload Example:**
```json
{
  "webhook": "transaction_credit_notice",
  "data": {
    "amount": {
      "amount": "50000",
      "currency": "LYD",
      "fees": "2500"
    },
    "debtor_account": {
      "scheme_name": "IBAN",
      "identification": "LY5800285100012443402016",
      "name": "MOHAMMED ALTALEESI"
    },
    "debtor_bank": {
      "name": "Bank of Debtor",
      "code": "025"
    },
    "creditor_account": {
      "scheme_name": "IBAN",
      "identification": "IT60X0542811101000000123456"
    },
    "creditor_bank": {
      "name": "Bank of Creditor",
      "code": "ICICITBB"
    },
    "numo_credit_notice": {
      "rnn": "RNN12345"
    },
    "payment_reference": "REF12345-6789-IRKAS-48224222"
  }
}
```

### Authentication
- **Bearer Token**: Required in Authorization header
- **HMAC Signature**: Required in Signature header for request integrity

### Configuration
Set these environment variables:
```bash
WEBHOOK_BEARER_TOKEN=your_bearer_token_here
WEBHOOK_HMAC_SECRET=your_hmac_secret_here
```

### Testing

Use the built-in testing utility:

```bash
node utils/webhookTest.js
```

This will generate test payloads and cURL commands for all webhook scenarios.

## 📞 Support

For support and questions, please contact the development team. 