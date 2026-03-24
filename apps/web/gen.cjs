const webpush = require("web-push");
const fs = require("fs");

const keys = webpush.generateVAPIDKeys();
const lines = `\n# Web Push Notifications\nVAPID_PUBLIC_KEY="${keys.publicKey}"\nVAPID_PRIVATE_KEY="${keys.privateKey}"\nVAPID_EMAIL="mailto:admin@vibetech.com"\n`;

fs.appendFileSync(".env.local", lines);
fs.appendFileSync(".env", lines);

console.log("=== VAPID KEYS GENERATED ===");
console.log(`VAPID_PUBLIC_KEY="${keys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${keys.privateKey}"`);
console.log(`VAPID_EMAIL="mailto:admin@vibetech.com"`);
console.log("============================");
