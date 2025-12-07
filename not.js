import fs from "fs";
import { google } from "googleapis";
import express from "express";
import { channel } from "process";

const app = express();
app.use(express.json());

// ✅ Load service account credentials
const serviceAccount = JSON.parse(fs.readFileSync("service-account.json"));
const SCOPES = ["https://www.googleapis.com/auth/firebase.messaging"];

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: SCOPES,
});

// ✅ Correct way to generate access token
async function getAccessToken() {
  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();
  return accessTokenResponse.token;
}



// ✅ Send FCM notification using v1 API
async function sendFCMMessage(targetFCMToken, title, body) {
  const accessToken = await getAccessToken();
  console.log("✅ Access Token Generated Successfully");

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
          notification: {
            title,
            body,
          },
          data: {
            click_action: "FLUTTER_NOTIFICATION_CLICK",
            customPayload: "some_value",
          },
        },
      }),
    }
  );

  const result = await response.json();
  console.log("📩 FCM Response:", result);
  return result;
}
async function sendMultipleFCMMessages(tokens, title, body) {
  const results = [];

  for (const token of tokens) {
    const res = await sendFCMMessage(token, title, body);
    results.push({ token, res });
  }

  return results;
}

// 🟢 POST API for testing
app.post("/send-notification", async (req, res) => {
  try {
    const targetToken =
      req.body.token ||
      "fFXhcsFlTS6v4b_NBocHYV:APA91bEpFBbDmouGC12ATyjIFAX7QismPnSznXS9X9CUKgjOktaBvAQY5aoF-hvynWfsErS01ayqeDqcDbT4-s_GGFLhCJRWD5JLGCcQATSFffElOrsgxmA";

    const response = await sendFCMMessage(
      targetToken,
      req.body.title || "This is title",
      req.body.body || "This is body"
    );

    res.json(response);
  } catch (e) {
    console.error("❌ Error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/send-multiple-notification", async (req, res) => {
  try {
    const tokens = req.body.tokens || [
      "token1",
      "token2",
      "token3"
    ];

    const title = req.body.title || "This is title";
    const body = req.body.body || "This is body";

    const response = await sendMultipleFCMMessages(tokens, title, body);

    res.json(response);
  } catch (e) {
    console.error("❌ Error:", e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 FCM Server running on port ${PORT}`));
