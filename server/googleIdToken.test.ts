import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyGoogleIdToken } from './googleIdToken';

const clientId = 'test-web-client.apps.googleusercontent.com';

async function fixture() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'test', alg: 'RS256' }] });
  const sign = (claims: Record<string, unknown> = {}, audience = clientId) =>
    new SignJWT({ email: 'person@gmail.com', email_verified: true, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer('https://accounts.google.com')
      .setAudience(audience)
      .setSubject('google-subject-123')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  return { keys, sign };
}

test('native Google ID token requires Google signature, audience and verified email', async () => {
  const { keys, sign } = await fixture();
  assert.deepEqual(await verifyGoogleIdToken(await sign(), clientId, keys), {
    subject: 'google-subject-123', email: 'person@gmail.com', allowEmailLink: true,
  });
  await assert.rejects(verifyGoogleIdToken(await sign({}, 'other.apps.googleusercontent.com'), clientId, keys));
  await assert.rejects(verifyGoogleIdToken(await sign({ email_verified: false }), clientId, keys));
  await assert.rejects(verifyGoogleIdToken(await sign({ email: 'invalid' }), clientId, keys));
  await assert.rejects(verifyGoogleIdToken('not-a-token', clientId, keys));

  const another = await fixture();
  await assert.rejects(verifyGoogleIdToken(await another.sign(), clientId, keys));
});

test('third-party Google email cannot silently link an existing finance account', async () => {
  const { keys, sign } = await fixture();
  const external = await verifyGoogleIdToken(await sign({ email: 'person@example.org' }), clientId, keys);
  assert.equal(external.allowEmailLink, false);
  const workspace = await verifyGoogleIdToken(
    await sign({ email: 'person@example.org', hd: 'example.org' }), clientId, keys,
  );
  assert.equal(workspace.allowEmailLink, true);
});
