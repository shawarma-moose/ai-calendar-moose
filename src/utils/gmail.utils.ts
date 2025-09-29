import { gmail_v1 } from "googleapis";
import { gmail } from "../config/gmail.config";

interface EmailBody {
  plainText: string;
  html: string;
}

export function parseEmailBody(
  payload: gmail_v1.Schema$MessagePart
): EmailBody {
  const result: EmailBody = { plainText: "", html: "" };

  const partsToProcess: gmail_v1.Schema$MessagePart[] = [payload];

  while (partsToProcess.length > 0) {
    const part = partsToProcess.pop();

    if (!part) continue;

    const partBodyData = part.body?.data;
    if (partBodyData && part.mimeType) {
      const decodedBody = Buffer.from(partBodyData, "base64").toString("utf8");

      if (part.mimeType === "text/plain" && !result.plainText) {
        result.plainText = decodedBody;
      } else if (part.mimeType === "text/html" && !result.html) {
        result.html = decodedBody;
      }
    }

    if (part.parts) {
      partsToProcess.push(...part.parts);
    }
  }
  if (!result.plainText && result.html) {
    result.plainText = result.html.replace(/<[^>]*>?/gm, "");
  }

  return result;
}

export function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[],
  name: string
): string {
  const header = headers.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value as string;
}

export function flattenText(text: string) {
  if (!text) {
    return "";
  }

  return text.replace(/[\r\n\s]+/g, " ").trim();
}

export async function FetchEmails(messageId: string) {
  const email = await gmail.users.messages.get({
    userId: "me",
    id: messageId as string,
    format: "full",
  });

  const { data } = email;
  const payload = data.payload;

  if (!payload?.headers) {
    return null;
  }

  const headers = payload?.headers;
  const subject = getHeader(headers, "Subject");
  const from = getHeader(headers, "From");
  const date = getHeader(headers, "Date");

  const body = parseEmailBody(payload);

  return {
    id: data.id,
    threadId: data.threadId,
    snippet: data.snippet,
    labels: data.labelIds,
    subject,
    body: {
      plain: flattenText(body.plainText),
    },
  };
}

export async function markEmailAsRead(messageId: String) {
  const email = await gmail.users.messages.modify({
    userId: "me",
    id: messageId as string,
    requestBody: {
      removeLabelIds: ["UNREAD"],
    },
  });

  return email;
}
