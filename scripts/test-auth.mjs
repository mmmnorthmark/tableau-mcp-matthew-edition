#!/usr/bin/env node
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const clientId = process.env.CONNECTED_APP_CLIENT_ID;
const secretId = process.env.CONNECTED_APP_SECRET_ID;
const secretValue = process.env.CONNECTED_APP_SECRET_VALUE;
const sub = process.env.JWT_SUB_CLAIM;

console.log('🔍 Testing Connected Apps JWT Generation\n');

if (!clientId || !secretId || !secretValue || !sub) {
  console.error('❌ Missing environment variables:');
  if (!clientId) console.error('  - CONNECTED_APP_CLIENT_ID');
  if (!secretId) console.error('  - CONNECTED_APP_SECRET_ID');
  if (!secretValue) console.error('  - CONNECTED_APP_SECRET_VALUE');
  if (!sub) console.error('  - JWT_SUB_CLAIM');
  process.exit(1);
}

console.log('✅ Environment variables loaded:');
console.log(`   CLIENT_ID: ${clientId}`);
console.log(`   SECRET_ID: ${secretId}`);
console.log(`   SUB (user): ${sub}`);
console.log('');

const now = Math.floor(Date.now() / 1000);
const exp = now + 300;

const payload = {
  iss: clientId,
  exp,
  jti: `${Date.now()}-test`,
  aud: 'tableau',
  sub,
  scp: ['tableau:views:embed', 'tableau:metrics:embed', 'tableau:insight_definitions_metrics:read'],
};

const header = {
  alg: 'HS256',
  typ: 'JWT',
  kid: secretId,
  iss: clientId,
};

try {
  const token = jwt.sign(payload, secretValue, {
    algorithm: 'HS256',
    header,
  });

  console.log('✅ JWT Generated Successfully!\n');
  console.log('📋 Token Details:');
  console.log(`   Issued: ${new Date(now * 1000).toISOString()}`);
  console.log(`   Expires: ${new Date(exp * 1000).toISOString()}`);
  console.log(`   User: ${sub}`);
  console.log(`   Scopes: ${payload.scp.join(', ')}`);
  console.log('');

  console.log('🔑 Token (first 50 chars):');
  console.log(`   ${token.substring(0, 50)}...`);
  console.log('');

  console.log('📝 Decoded Token:');
  const decoded = jwt.decode(token, { complete: true });
  console.log(JSON.stringify(decoded, null, 2));
  console.log('');

  console.log('✅ Token appears valid!');
  console.log('');
  console.log('🔍 Next Steps to Debug 403:');
  console.log('   1. Verify user exists in Tableau: ' + sub);
  console.log('   2. Check user has Pulse permissions');
  console.log('   3. Verify Connected App is enabled');
  console.log('   4. Check Connected App domain allowlist includes request origin');
  console.log('   5. Look at server logs for detailed REST API error');

} catch (error) {
  console.error('❌ Failed to generate JWT:', error.message);
  process.exit(1);
}
