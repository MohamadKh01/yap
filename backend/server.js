require('dotenv').config(); //[cite: 1]
const express = require('express'); //[cite: 1]
const cors = require('cors'); //[cite: 1]
const axios = require('axios'); //[cite: 1]
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

const app = express(); //[cite: 1]
app.use(cors()); //[cite: 1]
app.use(express.json()); //[cite: 1]

const YAPILY_BASE_URL = 'https://api.yapily.com'; //[cite: 1]
const NGROK_URL = process.env.NGROK_URL; //[cite: 1]

// Generate Basic Auth token for Yapily[cite: 1]
const getBasicAuth = () => { //[cite: 1]
    const credentials = `${process.env.YAPILY_APP_ID}:${process.env.YAPILY_APP_SECRET}`; //[cite: 1]
    return `Basic ${Buffer.from(credentials).toString('base64')}`; //[cite: 1]
};

let currentClientUrl = 'dabi://callback'; //[cite: 1]

// 1. Get Institutions[cite: 1]
app.get('/institutions', async (req, res) => { //[cite: 1]
    try {
        const response = await axios.get(`${YAPILY_BASE_URL}/institutions`, { //[cite: 1]
            headers: { Authorization: getBasicAuth() }, //[cite: 1]
        });
        res.json(response.data); //[cite: 1]
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message }); //[cite: 1]
    }
});

// 2. Create Auth Request (UPDATED FOR FIREBASE)
app.post('/auth-request', async (req, res) => { //[cite: 1]
    // Now extracting userId provided by React Native
    const { institutionId, returnUrl, userId } = req.body; //[cite: 1]

    if (returnUrl) { //[cite: 1]
        currentClientUrl = returnUrl; //[cite: 1]
    }

    if (!userId) {
        return res.status(400).json({ error: "userId is required for secure linking" });
    }

    try {
        const response = await axios.post( //[cite: 1]
            `${YAPILY_BASE_URL}/account-auth-requests`, //[cite: 1]
            {
                applicationUserId: userId, // Dynamically set instead of hardcoded[cite: 1]
                institutionId: institutionId, //[cite: 1]
                callback: `${NGROK_URL}/callback`, //[cite: 1]
            },
            {
                headers: { Authorization: getBasicAuth() }, //[cite: 1]
            }
        );
        res.json(response.data); //[cite: 1]
    } catch (error) {
        console.error("Yapily Auth Error:", error.response?.data || error.message); //[cite: 1]
        res.status(500).json({ error: error.response?.data || error.message }); //[cite: 1]
    }
});

// 3. Handle Bank Redirect & Save to Cloud (UPDATED FOR FIREBASE)
app.get('/callback', async (req, res) => { //[cite: 1]
    // Extract parameters passed back by the bank via Yapily
    const { consent, 'application-user-id': applicationUserId, institution, error } = req.query;

    if (!error && consent && applicationUserId && institution) {
        try {
            // Write the token securely to the user's Firestore document
            const userRef = db.collection('users').doc(applicationUserId);
            
            await userRef.set({
                linkedBanks: FieldValue.arrayUnion({
                    institutionId: institution,
                    consentToken: consent,
                    linkedAt: new Date().toISOString()
                })
            }, { merge: true });
        } catch (dbError) {
            console.error("Failed to save token to Firestore:", dbError);
        }
    }

    // Safely append a simple success status to the Expo URL, hiding the token[cite: 1]
    const separator = currentClientUrl.includes('?') ? '&' : '?'; //[cite: 1]
    const deepLink = `${currentClientUrl}${separator}status=${error ? 'failed' : 'success'}`; //[cite: 1]

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
  `); //[cite: 1]
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

// 5. Get Accounts[cite: 1]
app.get('/accounts', async (req, res) => { //[cite: 1]
    const { consenttoken } = req.headers; //[cite: 1]
    try {
        const response = await axios.get(`${YAPILY_BASE_URL}/accounts`, { //[cite: 1]
            headers: {
                Authorization: getBasicAuth(), //[cite: 1]
                consent: consenttoken //[cite: 1]
            },
        });
        res.json(response.data); //[cite: 1]
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message }); //[cite: 1]
    }
});

// 6. Get Consent Metadata[cite: 1]
app.get('/consents/:consentId', async (req, res) => { //[cite: 1]
    try {
        const response = await axios.get(`${YAPILY_BASE_URL}/consents/${req.params.consentId}`, { //[cite: 1]
            headers: { Authorization: getBasicAuth() }, //[cite: 1]
        });
        res.json(response.data); //[cite: 1]
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message }); //[cite: 1]
    }
});

// 7. Get Transactions for an Account[cite: 1]
app.get('/accounts/:accountId/transactions', async (req, res) => { //[cite: 1]
    const { consenttoken } = req.headers; //[cite: 1]
    try {
        const response = await axios.get(`${YAPILY_BASE_URL}/accounts/${req.params.accountId}/transactions`, { //[cite: 1]
            headers: {
                Authorization: getBasicAuth(), //[cite: 1]
                consent: consenttoken //[cite: 1]
            },
        });
        res.json(response.data); //[cite: 1]
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message }); //[cite: 1]
    }
});

app.listen(process.env.PORT, () => { //[cite: 1]
    console.log(`Backend running on port ${process.env.PORT}`); //[cite: 1]
    console.log(`Ensure ngrok is forwarding to this port: ngrok http ${process.env.PORT}`); //[cite: 1]
});