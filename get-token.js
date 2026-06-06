import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

const code = process.env.GMAIL_AUTH_CODE;

if (!code) {
  throw new Error("GMAIL_AUTH_CODE not found in .env.local");
}

const { tokens } = await oauth2Client.getToken(code);

console.log(tokens);