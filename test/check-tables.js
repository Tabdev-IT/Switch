const oracledb = require('oracledb');
require('dotenv').config();

const dbConfig = {
    user: process.env.ORACLE_USER || 'cbl_user',
    password: process.env.ORACLE_PASSWORD || 'Tabcbl_2024',
    connectString: process.env.ORACLE_CONNECT_STRING || `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=10.100.30.1)(PORT=1521))(CONNECT_DATA=(SERVER=DEDICATED)(SID=tabpubs1)))`
};

async function testTable() {
    let connection;
    try {
        console.log('🔗 Connecting with:', {
            user: dbConfig.user,
            connectString: dbConfig.connectString
        });

        connection = await oracledb.getConnection(dbConfig);
        console.log('✅ Connected!');

        const tables = ['FLXCUBP.SWTB_TXN_LOG', 'FLXCUBP.SMS_TRAN_TABLE', 'FLXCUBP.STTM_CUSTOMER'];

        for (const table of tables) {
            try {
                const result = await connection.execute(`SELECT COUNT(*) as CNT FROM ${table} WHERE ROWNUM <= 1`);
                console.log(`✅ Table ${table} exists. Count: ${result.rows[0].CNT}`);
            } catch (e) {
                console.log(`❌ Table ${table} NOT found or error: ${e.message}`);
            }
        }

    } catch (err) {
        console.error('❌ Connection failed:', err.message);
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

testTable();
