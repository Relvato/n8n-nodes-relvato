import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Relvato signs every delivery (packages/core/src/webhook.ts, signWebhook / verifyWebhookSignature):
 *
 *   Relvato-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
 *
 * keyed with the subscription's signing secret (`whsec_…`, returned once by POST /api/v1/hooks). A receiver
 * recomputes it over the raw body, compares in constant time, and rejects timestamps more than 5 minutes off so a
 * captured request can't be replayed later. Pure: covered by the tests.
 */
export const SIGNATURE_HEADER = 'relvato-signature';
export const SIGNATURE_TOLERANCE_SEC = 300;

/** The header value Relvato sends for `body` at unix time `t` (used by the tests). */
export function signPayload(secret: string, body: string | Buffer, t: number): string {
	const mac = createHmac('sha256', secret).update(`${t}.`).update(body).digest('hex');
	return `t=${t},v1=${mac}`;
}

export function verifySignature(
	secret: string,
	rawBody: string | Buffer,
	header: string | string[] | undefined,
	nowSec: number = Math.floor(Date.now() / 1000),
	toleranceSec: number = SIGNATURE_TOLERANCE_SEC,
): boolean {
	const value = Array.isArray(header) ? header[0] : header;
	if (!secret || typeof value !== 'string' || !value) return false;
	const t = Number(/(?:^|,)\s*t=(\d+)/.exec(value)?.[1]);
	const v1 = /(?:^|,)\s*v1=([0-9a-f]{64})(?:,|$)/.exec(value)?.[1];
	if (!t || !v1 || Math.abs(nowSec - t) > toleranceSec) return false;
	const want = createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
	const got = Buffer.from(v1, 'hex');
	return got.length === want.length && timingSafeEqual(got, want);
}
