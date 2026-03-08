const axios = require('axios');

const BASE_URL = process.env.LY_API_BASE_URL || 'http://10.106.0.43:80';
const BEARER_TOKEN = process.env.LY_API_TOKEN || 'OkQ2YPvvIRbj9Zuln129MZ35OyIDjkI9DsqpV5CC049fadf1';

function normalizeList(data) {
	if (Array.isArray(data)) return data;
	if (data && Array.isArray(data.data)) return data.data;
	if (data && Array.isArray(data.items)) return data.items;
	if (data && Array.isArray(data.content)) return data.content;
	return [];
}

// Get Libya's current date in YYYY-MM-DD format
function getLibyaDate() {
	const now = new Date();
	// Libya is UTC+2
	const libyaTime = new Date(now.getTime() + (2 * 60 * 60 * 1000));
	return libyaTime.toISOString().split('T')[0];
}

async function getDebitedTransfers() {
	const libyaDate = getLibyaDate();
	const url = `${BASE_URL}/api/v1/payments/debited-funds-transfers`;
	
	console.log('📅 LY Pay API call with Libya date filter:', libyaDate);
	
	const response = await axios.get(url, {
		params: {
			'filter[date]': libyaDate
		},
		headers: {
			Authorization: `Bearer ${BEARER_TOKEN}`,
			Accept: 'application/json'
		},
		timeout: 10000
	});
	return response.data;
}

function matchesPaymentReference(item, paymentReference) {
	return (
		item?.payment_reference === paymentReference ||
		item?.paymentReference === paymentReference ||
		item?.reference === paymentReference ||
		item?.originalPaymentReference === paymentReference
	);
}

async function findDebitedByPaymentReference(paymentReference) {
	try {
		const raw = await getDebitedTransfers();
		const list = normalizeList(raw);
		const found = list.find((item) => matchesPaymentReference(item, paymentReference));
		return found || null;
	} catch (error) {
		throw new Error(`LY Pay API error: ${error.message}`);
	}
}

module.exports = {
	getDebitedTransfers,
	findDebitedByPaymentReference
};


