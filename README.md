# Bank Inquired API

A Node.js Express API for inquiring bank transactions with Oracle database integration.

## 🚀 Features

- **Oracle Database Integration**: Connects to Oracle database for transaction lookup
- **Input Validation**: Comprehensive validation for all input fields
- **Error Handling**: Proper error handling with specific error codes
- **Security**: CORS, Helmet, and other security middleware
- **Logging**: Detailed request/response logging
- **PM2 Support**: Production-ready PM2 configuration

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

```javascript
const dbConfig = {
  user: 'cbl_user',
  password: 'Tabcbl_2024',
  connectString: '10.100.30.1/tabpubs1',
  // ... other settings
};
```

### Environment Variables

Create a `.env` file (optional):

```env
NODE_ENV=production
PORT=3000
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

✅ Transaction Found (MSG_TYPE = 421):
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

### Using curl

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
│   └── database.js          # Oracle database configuration
├── routes/
│   └── inquired.js          # API route handlers
├── services/
│   └── transactionService.js # Business logic
├── utils/
│   └── validation.js        # Input validation
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

## 📞 Support

For support and questions, please contact the development team. 