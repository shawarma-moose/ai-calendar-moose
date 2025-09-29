import { google } from "googleapis";
import { oauth2Client } from "../../server";
import tokens from "../../tokens.json";

oauth2Client.setCredentials(tokens);

export const gmail = google.gmail({ version: "v1", auth: oauth2Client });
