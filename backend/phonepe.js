const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const router = express.Router();

// PhonePe Configuration
// MODE 1: SANDBOX (Test Mode - Default)
const MERCHANT_ID = "PGTESTPAYUAT";
const SALT_KEY = "099eb0cd-02cf-4e2a-8aca-3e6c6aff0399";
const PHONEPE_HOST_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox";

// MODE 2: PRODUCTION (Real Money - Required for App Redirection)
// const MERCHANT_ID = "ATMOSTAP";
// const SALT_KEY = "PASTE_YOUR_PRODUCTION_SALT_KEY_HERE";
// const PHONEPE_HOST_URL = "https://api.phonepe.com/apis/hermes";

const SALT_INDEX = 1;

// Your frontend URL (where user returns after payment)
const APP_BE_URL = process.env.BASE_URL || "http://localhost:5003";
const APP_FE_URL = `${APP_BE_URL}/scan-pay.html`; 

router.post('/initiate', async (req, res) => {
    try {
        const { amount, orderId, mobileNumber, returnUrl } = req.body;
        
        // PhonePe expects amount in paise (multiply by 100)
        const amountInPaise = Math.round(Number(amount) * 100);
        const merchantTransactionId = (orderId || `TXN_${Date.now()}`).substring(0, 34); // Ensure length limit
        const finalReturnUrl = returnUrl || APP_FE_URL;
        const merchantUserId = "MUSER" + Date.now(); // Alphanumeric only preferred

        const payload = {
            merchantId: MERCHANT_ID,
            merchantTransactionId: merchantTransactionId,
            merchantUserId: merchantUserId,
            amount: amountInPaise,
            redirectUrl: `${APP_BE_URL}/api/payment/callback?id=${merchantTransactionId}&returnTo=${encodeURIComponent(finalReturnUrl)}`,
            redirectMode: "POST",
            callbackUrl: `${APP_BE_URL}/api/payment/callback?id=${merchantTransactionId}&returnTo=${encodeURIComponent(finalReturnUrl)}`,
            mobileNumber: mobileNumber || "9999999999",
            paymentInstrument: {
                type: "PAY_PAGE"
            }
        };

        const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
        const stringToSign = base64Payload + "/pg/v1/pay" + SALT_KEY;
        const sha256 = crypto.createHash('sha256').update(stringToSign).digest('hex');
        const checksum = sha256 + "###" + SALT_INDEX;

        // Debug Log (Optional: Remove in production)
        console.log(`Initiating Payment: MID=${MERCHANT_ID}, TXN=${merchantTransactionId}, Amt=${amountInPaise}`);

        const options = {
            method: 'post',
            url: `${PHONEPE_HOST_URL}/pg/v1/pay`,
            headers: {
                'Content-Type': 'application/json',
                'X-VERIFY': checksum,
                'accept': 'application/json'
            },
            data: {
                request: base64Payload
            }
        };

        const response = await axios(options);
        
        if (response.data.success) {
            res.json({ success: true, url: response.data.data.instrumentResponse.redirectInfo.url });
        } else {
            res.status(400).json({ success: false, message: "Payment initiation failed" });
        }

    } catch (error) {
        console.error("PhonePe API Error Details:", error.message);
        const msg = (error.response && error.response.data && error.response.data.message) 
            ? error.response.data.message 
            : "Payment initiation failed. Check server logs.";
        res.status(500).json({ success: false, message: msg });
    }
});

router.post('/callback', (req, res) => {
    try {
        const returnTo = req.query.returnTo || APP_FE_URL;
        const base64Response = req.body.response;
        const decodedResponse = JSON.parse(Buffer.from(base64Response, 'base64').toString('utf8'));
        const status = decodedResponse.code === 'PAYMENT_SUCCESS' ? 'SUCCESS' : 'FAILED';
        const txId = decodedResponse.data.merchantTransactionId;
        return res.redirect(`${returnTo}?status=${status}&txId=${txId}`);
    } catch (error) {
        const returnTo = req.query.returnTo || APP_FE_URL;
        return res.redirect(`${returnTo}?status=ERROR`);
    }
});

module.exports = router;