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

// Proxy endpoint for OpenAI Chat Completions
app.post('/v1/chat/completions', async (req, res) => {
    try {
        // 1. Authenticate the incoming request
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

        // 2. Intercept and Mask the Payload
        // We only care about masking the 'messages' array where the user chat content lives
        let payload = req.body;

        // Create a copy of the payload with masked messages
        if (payload.messages && Array.isArray(payload.messages)) {
            payload.messages = payload.messages.map(msg => {
                if (msg.content && typeof msg.content === 'string') {
                    return {
                        ...msg,
                        content: maskJsonPayload(msg.content)
                    };
                }
                return msg;
            });
        }

        console.log(`[PROXY] Forwarding masked request to OpenAI...`);

        // 3. Forward the modified payload to OpenAI
        const response = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
            headers: {
                'Authorization': `Bearer ${REAL_OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            responseType: 'stream' // Support streaming if requested
        });

        // 4. Stream or return the response back to the client
        // Pass along OpenAI's headers
        Object.entries(response.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
        });

        res.status(response.status);
        response.data.pipe(res);

    } catch (error) {
        console.error("[PROXY ERROR]", error.message);
        if (error.response) {
            // Forward OpenAI errors directly
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: { message: "Internal Proxy Error", details: error.message } });
        }
    }
});

// For models/embeddings/other endpoints, simply pass through without masking if needed (Not fully implemented here to keep focus on Chat)
app.use('/v1/(.*)', (req, res) => {
    res.status(501).json({ error: { message: "This proxy currently only supports /v1/chat/completions" } });
});

app.listen(PORT, () => {
    console.log(`🤖 AI Security Proxy Server listening on port ${PORT}`);
    console.log(`🔒 Proxy Secret Key: ${PROXY_SECRET_KEY}`);
    if (!REAL_OPENAI_API_KEY) {
        console.warn(`⚠️ Warning: REAL_OPENAI_API_KEY is missing. Requests to OpenAI will fail.`);
    }
});
