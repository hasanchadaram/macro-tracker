import crypto from 'crypto';

const userId = '6254c0d8-110c-4597-8241-b83f1ed164fe'; // normal user (no custom API key)
const jwtSecret = 'super-secret-jwt-token-with-at-least-32-characters-long';

function createJwt(uid) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: uid,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const token = createJwt(userId);
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

async function testResolveFood() {
  console.log('\n--- TEST: Calling resolve-food until rate limit ---');
  for (let i = 1; i <= 4; i++) {
    console.log(`\nRequest #${i}...`);
    const res = await fetch('http://127.0.0.1:54321/functions/v1/resolve-food', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: `1 boiled egg test ${i}` })
    });

    const data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log('Retry-After:', res.headers.get('retry-after'));
    console.log('Response:', JSON.stringify(data, null, 2));

    if (res.status === 429) {
      console.log('✅ Correctly received 429 rate limit!');
      break;
    }
  }
}

testResolveFood().catch(console.error);
