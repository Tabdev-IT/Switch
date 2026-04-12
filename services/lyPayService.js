const axios = require('axios');
const https = require('https');

// Ly Pay (hardcoded as requested — full list URL is BASE_URL + /api/v1/...)
const BASE_URL = 'https://10.106.0.30';
const BEARER_TOKEN = 'XlL2MtQbEJaBm08R56gOmzdp9etfyIxF0SPFZKF508eb021c';

// Internal HTTPS: corporate/self-signed cert — Node default CA store fails verification.
// This matches “it works in Postman” behaviour for this internal host.
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
console.warn('⚠️ Ly Pay TLS verification is DISABLED for https://10.106.0.30 (internal CA).');

function lyPayAxiosConfig(extra = {}) {
	const base = { timeout: extra.timeout ?? 15000, validateStatus: () => true };
	return { ...base, httpsAgent, ...extra };
}

function normalizeList(data) {
	if (Array.isArray(data)) return data;
	if (data && Array.isArray(data.data)) return data.data;
	if (data && Array.isArray(data.items)) return data.items;
	if (data && Array.isArray(data.content)) return data.content;
	if (data && Array.isArray(data.results)) return data.results;
	if (data && Array.isArray(data.records)) return data.records;
	if (data && data.data && Array.isArray(data.data.items)) return data.data.items;
	if (data && data.data && Array.isArray(data.data.data)) return data.data.data;
	return [];
}

/** Libya calendar date YYYY-MM-DD (Africa/Tripoli) */
function getLibyaDateString(date = new Date()) {
	try {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Africa/Tripoli',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).formatToParts(date);
		const y = parts.find(p => p.type === 'year')?.value;
		const m = parts.find(p => p.type === 'month')?.value;
		const d = parts.find(p => p.type === 'day')?.value;
		if (y && m && d) return `${y}-${m}-${d}`;
	} catch (_) {
		// fall through
	}
	const libyaTime = new Date(date.getTime() + 2 * 60 * 60 * 1000);
	return libyaTime.toISOString().split('T')[0];
}

function addDaysToYyyyMmDd(yyyyMmDd, deltaDays) {
	const [y, m, d] = yyyyMmDd.split('-').map(Number);
	const utc = Date.UTC(y, m - 1, d + deltaDays);
	return new Date(utc).toISOString().split('T')[0];
}

async function getDebitedTransfersForDate(libyaDate) {
	const url = `${BASE_URL}/api/v1/payments/debited-funds-transfers`;

	console.log('📅 LY Pay API call with Libya date filter:', libyaDate);

	let response;
	try {
		response = await axios.get(
			url,
			lyPayAxiosConfig({
				params: {
					'filter[date]': libyaDate
				},
				headers: {
					Authorization: `Bearer ${BEARER_TOKEN}`,
					Accept: 'application/json'
				},
				timeout: 15000
			})
		);
	} catch (e) {
		console.log('❌ Ly Pay network error (dated):', e.message);
		return null;
	}

	if (response.status < 200 || response.status >= 300) {
		const bodyPreview =
			typeof response.data === 'string'
				? response.data.slice(0, 200)
				: JSON.stringify(response.data || {}).slice(0, 200);
		console.log(`❌ Ly Pay HTTP ${response.status} (dated ${libyaDate}) preview:`, bodyPreview);
		return null;
	}

	const raw = response.data;
	if (typeof raw === 'string') {
		try {
			return JSON.parse(raw);
		} catch (_) {
			console.log('⚠️ Ly Pay returned non-JSON string body (first 200 chars):', raw.slice(0, 200));
			return null;
		}
	}
	return raw;
}

/** Last-resort: no date filter (may be heavier). */
async function getDebitedTransfersUnfiltered() {
	const url = `${BASE_URL}/api/v1/payments/debited-funds-transfers`;
	console.log('📅 LY Pay API call without date filter (fallback)');

	let response;
	try {
		response = await axios.get(
			url,
			lyPayAxiosConfig({
				headers: {
					Authorization: `Bearer ${BEARER_TOKEN}`,
					Accept: 'application/json'
				},
				timeout: 20000
			})
		);
	} catch (e) {
		console.log('❌ Ly Pay network error (unfiltered):', e.message);
		return null;
	}

	if (response.status < 200 || response.status >= 300) {
		const bodyPreview =
			typeof response.data === 'string'
				? response.data.slice(0, 200)
				: JSON.stringify(response.data || {}).slice(0, 200);
		console.log(`❌ Ly Pay HTTP ${response.status} (unfiltered) preview:`, bodyPreview);
		return null;
	}

	const raw = response.data;
	if (typeof raw === 'string') {
		try {
			return JSON.parse(raw);
		} catch (_) {
			console.log('⚠️ Ly Pay returned non-JSON string body (first 200 chars):', raw.slice(0, 200));
			return null;
		}
	}
	return raw;
}

function normRef(v) {
	if (v == null) return null;
	if (typeof v === 'string') return v.trim().toLowerCase();
	if (typeof v === 'number') return String(v).trim().toLowerCase();
	// Ly Pay sometimes nests primitives, e.g. { paymentReference: { value: "..." } }
	if (typeof v === 'object') {
		const nested =
			v.value ??
			v.id ??
			v.uuid ??
			v.reference ??
			v.paymentReference ??
			v.payment_reference;
		if (nested != null && nested !== v) return normRef(nested);
	}
	return String(v).trim().toLowerCase();
}

function collectRefCandidates(obj, out = [], depth = 0) {
	if (obj == null || depth > 6) return out;
	if (typeof obj !== 'object') return out;

	for (const [k, v] of Object.entries(obj)) {
		const kl = k.toLowerCase();
		if (
			kl.includes('payment') && kl.includes('ref')
		) {
			out.push(v);
		}
		if (kl === 'reference' || kl === 'id' || kl === 'uuid') {
			out.push(v);
		}
	}
	return out;
}

function matchesPaymentReference(item, paymentReference) {
	const want = normRef(paymentReference);
	if (!want) return false;

	const candidates = [];
	collectRefCandidates(item, candidates);

	candidates.push(
		item?.payment_reference,
		item?.paymentReference,
		item?.reference,
		item?.originalPaymentReference,
		item?.original_payment_reference,
		item?.paymentRef,
		item?.id,
		item?.uuid,
		item?.payment_id,
		item?.paymentId
	);

	return candidates.map(normRef).some(c => c && c === want);
}

function deepFindPaymentRecord(root, paymentReference, seen = new Set(), depth = 0) {
	if (root == null || depth > 60) return null;
	if (typeof root !== 'object') return null;
	if (seen.has(root)) return null;
	seen.add(root);

	if (matchesPaymentReference(root, paymentReference)) return root;

	if (Array.isArray(root)) {
		for (const el of root) {
			const hit = deepFindPaymentRecord(el, paymentReference, seen, depth + 1);
			if (hit) return hit;
		}
		return null;
	}

	for (const k of Object.keys(root)) {
		const hit = deepFindPaymentRecord(root[k], paymentReference, seen, depth + 1);
		if (hit) return hit;
	}
	return null;
}

async function findDebitedByPaymentReference(paymentReference) {
	try {
		const today = getLibyaDateString();
		const datesToTry = [
			today,
			addDaysToYyyyMmDd(today, -1),
			addDaysToYyyyMmDd(today, 1)
		];

		for (const libyaDate of datesToTry) {
			const raw = await getDebitedTransfersForDate(libyaDate);
			if (!raw) continue;
			const list = normalizeList(raw);
			if (list.length) {
				console.log(`🔎 Ly Pay dated lookup (${libyaDate}): ${list.length} row(s) in normalized list`);
			} else {
				const keys = raw && typeof raw === 'object' ? Object.keys(raw).slice(0, 20) : [];
				console.log(`🔎 Ly Pay dated lookup (${libyaDate}): normalized list empty; top-level keys:`, keys);
			}
			let found = list.find((item) => matchesPaymentReference(item, paymentReference));
			if (found) return found;
			found = deepFindPaymentRecord(raw, paymentReference);
			if (found) return found;
		}

		const rawAll = await getDebitedTransfersUnfiltered();
		if (!rawAll) return null;
		const listAll = normalizeList(rawAll);
		if (listAll.length) {
			console.log(`🔎 Ly Pay unfiltered lookup: ${listAll.length} row(s) in normalized list`);
		} else {
			const keys = rawAll && typeof rawAll === 'object' ? Object.keys(rawAll).slice(0, 20) : [];
			console.log('🔎 Ly Pay unfiltered lookup: normalized list empty; top-level keys:', keys);
		}
		let foundAll = listAll.find((item) => matchesPaymentReference(item, paymentReference));
		if (foundAll) return foundAll;
		foundAll = deepFindPaymentRecord(rawAll, paymentReference);
		return foundAll || null;
	} catch (error) {
		throw new Error(`LY Pay API error: ${error.message}`);
	}
}

/** @deprecated use getDebitedTransfersForDate(getLibyaDateString()) */
async function getDebitedTransfers() {
	return getDebitedTransfersForDate(getLibyaDateString());
}

module.exports = {
	getDebitedTransfers,
	getDebitedTransfersForDate,
	getDebitedTransfersUnfiltered,
	findDebitedByPaymentReference
};
