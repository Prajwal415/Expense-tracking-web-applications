const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const router = express.Router();

// Assuming you have a way to get the base URL of your server
// This is crucial for the callback and redirect URLs.
// Make sure to set APP_URL in your .env file for production.
const APP_BASE_URL = process.env.APP_URL || 'http://localhost:5003';

// --- PhonePe Payment Initiation ---
router.post('/initiate', async (req, res) => {
    try {
        const { orderId, amount, redirectUrl } = req.body;
        const merchantId = process.env.PHONEPE_MERCHANT_ID;
        const saltKey = process.env.PHONEPE_SALT_KEY;
        const saltIndex = process.env.PHONEPE_SALT_INDEX;

        const paymentData = {
            merchantId: merchantId,
            merchantTransactionId: orderId,
            merchantUserId: req.user.id, // Assuming you have user info in req.user from auth middleware
            amount: amount * 100, // Amount in paise
            redirectUrl: redirectUrl,
            redirectMode: "POST",
            callbackUrl: `${APP_BASE_URL}/api/payment/callback`,
            mobileNumber: req.user.phone || "9999999999", // Use user's phone if available
            paymentInstrument: {
                type: "PAY_PAGE"
            }
        };

        const payload = JSON.stringify(paymentData);
        const payloadBase64 = Buffer.from(payload).toString('base64');

        const stringToHash = payloadBase64 + "/pg/v1/pay" + saltKey;
        const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
        const checksum = sha256 + '###' + saltIndex;

        const phonepeResponse = await axios.post(
            'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay',
            { request: payloadBase64 },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-VERIFY': checksum,
                    'accept': 'application/json'
                }
            }
        );

        if (phonepeResponse.data.success) {
            const url = phonepeResponse.data.data.instrumentResponse.redirectInfo.url;
            // You might want to save the transaction to your DB here with a 'PENDING' status
            // e.g., await Transaction.create({ orderId, userId: req.user.id, status: 'PENDING', amount });
            res.json({ success: true, url: url });
        } else {
            console.error("PhonePe API Error:", phonepeResponse.data);
            res.status(500).json({ success: false, message: phonepeResponse.data.message });
        }

    } catch (error) {
        console.error("Initiate Payment Error:", error);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

// --- PhonePe Server-to-Server Callback ---
router.post('/callback', async (req, res) => {
    try {
        const payloadBase64 = req.body.response;
        if (!payloadBase64) {
            return res.status(400).send('Invalid callback: No response found');
        }

        const saltKey = process.env.PHONEPE_SALT_KEY;
        const saltIndex = process.env.PHONEPE_SALT_INDEX;
        const receivedChecksum = req.headers['x-verify'];

        const calculatedChecksum = crypto.createHash('sha256').update(payloadBase64 + saltKey).digest('hex') + '###' + saltIndex;

        if (receivedChecksum !== calculatedChecksum) {
            console.error("Checksum mismatch on callback");
            // IMPORTANT: Flag this transaction for manual verification in your system.
            return res.status(400).send('Checksum mismatch');
        }

        const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
        const { merchantTransactionId, code } = decodedPayload.data;

        if (code === 'PAYMENT_SUCCESS') {
            // IMPORTANT: Update your database here. Mark the transaction as 'SUCCESS'.
            // e.g., await Transaction.updateOne({ orderId: merchantTransactionId }, { status: 'SUCCESS' });
            console.log(`Payment for ${merchantTransactionId} was successful.`);
        } else {
            // Mark the transaction as 'FAILED' in your database.
            // e.g., await Transaction.updateOne({ orderId: merchantTransactionId }, { status: 'FAILED' });
            console.log(`Payment for ${merchantTransactionId} failed with code: ${code}`);
        }

        // Acknowledge receipt to PhonePe
        res.status(200).send('Callback received');

    } catch (error) {
        console.error("Callback Error:", error);
        res.status(500).send('Internal Server Error');
    }
});

// --- Frontend Status Check Endpoint ---
router.get('/status/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const merchantId = process.env.PHONEPE_MERCHANT_ID;
        const saltKey = process.env.PHONEPE_SALT_KEY;
        const saltIndex = process.env.PHONEPE_SALT_INDEX;

        // IMPORTANT: First, check your own database for the status.
        // This prevents unnecessary API calls if the callback has already updated it.
        // const transaction = await Transaction.findOne({ orderId });
        // if (transaction && transaction.status === 'SUCCESS') {
        //     return res.json({ success: true, code: 'PAYMENT_SUCCESS', message: 'Payment successful' });
        // }

        const stringToHash = `/pg/v1/status/${merchantId}/${orderId}` + saltKey;
        const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
        const checksum = sha256 + '###' + saltIndex;

        const response = await axios.get(
            `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status/${merchantId}/${orderId}`,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-VERIFY': checksum,
                    'X-MERCHANT-ID': merchantId,
                    'accept': 'application/json'
                }
            }
        );

        res.json(response.data);

    } catch (error) {
        console.error("Status Check Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

module.exports = router;