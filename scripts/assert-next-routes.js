// Assert Next.js "Route (app)" table contains "/" and "/v/[code]"
const fs = require('fs');
const log = fs.readFileSync(process.argv[2] || '.nextBuildLog.txt', 'utf8');

// Look for the route table section and check for our required routes
const hasRouteTable = /Route \(app\)/i.test(log);
const hasRoot = /[┌├└─]\s+\S*\s+\/\s+/m.test(log);
const hasCode = /\/v\/\[code\]/i.test(log);

if (!hasRouteTable) {
  console.error('ERROR: Next.js route table not found in build output.');
  process.exit(1);
}

if (!hasRoot || !hasCode) {
  console.error('ERROR: Next.js route table missing "/" or "/v/[code]".');
  process.exit(1);
}

console.log('OK: Next.js route table contains "/" and "/v/[code]".');