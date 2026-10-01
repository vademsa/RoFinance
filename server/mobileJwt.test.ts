import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { SignJWT, decodeProtectedHeader } from 'jose';
import { issueMobileAccessToken, parseMobileJwtConfig, verifyMobileAccessJwt } from './mobileJwt';

const key = randomBytes(32);
const config = parseMobileJwtConfig(JSON.stringify({ current: key.toString('base64') }), 'current')!;

test('mobile JWT requires a server-owned 32-byte key and matching kid', () => {
  assert.equal(parseMobileJwtConfig(undefined, undefined), null);
  assert.throws(() => parseMobileJwtConfig(JSON.stringify({ current: 'abc' }), 'current'));
  assert.throws(() => parseMobileJwtConfig(JSON.stringify({ current: key.toString('base64') }), 'missing'));
});

test('mobile JWT accepts only the expected claims and signing key', async () => {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const issued = await issueMobileAccessToken(userId, sessionId, config);
  assert.deepEqual(await verifyMobileAccessJwt(issued.accessToken, config), { userId, sessionId });

  const wrongKey = parseMobileJwtConfig(JSON.stringify({ current: randomBytes(32).toString('base64') }), 'current')!;
  await assert.rejects(verifyMobileAccessJwt(issued.accessToken, wrongKey));

  const wrongAudience = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt', kid: 'current' })
    .setIssuer('rofinance-api')
    .setAudience('another-client')
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key);
  await assert.rejects(verifyMobileAccessJwt(wrongAudience, config));
});

test('mobile JWT rejects expired tokens and wrong token type', async () => {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const expired = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt', kid: 'current' })
    .setIssuer('rofinance-api').setAudience('rofinance-mobile').setSubject(userId)
    .setJti(randomUUID()).setIssuedAt(Math.floor(Date.now() / 1000) - 1800)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 900)
    .sign(key);
  await assert.rejects(verifyMobileAccessJwt(expired, config));

  const wrongType = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'refresh+jwt', kid: 'current' })
    .setIssuer('rofinance-api').setAudience('rofinance-mobile').setSubject(userId)
    .setJti(randomUUID()).setIssuedAt().setExpirationTime('15m')
    .sign(key);
  await assert.rejects(verifyMobileAccessJwt(wrongType, config));
});

test('key rotation verifies old access tokens while signing new ones with the active kid', async () => {
  const nextKey = randomBytes(32);
  const oldConfig = parseMobileJwtConfig(JSON.stringify({ old: key.toString('base64') }), 'old')!;
  const rotated = parseMobileJwtConfig(JSON.stringify({
    old: key.toString('base64'),
    next: nextKey.toString('base64'),
  }), 'next')!;
  const userId = randomUUID();
  const sessionId = randomUUID();
  const oldToken = await issueMobileAccessToken(userId, sessionId, oldConfig);
  assert.deepEqual(await verifyMobileAccessJwt(oldToken.accessToken, rotated), { userId, sessionId });
  const newToken = await issueMobileAccessToken(userId, sessionId, rotated);
  assert.equal(decodeProtectedHeader(newToken.accessToken).kid, 'next');
});
