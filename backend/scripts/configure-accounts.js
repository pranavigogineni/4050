const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const file = path.join(__dirname, '..', '.env');
let contents = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : fs.readFileSync(`${file}.example`, 'utf8');
const config = dotenv.parse(contents);
if (config.DATA_ENCRYPTION_KEY && !/^[a-f0-9]{64}$/i.test(config.DATA_ENCRYPTION_KEY)) {
  throw new Error('The existing DATA_ENCRYPTION_KEY is invalid. Review it manually; it has not been replaced.');
}
if (!config.DATA_ENCRYPTION_KEY) {
  contents = contents.replace(/^DATA_ENCRYPTION_KEY=.*$/gm, '');
  contents += `\nDATA_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('hex')}\n`;
}
if (!config.APP_URL) contents += '\nAPP_URL=http://localhost:5001\n';
if (!config.MAIL_MODE) contents += '\nMAIL_MODE=smtp\n';
fs.writeFileSync(file, contents, { mode: 0o600 });
fs.chmodSync(file, 0o600);
console.log('Account encryption is configured in backend/.env. Keep the key private and backed up. Configure SMTP there to deliver emails.');
