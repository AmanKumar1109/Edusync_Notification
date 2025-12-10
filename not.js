import { google } from "googleapis";
import express from "express";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Load service account from JSON string in environment variable
let serviceAccount;

try {
  // Try to load from SERVICE_ACCOUNT_JSON environment variable (recommended for production)
  if (process.env.SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
    console.log(
      "✅ Service account loaded from SERVICE_ACCOUNT_JSON env variable"
    );
  }
  // Fallback to individual environment variables
  else {
    serviceAccount = {
      type: process.env.FIREBASE_TYPE,
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
      universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
    };
    console.log("✅ Service account loaded from individual env variables");
  }

  // Validate required fields
  if (
    !serviceAccount.client_email ||
    !serviceAccount.private_key ||
    !serviceAccount.project_id
  ) {
    throw new Error("Missing required service account fields");
  }

  console.log("✅ Service Account validated successfully");
  console.log("📧 Client Email:", serviceAccount.client_email);
  console.log(
    "🔑 Private Key:",
    serviceAccount.private_key ? "Loaded" : "Missing"
  );
} catch (error) {
  console.error("❌ Failed to load service account:", error.message);
  process.exit(1);
}

const SCOPES = ["https://www.googleapis.com/auth/firebase.messaging"];

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: SCOPES,
});

// ✅ Generate access token
async function getAccessToken() {
  try {
    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    if (!accessTokenResponse || !accessTokenResponse.token) {
      throw new Error("Failed to generate access token");
    }
    return accessTokenResponse.token;
  } catch (error) {
    console.error("❌ Access Token Error:", error.message);
    throw error;
  }
}

// ✅ Send FCM notification using v1 API
async function sendFCMMessage(targetFCMToken, title, body, customData = {}) {
  const accessToken = await getAccessToken();
  console.log("✅ Access Token Generated Successfully");

  // Merge custom data with default data
  const messageData = {
    click_action: "FLUTTER_NOTIFICATION_CLICK",
    ...customData,
  };

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: targetFCMToken,
          notification: { title, body },
          data: messageData,
        },
      }),
    }
  );

  const result = await response.json();
  console.log("📩 FCM Response:", result);
  return result;
}

async function sendMultipleFCMMessages(tokens, title, body, customData = {}) {
  const results = [];
  for (const token of tokens) {
    try {
      const res = await sendFCMMessage(token, title, body, customData);
      results.push({ token, success: true, res });
    } catch (err) {
      console.error(`❌ Error sending to token ${token}:`, err.message);
      results.push({ token, success: false, error: err.message });
    }
  }
  return results;
}

// 🟢 POST API for sending single notification
app.post("/send-notification", async (req, res) => {
  try {
    const targetToken = req.body.token;
    if (!targetToken) {
      return res.status(400).json({ error: "FCM token is required" });
    }

    const response = await sendFCMMessage(
      targetToken,
      req.body.title || "Default Title",
      req.body.body || "Default Body",
      req.body.data || {}
    );

    res.json(response);
  } catch (e) {
    console.error("❌ Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// 🟢 POST API for sending multiple notifications
app.post("/send-multiple-notification", async (req, res) => {
  try {
    const tokens = req.body.tokens;
    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({ error: "Tokens array is required" });
    }

    const title = req.body.title || "Default Title";
    const body = req.body.body || "Default Body";
    const customData = req.body.data || {};

    const response = await sendMultipleFCMMessages(
      tokens,
      title,
      body,
      customData
    );
    res.json(response);
  } catch (e) {
    console.error("❌ Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 FCM Server running on port ${PORT}`));
