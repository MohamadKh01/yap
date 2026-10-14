require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Load credentials from Render Environment Variable, or fallback to local file
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    serviceAccount = require('./serviceAccountKey.json');
}

// Initialize Firebase Admin
initializeApp({
    credential: cert(serviceAccount)
});
const db = getFirestore();

const app = express();
app.use(cors());
app.use(express.json());

const YAPILY_BASE_URL = 'https://api.yapily.com';
const NGROK_URL = process.env.NGROK_URL;

// Generate Basic Auth token for Yapily
const getBasicAuth = () => {
    const credentials = `${process.env.YAPILY_APP_ID}:${process.env.YAPILY_APP_SECRET}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
};

let currentClientUrl = 'dabi://callback';

// 1. Get Institutions
app.get('/institutions', async (req, res) => {
    try {
        const response = await axios.get(`${YAPILY_BASE_URL}/institutions`, {
            headers: { Authorization: getBasicAuth() },
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// 2. Create Auth Request (UPDATED FOR FIREBASE)
app.post('/auth-request', async (req, res) => {
    // Now extracting userId provided by React Native
    const { institutionId, returnUrl, userId } = req.body;

    if (returnUrl) {
        currentClientUrl = returnUrl;
    }

    if (!userId) {
        return res.status(400).json({ error: "userId is required for secure linking" });
    }

    try {
        const response = await axios.post(
            `${YAPILY_BASE_URL}/account-auth-requests`,
            {
                applicationUserId: userId, // Dynamically set instead of hardcoded
                institutionId: institutionId,
                callback: `${NGROK_URL}/callback`,
            },
            {
                headers: { Authorization: getBasicAuth() },
            }
        );
        res.json(response.data);
    } catch (error) {
        console.error("Yapily Auth Error:", error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// 3. Handle Bank Redirect & Save to Cloud (UPDATED)
app.get('/callback', async (req, res) => {
    // Extract parameters passed back by the bank via Yapily
    const consent = req.query.consent;
    const applicationUserId = req.query['application-user-id'];
    const institution = req.query.institution;
    const error = req.query.error;

    // Grab the consent-id
    const consentId = req.query['consent-id'] || req.query.consentid;

    if (!error && consent && applicationUserId && institution) {
        try {
            // Write the token securely to the user's Firestore document
            const userRef = db.collection('users').doc(applicationUserId);

            await userRef.set({
                linkedBanks: FieldValue.arrayUnion({
                    institutionId: institution,
                    consentToken: consent,
                    consentId: consentId, // Save it to the database
                    linkedAt: new Date().toISOString()
                })
            }, { merge: true });
        } catch (dbError) {
            console.error("Failed to save token to Firestore:", dbError);
        }
    }

    // Safely append a simple success status to the Expo URL, hiding the token
    const separator = currentClientUrl.includes('?') ? '&' : '?';
    const deepLink = `${currentClientUrl}${separator}status=${error ? 'failed' : 'success'}&instId=${institution}`;

    res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Redirecting...</title>
      </head>
      <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
        <h2>${error ? 'Authentication Failed' : 'Authentication Successful'}</h2>
        <p>Returning you to the MAuraK app...</p>
        <p>If you are not redirected automatically, <a href="${deepLink}" style="color: blue; text-decoration: underline;">click here</a>.</p>
        <script>
          window.location.replace("${deepLink}");
        </script>
      </body>
    </html>
  `);
});

// NEW 4. Fetch Saved Tokens for React Native
app.get('/user/tokens/:userId', async (req, res) => {
    try {
        const doc = await db.collection('users').doc(req.params.userId).get();
        if (!doc.exists) {
            return res.json({ linkedBanks: [] });
        }
        res.json({ linkedBanks: doc.data().linkedBanks || [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Get Accounts
app.get('/accounts', async (req, res) => {
    const { consenttoken } = req.headers;
    try {
        const response = await axios.get(`${YAPILY_BASE_URL}/accounts`, {
            headers: {
                Authorization: getBasicAuth(),
                consent: consenttoken
            },
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// 6. Get Consent Metadata
app.get('/consents/:consentId', async (req, res) => {
    try {
        const response = await axios.get(`${YAPILY_BASE_URL}/consents/${req.params.consentId}`, {
            headers: { Authorization: getBasicAuth() },
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// 7. Get Transactions for an Account
app.get('/accounts/:accountId/transactions', async (req, res) => {
    const { consenttoken } = req.headers;
    try {
        const response = await axios.get(`${YAPILY_BASE_URL}/accounts/${req.params.accountId}/transactions`, {
            headers: {
                Authorization: getBasicAuth(),
                consent: consenttoken
            },
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// 8. Revoke Consent (Delete from Firestore)
app.delete('/user/tokens/:userId/:instId', async (req, res) => {
    try {
        const { userId, instId } = req.params;
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();

        if (doc.exists) {
            const linkedBanks = doc.data().linkedBanks || [];
            // Keep all banks EXCEPT the one being revoked
            const updatedBanks = linkedBanks.filter(b => b.institutionId !== instId);
            await userRef.update({ linkedBanks: updatedBanks });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(process.env.PORT, () => {
    console.log(`Backend running on port ${process.env.PORT}`);
    console.log(`Ensure ngrok is forwarding to this port: ngrok http ${process.env.PORT}`);
});