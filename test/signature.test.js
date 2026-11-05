const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { verifySignature, signPayload } = require('../dist/nodes/RelvatoTrigger/signature');

const secret = 'whsec_test_secret_0123456789abcdef';
const body = JSON.stringify({
	version: 1,
	id: 'evt_5f2c9a1e7b3d4c8a9e0f1a2b',
	type: 'check.failed',
	site: { id: 's1', name: 'My Shop – café', url: 'https://myshop.example' },
});
const now = 1_762_340_000;

// Relvato's own signer (packages/core/src/webhook.ts signWebhook), written out independently.
const relvatoSign = (s, b, t) => `t=${t},v1=${createHmac('sha256', s).update(`${t}.${b}`).digest('hex')}`;

test('accepts a signature made exactly as Relvato makes it', () => {
	assert.equal(verifySignature(secret, body, relvatoSign(secret, body, now), now), true);
	assert.equal(verifySignature(secret, Buffer.from(body), relvatoSign(secret, body, now), now), true);
	assert.equal(signPayload(secret, body, now), relvatoSign(secret, body, now));
});

test('accepts a timestamp within 5 minutes either way', () => {
	assert.equal(verifySignature(secret, body, relvatoSign(secret, body, now - 299), now), true);
	assert.equal(verifySignature(secret, body, relvatoSign(secret, body, now + 299), now), true);
});

test('rejects a wrong secret', () => {
	assert.equal(verifySignature('whsec_other', body, relvatoSign(secret, body, now), now), false);
});

test('rejects a tampered body', () => {
	const tampered = body.replace('check.failed', 'check.recovered');
	assert.equal(verifySignature(secret, tampered, relvatoSign(secret, body, now), now), false);
});

test('rejects a tampered timestamp (the signature covers it)', () => {
	const header = relvatoSign(secret, body, now).replace(`t=${now}`, `t=${now + 1}`);
	assert.equal(verifySignature(secret, body, header, now), false);
});

test('rejects a replay older than 5 minutes', () => {
	assert.equal(verifySignature(secret, body, relvatoSign(secret, body, now - 301), now), false);
});

test('rejects missing or malformed headers', () => {
	assert.equal(verifySignature(secret, body, undefined, now), false);
	assert.equal(verifySignature(secret, body, '', now), false);
	assert.equal(verifySignature(secret, body, `t=${now}`, now), false);
	assert.equal(verifySignature(secret, body, `t=${now},v1=abc`, now), false);
	assert.equal(verifySignature(secret, body, `t=${now},v1=${'z'.repeat(64)}`, now), false);
	assert.equal(verifySignature('', body, relvatoSign('', body, now), now), false);
});

test('reads the first value when the header arrives as a list', () => {
	assert.equal(verifySignature(secret, body, [relvatoSign(secret, body, now)], now), true);
});
