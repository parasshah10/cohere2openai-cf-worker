import { Context, Env } from "hono";
import { BlankInput } from "hono/types";
import OpenAI from "openai";
import { BingAIClient } from "@waylaidwanderer/chatgpt-api";
import type {
  BingAIClientResponse,
  SuggestedResponse,
  SourceAttribution,
  // @ts-ignore
} from "@waylaidwanderer/chatgpt-api";
import { CohereClient, Cohere } from "cohere-ai";
import { streamSSE } from "hono/streaming";

type CohereRequestBody = Cohere.ChatRequest & {
  stream: boolean;
};

function getMessageContent(message: OpenAI.ChatCompletionMessageParam) {
  if (!message.content) throw new Error("Message content is required.");
  
  if (typeof message.content === "string") {
    return message.content;
  } else {
    let messageContent = "";
    
    // Only grab the text from the message
    for (const content of message.content) {
      if (content.type === "text") {
        messageContent = content.text;
      }
    }

    if (messageContent.length === 0) {
      throw new Error("Message content is required.");
    }

    return messageContent;
  }
}

function getAPIKey(c: Context<Env, "/v1/chat/completions", BlankInput>) {
  // Bearer token
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    throw new Error("Authorization header is required.");
  }

  const tokenParts = authHeader.split(" ");

  if (tokenParts.length !== 2) {
    throw new Error("Invalid Authorization header.");
  }

  if (tokenParts[0] !== "Bearer") {
    throw new Error("Invalid Authorization header.");
  }

  return tokenParts[1];
}

export async function handleChatCompletions(
  c: Context<Env, "/v1/chat/completions", BlankInput>
) {
  const apiKey = getAPIKey(c);

  const body = await c.req.json<OpenAI.ChatCompletionCreateParams>();

  // There will be *-internet, so check for that, and remove it
  const useInternet = body.model.includes("-internet");
  const model = body.model.replace("-internet", "");
  if (["command", "command-nightly", "command-light", "command-light-nightly", "command-r", "command-r-plus"].includes(model)) {
  const apiRequestBody: CohereRequestBody = {
    message: "",
    model,
    chatHistory: [],
    frequencyPenalty: body.frequency_penalty ?? 0.0,
    presencePenalty: body.presence_penalty ?? 0.0,
    stream: body.stream ?? false,
    ...(body.max_tokens && { maxTokens: body.max_tokens }),
    ...(body.temperature && { temperature: body.temperature }),
    connectors: useInternet ? [{ id: "web-search" }] : [],
  };

  for (const message of body.messages) {
    type ChatMessageRoleType =
      (typeof Cohere.ChatMessageRole)[keyof typeof Cohere.ChatMessageRole];

    let role: ChatMessageRoleType = "SYSTEM";
    let messageContent: string = "";
    let addToHistory = true;

    const isLastMessage = body.messages[body.messages.length - 1] === message;

    if (message.role === "system") {
      role = Cohere.ChatMessageRole.System;
      messageContent = message.content;
    } else if (message.role === "user") {
      role = Cohere.ChatMessageRole.User;

      messageContent = getMessageContent(message);

      if (isLastMessage) {
        addToHistory = false;
        apiRequestBody.message = messageContent;
      }
    } else if (message.role === "assistant") {
      role = Cohere.ChatMessageRole.Chatbot;

      messageContent = getMessageContent(message);
    }

    if (addToHistory) {
      apiRequestBody.chatHistory?.push({
        role,
        message: messageContent,
      });
    }
  }

  const cohere = new CohereClient({
    token: apiKey,
  });

  if (body.stream) {
    const streamData = await cohere.chatStream(apiRequestBody);

    return streamSSE(c, async (stream) => {
      for await (const chat of streamData) {
        if (chat.eventType === "text-generation") {
          const sendChunk: OpenAI.ChatCompletionChunk = {
            id: "chatcmpl-123",
            object: "chat.completion.chunk",
            created: 1694268190,
            model: body.model,
            system_fingerprint: "fp_44709d6fcb",
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: chat.text },
                logprobs: null,
                finish_reason: null,
              },
            ],
          };
          await stream.writeSSE({
            data: JSON.stringify(sendChunk),
          });
        }
      }
    });
  } else {
    const chat = await cohere.chat(apiRequestBody);

    const returnCompletionBody: OpenAI.ChatCompletion = {
      id: "chatcmpl-123",
      object: "chat.completion",
      created: 1677652288,
      model: body.model,
      system_fingerprint: "fp_44709d6fcb",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: chat.text,
          },
          logprobs: null,
          finish_reason: "stop",
        },
      ],
    };

    return c.json(returnCompletionBody);
  }
} else if (model === 'gpt-4') {
	  // Placeholder for gpt-4 specific logic
	  const options = {
		  // userToken:'1Nu2b31jnH4RmhF_N0MoyGXKY-HsrARnfkpfN-ooX3HqgGEWpHZ7Ye12EHucFHltxby0uNuxVu9UrgcTXb1eidaXgNXXHtAzCJwe0ynpsGtK3Rxw8V7QYHRLUNkdBTBaAAQW0iY6RfXcTsZql2T6PvIAaO_ixOkq3eovhDW1LpKNIcX2kNpBvJOV3MmtLYKlSttBswDgVrOUHzmOrRelSZA',
		  cookies: '_C_Auth=; _C_Auth=; MUID=14D6834D9E836D4F18EF975E9FBC6C0B; MUIDB=14D6834D9E836D4F18EF975E9FBC6C0B; _EDGE_V=1; SRCHD=AF=hpcodx; SRCHUID=V=2&GUID=C666FDA10C1A4219B52720A2D56EC310&dmnchg=1; MSCCSC=1; PPLState=1; _UR=cdxcls=0&QS=0&TQS=0; MMCASM=ID=57C5500B80B34A6B9340CC2D9C3B9655; BCP=AD=1&AL=1&SM=1; _HPVN=CS=eyJQbiI6eyJDbiI6NSwiU3QiOjAsIlFzIjowLCJQcm9kIjoiUCJ9LCJTYyI6eyJDbiI6NSwiU3QiOjAsIlFzIjowLCJQcm9kIjoiSCJ9LCJReiI6eyJDbiI6NSwiU3QiOjAsIlFzIjowLCJQcm9kIjoiVCJ9LCJBcCI6dHJ1ZSwiTXV0ZSI6dHJ1ZSwiTGFkIjoiMjAyNC0wNC0xOFQwMDowMDowMFoiLCJJb3RkIjowLCJHd2IiOjAsIlRucyI6MCwiRGZ0IjpudWxsLCJNdnMiOjAsIkZsdCI6MCwiSW1wIjo5LCJUb2JuIjowfQ==; ANON=A=5D6A3DABB4D6E58EE80891FAFFFFFFFF&E=1db2&W=1; KievRPSSecAuth=FAByBBRaTOJILtFsMkpLVWSG6AN6C/svRwNmAAAEgAAACBERr1dFFQbtMAQd29kRYM4IiEZzYBXAkUhVi059/6pFgaeqcsQzNhIvPcMe8G/DJgITgSV2aq6wzfyIvDFUPp9geP+/glsAZltIrVhhLngnn9TTnpUabI9m09LBUekZjoFMmOWP46Z/Ut2SLpPv5Zx5UJ1rIkqyvDw7wNzXHkWKC9X2NGUyJxihq42I9nBeSeLXVTduuaIVmuVWDXaGL6eNwg2PEK6i+xYI/tcYBUixEeWd/h/TSARe3rz03f7Q9pjCJyt+l/AU4eZ/NEkvArHR75RFBhGSrkLoWrDp7hq2JrmeqM59Gmq5v4Qm5C2c7k9gesMzjwjnjrXHbFXpDB2CZXY5CaKecWLxb5Pwpn+NF3md1i80PiEaySHT7NoJMiz/QHvwh5vhs9MbbApx2z5a2Na9J2RsZ1ltlZDcESh0PcvP3VhgOEWEonmAwI78toRtocEMAG4PhQWKbTCV5YVsdxcp6mYNImi2+Q7JItQkQRVhqLEk1zkYv5HCucw1NoLxolcUcCo3mBYoclWo9sC9B+KIk9X4lwCULgWNspdhNGoQOiaArqiwig4hvxZ66XjTWKmdTLqISox7mFmMCch0/LEcJ68RgCxLO57M5LT3N2JNyBxnqThYujT74phRXa+12xWLOiHeyyRl6BKRSZPnTCUlmHlmMTz1SoOo4mcOoEELpSYVJR+lM4CJPnTI3RWl8AhrhaGxWvLt2ZvAyrwBgd3Ag11sKLm1W9S0SAI1vgmCs3+dLuqPc1HzT3SHHhjBFD1waFgtwxaWwapuNMmTKuI310W0FWJsm/vNsVqvqRZSiksplMbbVv15FKvHTET4gcP0a0Nk5f65a+8+bJYB2pCfYRSnPxBJBZiP9X86L4eOzC99hTV5AghNmIdmEy1CtOtR6EFKiaUfiRZoifx19qZxX8CJnRpVgUyJWbt+JMmdJe1jl69jffHxhg0mUOSnmJlDlnzTWNc5xXozBbbsUdMEvc6747F6RBBGRX4ceBmxCbBjX+9ZkeG4I26dEmkFz94aKwjPF5ozYURdhfTQX5zy9CAE4gLPExVWDjKOg83Zyxc8iyyGS+Z5wjTO6mQsFAF2ay9lODR++eH9iIAAjJCNXd5LxA4vCS6tSh4T5pcCUCoXjAnTzdyppRSft0i7+2niOFbKJU48gqKPaihwS7Bbv2/OShxypY5jOjiN7774qI+qrAdDx1I1PcQDDovdUyZC8tcdbjUMfutIAOrMhCvjOPsF3I3tnMvNZFwxQmsudBCs+n56Qnr3hWp/NpfysfLh54UYABctBkk6gWmPh4gcpepxWa8XaBIroBVsjHNa8X9Ji7h5ArMt29zpSxCNHhMGwwKEkF9UTkoFsQm6MXydEywtTW2rB4wn2tHn9pMIqTHcLAlIp9jOyJKpo5liDnrY0HJwUwp+/lbTHhJMktmRsXSKDuSoFAA8rYCFYSA6Iz9ZPZ0gIsS7ey1Ebw==; _U=1Nu2b31jnH4RmhF_N0MoyGXKY-HsrARnfkpfN-ooX3HqgGEWpHZ7Ye12EHucFHltxby0uNuxVu9UrgcTXb1eidaXgNXXHtAzCJwe0ynpsGtK3Rxw8V7QYHRLUNkdBTBaAAQW0iY6RfXcTsZql2T6PvIAaO_ixOkq3eovhDW1LpKNIcX2kNpBvJOV3MmtLYKlSttBswDgVrOUHzmOrRelSZA; WLID=ZNWhQal9yyDo1GbYlGNmioADgPb9Y/UCLjsE69Qy/8jvqFKarWYI4EhLxfQbyDmW3jPwmwQKi6XH+p6eNUiomafG+53kJIBURwWMHO/tyzs=; cct=PWFKutzOlqUiDjaxIWcUAfHSbsuqgxaA-q6TchOeuk93LcDE-TGFOGHk_PGrtcQ6NoKjMObb7c_bDLHMUyri5g; _EDGE_S=SID=05C2556D4BEC65941866411F4A20645A; WLS=C=ad74d36ef70fabb4&N=Sydney; _Rwho=u=d&ts=2024-05-01; _SS=SID=05C2556D4BEC65941866411F4A20645A&R=0&RB=0&GB=0&RG=0&RP=0; USRLOC=HS=1&ELOC=LAT=19.285572052001953|LON=72.86102294921875|N=Thane%2C%20Maharashtra|ELT=4|; SRCHUSR=DOB=20240316&T=1714560328000&POEX=W; _RwBf=mta=0&rc=0&rb=0&gb=0&rg=0&pc=0&mtu=0&rbb=0.0&g=0&cid=&clo=0&v=9&l=2024-05-01T07:00:00.0000000Z&lft=0001-01-01T00:00:00.0000000&aof=0&ard=0001-01-01T00:00:00.0000000&rwdbt=0001-01-01T16:00:00.0000000-08:00&rwflt=2024-04-23T06:32:23.7396225-07:00&o=0&p=MSAAUTOENROLL&c=MR000T&t=8011&s=2024-03-11T19:04:41.1644488+00:00&ts=2024-05-01T10:50:17.9588951+00:00&rwred=0&wls=2&wlb=0&wle=0&ccp=0&lka=0&lkt=0&aad=0&TH=&e=BQ8F58VEfo6gJeR5oVVUhMXGJVYqPhcbtmfNyaA9hPfUzNuCOPL8bAQe0B8UpN3IK5l5mJyFzHhLUxc0fb7jgg&A=&cpt=0; SRCHHPGUSR=SRCHLANG=en&IG=74E8590755324FB3A6320B1DFF3C5DCD&PV=15.0.0&BRW=HTP&BRH=S&CW=971&CH=695&SCW=971&SCH=219&DPR=1.3&UTC=330&DM=0&CIBV=1.1701.1&EXLTT=5&HV=1714560620&PRVCW=971&PRVCH=695&cdxtone=Precise&cdxtoneopts=h3precise,clgalileo,codeintfilev2&WTS=63849837865; ipv6=hit=1714564221578',
		  debug: false,
			  host: null,
			  proxy: null}
		  // If the above doesn't work, provide all your cookies as a string instead};

	  let bingAIClient = new BingAIClient(options);

	  let response = await bingAIClient.sendMessage('Write a short poem about cats', {
		  // (Optional) Set a conversation style for this message (default: 'balanced')
		  toneStyle: 'precise', // or creative, precise, fast
		  onProgress: (token) => {
			  process.stdout.write(token);
		  },
	  });
	  return streamSSE(c, async (stream) => {
	  const sendChunk: OpenAI.ChatCompletionChunk = {
		  id: "chatcmpl-123",
		  object: "chat.completion.chunk",
		  created: 1694268190,
		  model: body.model,
		  system_fingerprint: "fp_44709d6fcb",
		  choices: [
			{
			  index: 0,
			  delta: { role: "assistant", content: 'My name is Emily, I am here to serve you.' },
			  logprobs: null,
			  finish_reason: null,
			},
		  ],
		};
	  await stream.writeSSE({
		  data: JSON.stringify(sendChunk),
		});
	
  })
}}
