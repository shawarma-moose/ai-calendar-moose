import { tool } from "@langchain/core/tools";
import { google } from "googleapis";
import z from "zod";
import { oauth2Client } from "../server";
import tokens from "../tokens.json" assert { type: "json" };
import { gmail } from "./config/gmail.config";
import { FetchEmails, markEmailAsRead } from "./utils/gmail.utils";

oauth2Client.setCredentials(tokens);

const calendar = google.calendar({ version: "v3", auth: oauth2Client });

interface Params {
  q: string;
  timeMin: string;
  timeMax: string;
}

type attendees = {
  email: string;
  displayName: string;
};

type EventData = {
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees: attendees[];
};

export const getLatestGmailTool = tool(
  async ({ maxResults = 1, from }: { maxResults?: number; from?: string }) => {
    console.log("Tool Called");
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      const afterDateQuery = `after:${year}/${month}/${day}`;

      const fromQuery = from
        ? `from:${from}`
        : "from:shawarmamoose898@gmail.com OR from:lariosqueen839@gmail.com OR from:shawarmawest746@gmail.com";

      const finalQuery = `${fromQuery} ${afterDateQuery} is:unread`;
      console.log("Query", finalQuery);
      const listEmails = await gmail.users.messages.list({
        userId: "me",
        maxResults,
        q: finalQuery,
      });

      const messages = listEmails.data.messages || [];

      if (messages.length === 0) return "No Data Found";

      const emails = await Promise.all(
        messages.map(async ({ id }) => {
          if (!id) return null;
          return FetchEmails(id);
        })
      );

      const markEmailAsReadAfterFetch = await Promise.all(
        messages.map(async ({ id }) => {
          if (!id) return [];
          return markEmailAsRead(id);
        })
      );

      console.log("emails", JSON.stringify(emails));

      return JSON.stringify(emails);
    } catch (error) {
      console.error("Failed to fetch emails:", error);
      throw new Error("An error occurred while trying to retrieve emails.");
    }
  },
  {
    name: "get-latest-gmail",
    description:
      "Fetch the latest emails from Gmail. You can optionally specify `maxResults` and `from` email address.",
    schema: z.object({
      maxResults: z.number().optional(),
      from: z.string().optional(),
    }),
  }
);

export const getEventTool = tool(
  async (params) => {
    console.log("Get event tool called");
    const { q, timeMin, timeMax } = params as Params;

    try {
      const response = await calendar.events.list({
        calendarId: "primary",
        q: q,
        timeMin: timeMin,
        timeMax: timeMax,
      });

      const result = response?.data?.items?.map((event) => {
        return {
          id: event.id,
          summary: event.summary,
          status: event.status,
          creator: event.creator,
          organizer: event.organizer,
          startTime: event.start,
          endTime: event.end,
          meetingUrl: event.hangoutLink,
          eventType: event.eventType,
        };
      });

      if (result?.length === 0) {
        return "No Events Found in Calendar";
      }

      return JSON.stringify(result);
    } catch (error) {
      console.log("Error", error);
    }

    return "Failed to connect to calendar";
  },
  {
    name: "get-events",
    description: "this tool can be used to check the meetings in the calendar",
    schema: z.object({
      q: z
        .string()
        .describe(
          "The query parameter can be used to events from google calendar. You can pass parameter in this function like summary, description, location, attendee's displayName, attendee's email, organizer's displayName, organizer's email"
        ),
      timeMin: z.string().describe("The from datetime to get the events"),
      timeMax: z.string().describe("The to datetime to get events."),
    }),
  }
);

export const createEventTool = tool(
  async (eventData) => {
    console.log("Create event tool called");
    const { summary, start, end, attendees, description } =
      eventData as EventData;
    const response = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: "all",
      conferenceDataVersion: 1,
      requestBody: {
        description,
        summary,
        start,
        end,
        attendees,
        // conferenceData: {
        //   createRequest: {
        //     requestId: uuid(),
        //     conferenceSolutionKey: {
        //       type: "hangoutsMeet",
        //     },
        //   },
        // },
      },
    });

    if (response.status === 200) {
      return "The meeting has been schduled successfully.";
    }

    return "Unable to create a meeting";
  },
  {
    name: "create-event",
    description: "this tool can be used to create events and schedule meeting",
    schema: z.object({
      summary: z.string().describe("This is the title of the event"),
      start: z.object({
        dateTime: z
          .string()
          .describe("The date time of the start of the event."),
        timeZone: z.string().describe("Current IANA timezone string"),
      }),
      end: z.object({
        dateTime: z.string().describe("The date time of the end of the event"),
        timeZone: z.string().describe("Current IANA timezone string"),
      }),
      attendees: z.array(
        z.object({
          email: z.string().describe("This is the email of the attendees"),
          displayName: z.string().describe("This is the name of the attendees"),
        })
      ),
    }),
  }
);
