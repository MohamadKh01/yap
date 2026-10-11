require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

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

// Variable to hold the dynamic Expo URL for the current session
let currentClientUrl = 'dabi://callback';

// 2. Create Auth Request
app.post('/auth-request', async (req, res) => {
    const { institutionId, returnUrl } = req.body;

    if (returnUrl) {
        currentClientUrl = returnUrl; // Save the dynamic URL sent by React Native
    }

    try {
        const response = await axios.post(
            `${YAPILY_BASE_URL}/account-auth-requests`,
            {
                applicationUserId: "dabi-lab3-user-001",
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

// 3. Handle Bank Redirect & Deep Link to Mobile App
app.get('/callback', (req, res) => {
    const queryParams = new URLSearchParams(req.query).toString();

    // Safely append query parameters to the dynamic Expo URL
    // (Expo URLs sometimes already contain a '?' like exp://192.168.1.5:8081/--/callback)
    const separator = currentClientUrl.includes('?') ? '&' : '?';
    const deepLink = `${currentClientUrl}${separator}${queryParams}`;

    res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Redirecting...</title>
      </head>
      <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
        <h2>Authentication Successful</h2>
        <p>Returning you to the DABI app...</p>
        <p>If you are not redirected automatically, <a href="${deepLink}" style="color: blue; text-decoration: underline;">click here</a>.</p>
        <script>
          window.location.replace("${deepLink}");
        </script>
      </body>
    </html>
  `);
});

// 4. Get Accounts
app.get('/accounts', async (req, res) => {
    const { consenttoken } = req.headers; // Extracted from React Native
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

// 5. Get Consent Metadata
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

// 6. Get Transactions for an Account
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

app.listen(process.env.PORT, () => {
    console.log(`Backend running on port ${process.env.PORT}`);
    console.log(`Ensure ngrok is forwarding to this port: ngrok http ${process.env.PORT}`);
});