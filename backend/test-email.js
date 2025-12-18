require('dotenv').config();
const nodemailer = require('nodemailer');

(async function() {
    console.log("\n🔍 --- DIAGNOSTIC EMAIL TEST ---");
    
    // 1. READ FROM ENV
    const envUser = process.env.EMAIL_USER;
    const envPass = process.env.EMAIL_PASS;
    const envHost = process.env.EMAIL_HOST;
    const envPort = process.env.EMAIL_PORT;
    const envSender = process.env.EMAIL_SENDER || 'biradarprajwal999@gmail.com'; // Default to verified email

    console.log(`\n1. .env Configuration:`);
    console.log(`   Host: ${envHost}`);
    console.log(`   Port: ${envPort || '2525 (Default)'}`);
    console.log(`   User: ${envUser}`);
    console.log(`   Sender: ${envSender}`);
    
    if (!envPass) {
        console.error("❌ ERROR: EMAIL_PASS is missing in .env file!");
        return;
    }

    // Mask password for display
    const maskedPass = envPass.substring(0, 5) + '...' + envPass.substring(envPass.length - 5);
    console.log(`   Pass: ${maskedPass}`);
    console.log(`   Pass Length: ${envPass.length}`);

    // Check for common issues
    if (!envPass.startsWith('xsmtpsib-')) {
        console.warn("\n⚠️  WARNING: Your key does NOT start with 'xsmtpsib-'.");
        console.warn("   You might be using an API Key (xkeysib-) instead of an SMTP Key.");
        console.warn("   Please generate a new key in Brevo > SMTP & API > SMTP Tab.");
    }

    if (envPass.trim().length !== envPass.length) {
        console.warn("\n⚠️  WARNING: Your password has hidden spaces at the start or end!");
    }

    const transporter = nodemailer.createTransport({
        host: envHost || 'smtp-relay.brevo.com',
        port: Number(envPort) || 2525,
        secure: false,
        auth: {
            user: envUser ? envUser.trim() : '',
            pass: envPass ? envPass.trim() : '',
        },
        debug: true
    });

    try {
        console.log("\n2. Connecting to Brevo...");
        await transporter.verify();
        console.log("\n✅ SUCCESS: Credentials are working! You can now run the server.");
    } catch (error) {
        console.error("\n❌ FAILURE: " + error.message);
        if (error.responseCode === 535) {
            console.log("\n👉 DIAGNOSIS: Authentication Failed.");
            console.log("   1. Login to Brevo.");
            console.log("   2. Go to 'SMTP & API' -> 'SMTP' tab.");
            console.log("   3. Check 'SMTP Login'. Does it match '" + envUser + "'?");
            console.log("   4. If not, update EMAIL_USER in .env.");
            console.log("   5. If it matches, generate a NEW SMTP Key and update EMAIL_PASS.");
        }
    }
})();