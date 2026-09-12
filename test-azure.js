require('dotenv').config();

async function testAzure() {
  const baseEndpoint = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/openai\/v1\/?$/, '');
  const url = `${baseEndpoint}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-10-21`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.AZURE_OPENAI_KEY
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Reply with exactly: connection works' }],
      max_completion_tokens: 20
    })
  });

  console.log('Status:', res.status);
  console.log(await res.text());
}

testAzure();
