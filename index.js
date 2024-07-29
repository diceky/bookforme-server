import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());
app.use(cors());

const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
];

let clients = {};

// establish Server-Sent Events (SSE)
app.get('/events/:callId', (req, res) => {
    const callId = req.params.callId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.flushHeaders(); // flush the headers to establish SSE with client

    if (!clients[callId]) {
        clients[callId] = [];
    }

    clients[callId].push(res);

    req.on('close', () => {
        console.log(`Connection closed for user ${callId}`);
        clients[callId] = clients[callId].filter(client => client !== res);
        if (clients[callId].length === 0) {
            delete clients[callId];
        }
    });
});

app.post('/call', async (req, res) => {
    console.log('Call requested:', req.body);

    const api_key = process.env.BLAND_KEY;
    const url = process.env.BLAND_ENDPOINT;
    let toClient = {};

    const task = `
        Goal: Get a reservation for a restaurant on behalf of a user called ${req.body.firstName} ${req.body.lastName}.

        Background:
        You are calling a restaurant on behalf of the user to make a reservation. The user cannot make the call themselves because they do not speak the local language.
        Be as nice and polite as you can to the restaurant staff, and speak VERY SLOWLY.
        You do not need to mention that you are calling on behalf of the user, since that would scare away the restaurant staff. Introduce yourself as the user themself and get the reservation.

        Call Flow:
        1. Express that you want to make a reservation for ${req.body.partyNum} people at ${req.body.hour}:${req.body.minute===0 ? "00" : req.body.minute} on ${months[req.body.month-1]} ${req.body.date}.
        2. If that time is available, confirm the reservation. If the restaurant staff asks you for the user's phone number, it is ${req.body.userPhone}. If the restaurant staff asks you for information other than the user's name or phone number, tell them that you don't know.
        3. If that time is not available, the user would like to ${req.body.planB}. If that still does not work, give up the reservation.
        4. Thank the staff and end the call.‍‍

        Example dialogue:
        Staff: Hello, this is [restaurant name].
        You: Hello, I'd like to make a reservation for 3 people at 19:00 on July 25th.
        Staff: Sure, can I get your name and phone number please?
        You: My name is John Doe, I unfortunately do not have a phone number since I am a tourist.
        Staff: Okay, we'll be waiting for you on 19:00 on July 25th.
        You: Thanks a lot, bye!
    `;

    console.log(task);

    const data = {
        "phone_number": req.body.restaurantPhone,
        "from": null,
        "task": task,
        "model": "enhanced",
        "language": req.body.language,
        "voice": "nat",
        "voice_settings": {},
        "pathway_id": null,
        "local_dialing": false,
        "max_duration": 5,
        "answered_by_enabled": false,
        "wait_for_greeting": true,
        "record": false,
        "amd": false,
        "interruption_threshold": 100,
        "voicemail_message": null,
        "temperature": null,
        "transfer_phone_number": null,
        "transfer_list": {},
        "metadata": {},
        "pronunciation_guide": [],
        "start_time": null,
        "request_data": {},
        "tools": [],
        "dynamic_data": [],
        "analysis_schema": {},
        "webhook": process.env.WEBHOOOK_ENDPOINT,
        "calendly": {}
      }

    try {
        //fetch chatbot response from server
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `${api_key}` },
          body: JSON.stringify(data)
        })
          .then((response) => {
            return response.json();
          })
          .then((response) => {
            console.log(response);
            toClient = response;
          });
      } catch (error) {
        console.error(error);
      }

      await res.status(200).send(toClient);
});

function sendEventToUser(callId, newData) {
    if (clients[callId]) {
        clients[callId].forEach(client => client.write(`data: ${JSON.stringify(newData)}\n\n`));
    }
};

app.post('/webhook', (req, res) => {
    console.log('Received Webhook:', req.body);
    const callId = req.body["call_id"];
    console.log(`callId to send event: ${callId}`);
    sendEventToUser(callId, req.body);
    res.status(200).send('Update sent');
});

app.use((req, res, next) => {
    res.status(404).send('Not Found');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Webhook receiver listening on port ${PORT}`);
});