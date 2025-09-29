import type { AIMessage } from "@langchain/core/messages";
import { ChatGroq } from "@langchain/groq";
import {
  MemorySaver,
  MessagesAnnotation,
  StateGraph,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import readline from "node:readline/promises";
import { createEventTool, getEventTool, getLatestGmailTool } from "./src/tools";

const tools: any = [createEventTool, getEventTool, getLatestGmailTool];
const toolNode = new ToolNode(tools);
const checkpointer = new MemorySaver();

const currentDateTime = new Date().toLocaleString("sv-SE").replace(" ", "T");
const timeZoneString = Intl.DateTimeFormat().resolvedOptions().timeZone;

const systemInstruction = `
    You are an AI assistant specializing in processing restaurant order emails. Your primary goal is to accurately extract key information from an email and format it as a structured JSON object.

  Input Data:
  I will provide you with the body of an email related to a food or catering order.

  Your Directives:

  1.  **Analyze the Email Content**: Carefully read the entire email to understand the context of the order.
  2.  **Identify the Core Task**: Determine if the email is a new order, a confirmation, an update, or a cancellation.
  3.  **Extract Key Order Details**: Scan the email for the following specific pieces of information:
      * **"order_description"**: A brief, one-sentence summary of the order (e.g., "Catering for a team lunch," "Weekly bakery supply order").
      * **event_type**: The type of event or reason for the order (e.g., "Pickup", "Delivery", "Catering Event").
      * **event_date**: The exact date for the delivery or pickup. Extract this in 'YYYY-MM-DD' format. If a specific time is mentioned, include it.
  4.  **Confirm Event does not cause duplication**: After analyzing the emails you have to also check that the events does not schduled twice in the calendar you have to check the timing of the events and prevent duplication as well 
    Current DateTime: ${currentDateTime}
    Current timeZone: ${timeZoneString}
      * **customer_name**: The name of the person or company placing the order, if available.
      * **source_email**: The email address of the sender.

  Required Output Format:
  Your final output must be **only a single JSON object** containing the extracted details. Do not include any conversational text, explanations, or markdown formatting like \`\`\`json.

  Example Output:
  {
    "order_description": "Order for 2 dozen assorted bagels and coffee service.",
    "event_type": "Delivery",
    "event_date": "2025-09-26 08:00 AM",
    "customer_name": "Jane Doe",
    "source_email": "jane.doe@example.com"
  }
  `;

const groq = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "openai/gpt-oss-120b",
  temperature: 0,
}).bindTools(tools);

async function callModel(state: typeof MessagesAnnotation.State) {
  const response = await groq.invoke(state.messages);
  return { messages: [response] };
}

function shouldContinue(state: typeof MessagesAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

  if (lastMessage.tool_calls?.length) {
    return "tools";
  }

  return "__end__";
}

const workflow = new StateGraph(MessagesAnnotation)
  .addNode("assistant", callModel)
  .addNode("tools", toolNode)
  .addEdge("__start__", "assistant")
  .addEdge("tools", "assistant")
  .addConditionalEdges("assistant", shouldContinue);

const app = workflow.compile({ checkpointer });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  while (true) {
    const question = await rl.question("YOU: ");

    if (question === "bye") {
      break;
    }

    const result = await app.invoke(
      {
        messages: [
          {
            role: "system",
            content: systemInstruction,
          },
          {
            role: "user",
            // content: question,
            // content: `can you if I have any new catering orders in my inbox and list them down only for upcoming dates order and if we have any upcoming order can you please also add that event to calendar so I can check be aware of that order and the upcoming date should not include today current date & time. if we don't have any upcoming orders just say to user tthat there are no upcoming order for now.`,
            content: `can you check if I have any new catering orders in my inbox and list them down only for upcoming dates order and if we have any upcoming order can you please also add that event to calendar so I can check be aware of that order and the upcoming date can also include today catering order as well if any order for today current date available add it to calendar and after adding you can say that the event is added to calendar successfully but also you have to check the email is there but if the event for that is already in calendar do not duplicate that event if we don't have any upcoming orders just say to user that there are no upcoming order for now. also when scheduling a meeting from the email you recieved the order info add that as guest as well. and do not add the client email mentioned in the body or somewhere when scheduling in calendar.`,
          },
        ],
      },
      { configurable: { thread_id: "1" } }
    );

    console.log("AI: ", result.messages[result.messages.length - 1]?.content);
  }
  rl.close();
}

main();

// setInterval(async () => {
//   const result = await app.invoke({
//         messages: [
//           {
//             role: "system",
//             content: systemInstruction
//           },
//           {
//             role: "user",
//             // content: question,
//             // content: `can you if I have any new catering orders in my inbox and list them down only for upcoming dates order and if we have any upcoming order can you please also add that event to calendar so I can check be aware of that order and the upcoming date should not include today current date & time. if we don't have any upcoming orders just say to user tthat there are no upcoming order for now.`,
//             content: `can you if I have any new catering orders in my inbox and list them down only for upcoming dates order and if we have any upcoming order can you please also add that event to calendar so I can check be aware of that order and the upcoming date can also include today catering order as well if any order for today current date available add it to calendar and after adding you can say that the event is added to calendar successfully. if we don't have any upcoming orders just say to user that there are no upcoming order for now.`,
//           },
//         ],
//       }, { configurable: { thread_id: "1" } });

//       console.log("AI: ", result.messages[result.messages.length - 1]?.content);
// }, 60 * 60 * 3)
