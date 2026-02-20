// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { maskJsonPayload } = require('./masking');

const app = express();
const PORT = process.env.PORT || 3000;

// The actual OpenAI API Key that the server will use to fulfill requests
const REAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// The Proxy API key that users must provide to use this proxy
const PROXY_SECRET_KEY = process.env.PROXY_SECRET_KEY || 'my-secure-proxy-key-123';

app.use(cors());
// Parse incoming JSON requests so we can inspect and mask the body
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
    res.send('AI Security Proxy Server is running! Point your AI tools to /v1/chat/completions');
});

// SINGLE UNIFIED ROUTE HANDLER
// We use a single global handler to ensure n8n or any tool cannot sneak past with unexpected URL formatting.
app.use(async (req, res) => {
    // 1. Pre-flight OPTIONS bypass
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    console.log(`[INCOMING] ${req.method} request to ${req.originalUrl}`);

    // 2. Authenticate the incoming request
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: { message: "Missing or invalid Authorization header" } });
    }

    const incomingKey = authHeader.split(' ')[1];
    if (incomingKey !== PROXY_SECRET_KEY) {
        return res.status(403).json({ error: { message: "Forbidden: Invalid Proxy API Key" } });
    }

    if (!REAL_OPENAI_API_KEY) {
        console.error("Server Configuration Error: OPENAI_API_KEY is not set.");
        return res.status(500).json({ error: { message: "Server Configuration Error: OpenAI API Key missing." } });
    }

    // Determine target URL (OpenAI ignores double slashes like //v1)
    const targetUrl = `https://api.openai.com${req.originalUrl}`;
    let payload = (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') ? req.body : undefined;

    // 3. Intercept and Mask universally for ANY endpoint
    if (payload) {
        console.log(`[PROXY] Intercepting payload for masking on ${req.originalUrl}...`);
        payload = maskJsonPayload(req.body);
    }

    // 4. Forward the request using Axios
    try {
        const response = await axios({
            method: req.method,
            url: targetUrl,
            data: payload,
            headers: {
                'Authorization': `Bearer ${REAL_OPENAI_API_KEY}`,
                // Pass original content type, fallback to json
                'Content-Type': req.headers['content-type'] || 'application/json',
            },
            responseType: 'stream' // Support streaming
        });

        // 5. Stream or return the response back to the client
        Object.entries(response.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
        });
        res.status(response.status);
        response.data.pipe(res);

    } catch (error) {
        console.error(`[PROXY ERROR] for ${targetUrl}:`, error.message);
        if (error.response) {
            // Forward OpenAI errors directly
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: { message: "Internal Proxy Error", details: error.message } });
        }
    }
});

app.listen(PORT, () => {
    console.log(`🤖 AI Security Proxy Server listening on port ${PORT}`);
    console.log(`🔒 Proxy Secret Key: ${PROXY_SECRET_KEY}`);
    if (!REAL_OPENAI_API_KEY) {
        console.warn(`⚠️ Warning: REAL_OPENAI_API_KEY is missing. Requests to OpenAI will fail.`);
    }
});
