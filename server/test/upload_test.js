const http = require('http');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'sample.jpg');
const fileBuffer = fs.readFileSync(filePath);

const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
let body = Buffer.concat([
  Buffer.from(`--${boundary}\r\n`),
  Buffer.from('Content-Disposition: form-data; name="image"; filename="sample.jpg"\r\n'),
  Buffer.from('Content-Type: application/octet-stream\r\n\r\n'),
  fileBuffer,
  Buffer.from(`\r\n--${boundary}--\r\n`),
]);

const options = {
  hostname: 'localhost',
  port: 3003,
  path: '/upload',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
  },
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    console.log('Response body:', data);
    // if upload succeeded, try to GET the image metadata
    try {
      const json = JSON.parse(data);
      if (json && json.success && json.id) {
        const getOptions = {
          hostname: 'localhost',
          port: 3003,
          path: `/images/${json.id}`,
          method: 'GET',
        };
        const getReq = http.request(getOptions, (getRes) => {
          let g = '';
          getRes.setEncoding('utf8');
          getRes.on('data', (c) => (g += c));
          getRes.on('end', () => console.log('GET /images response:', g));
        });
        getReq.on('error', (e) => console.error('GET error', e));
        getReq.end();
      }
    } catch (err) {
      console.error('Error parsing upload response:', err);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.write(body);
req.end();
