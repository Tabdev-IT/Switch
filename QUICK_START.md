# 🚀 Quick Start Guide

## Prerequisites

1. **Node.js** (v16 or higher)
2. **Oracle Instant Client** (for database connectivity)
3. **Oracle Database Access** (credentials provided)

## Installation

### Windows
```bash
# Run the installation script
install.bat

# Or manually:
npm install
mkdir logs
```

### Linux/Mac
```bash
# Make script executable and run
chmod +x install.sh
./install.sh

# Or manually:
npm install
mkdir logs
```

## Start the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### With PM2 (Production)
```bash
# Install PM2 globally first
npm install -g pm2

# Start with PM2
npm run pm2:start
```

## Test the API

### 1. Health Check
```bash
curl http://localhost:3000/health
```

### 2. Test Transaction Lookup
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

### 3. Run Automated Tests
```bash
npm test
```

## PM2 Commands

```bash
# Check status
npm run pm2:status

# View logs
npm run pm2:logs

# Restart
npm run pm2:restart

# Stop
npm run pm2:stop
```

## Troubleshooting

### Oracle Connection Issues
1. Verify Oracle Instant Client is installed
2. Check environment variables (PATH, LD_LIBRARY_PATH)
3. Verify database credentials in `config/database.js`
4. Test network connectivity to database server

### Common Errors
- **ORA-12543**: Database server unreachable
- **ORA-12541**: Oracle listener not running
- **ORA-12154**: Invalid connection string

## API Endpoints

- **Health Check**: `GET /health`
- **Transaction Lookup**: `POST /api/inquired`

## Next Steps

1. Review the full `README.md` for detailed documentation
2. Configure your Oracle database connection
3. Test with your actual transaction data
4. Deploy to production using PM2

## Support

For issues or questions, check the logs in the `logs/` directory or contact the development team. 