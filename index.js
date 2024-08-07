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

const planBOptions = [
  "Give up the reservation",
  "Check for slots 1 hour before or after the desired slot"
];

const planBOptionsJA = [
  "予約を諦める",
  "希望時間の前後1時間が空いているか確認する"
];

let clients = {};

const phoneToJA = (number) => {
  let numberJA = "";
  const chars = number.split('');
  chars.forEach((char) => {
    if(char==="+") numberJA += "プラス ";
    else if(char==="0") numberJA += "ゼロ ";
    else if(char==="1") numberJA += "イチ ";
    else if(char==="2") numberJA += "ニ " ;
    else if(char==="3") numberJA += "サン ";
    else if(char==="4") numberJA += "ヨン ";
    else if(char==="5") numberJA += "ゴ ";
    else if(char==="6") numberJA += "ロク ";
    else if(char==="7") numberJA += "ナナ ";
    else if(char==="8") numberJA += "ハチ ";
    else if(char==="9") numberJA += "キュウ ";
  })
  return numberJA;
}

const dateToJA = (number) => {
  let dateJA = "";
  if(number==="1") dateJA = "ついたち";
  else if(number==="2") dateJA = "ふつか" ;
  else if(number==="3") dateJA = "みっか";
  else if(number==="4") dateJA = "よっか";
  else if(number==="5") dateJA = "いつか";
  else if(number==="6") dateJA = "むいか";
  else if(number==="7") dateJA = "なのか";
  else if(number==="8") dateJA = "ようか";
  else if(number==="9") dateJA = "ここのか";
  else if(number==="10") dateJA = "とおか";
  else if(number==="11") dateJA = "じゅういちにち" ;
  else if(number==="12") dateJA = "じゅうににち" ;
  else if(number==="13") dateJA = "じゅうさんにち";
  else if(number==="14") dateJA = "じゅうよっか";
  else if(number==="15") dateJA = "じゅうごにち";
  else if(number==="16") dateJA = "じゅうろくにち";
  else if(number==="17") dateJA = "じゅうななにち";
  else if(number==="18") dateJA = "じゅうはちにち";
  else if(number==="19") dateJA = "じゅうくにち";
  else if(number==="20") dateJA = "はつか";
  else if(number==="21") dateJA = "にじゅういちにち" ;
  else if(number==="22") dateJA = "にじゅうににち" ;
  else if(number==="23") dateJA = "にじゅうさんにち";
  else if(number==="24") dateJA = "にじゅうよんにち";
  else if(number==="25") dateJA = "にじゅうごにち";
  else if(number==="26") dateJA = "にじゅうろくにち";
  else if(number==="27") dateJA = "にじゅうななにち";
  else if(number==="28") dateJA = "にじゅうはちにち";
  else if(number==="29") dateJA = "にじゅうくにち";
  else if(number==="30") dateJA = "さんじゅうにち";
  else if(number==="31") dateJA = "さんじゅういちにち";
  return dateJA;
}

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
        Goal: Get a reservation for a restaurant on behalf of a customer called ${req.body.firstName} ${req.body.lastName}.

        Background:
        You are a customer calling a restaurant to make a reservation. 
        You are calling on behalf of a user who is unable to make the call themselves because they do not speak the local language.
        Be as nice and polite as you can to the restaurant staff, and speak VERY SLOWLY.
        Introduce yourself as the user and ask the restaurant if the reservation can be made.
        You do not need to mention that you are calling on behalf of the user.

        Call Flow:
        1. Express that you want to make a reservation for ${req.body.partyNum} people at ${req.body.hour}:${req.body.minute===0 ? "00" : req.body.minute} on ${months[req.body.month-1]} ${req.body.date}.
        2. If that time is available, confirm the reservation.
        3. If the restaurant staff asks you for the user's phone number, ${req.body.userPhone===null ? "tell them you don't know" : `it is ${req.body.userPhone}`}.
        4. If the restaurant staff asks you for information other than your name or phone number, tell them that you don't know.
        5. If that time is not available, the user would like to ${planBOptions[req.body.planB - 1]}. If that still does not work, give up the reservation.
        6. Thank the staff and end the call.‍‍

        Example dialogue:
        Restaurant: Hello, this is [restaurant name].
        You: Hello, I'd like to make a reservation for 3 people at 19:00 on July 25th.
        Restaurant: Sure, can I get your name and phone number please?
        You: My name is John Doe, and my phone number is 090-1234-5678.
        Restaurant: Okay, we'll be waiting for you on 19:00 on July 25th.
        You: Thanks a lot, bye!
    `;

    const taskJA = `
        目的: ${req.body.firstName} ${req.body.lastName}というユーザーのために、レストランの予約をとること。

        背景:
        あなたは予約をとるためにレストランに電話をしている客です。
        現地の言語を話さないユーザーのために、代理で電話をかけています。
        レストランのスタッフにはできるだけ礼儀正しく、そして優しく話しかけてください。
        そして、できるだけゆっくり話してください。
        代理で電話をかけていることは言う必要はありません。ユーザーに成り代わって予約の電話をかけてください。

        電話の流れ:
        1. ${req.body.month}月${dateToJA(req.body.date)}の${req.body.hour}時${req.body.minute===0 ? "" : `${req.body.minute}分`}に、${req.body.partyNum}名で予約をとりたいことを伝えてください。
        2. その枠が予約できるならば、予約を確定してもらってください。
        3. 日付を聞かれたら、${req.body.month}月${dateToJA(req.body.date)}の${req.body.hour}時${req.body.minute===0 ? "" : `${req.body.minute}分`}と答えてください。
        4. 名前を聞かれたら、${req.body.firstName} ${req.body.lastName}と答えてください。
        5. 電話番号を聞かれたら、${req.body.userPhone===null ? "日本で繋がる電話番号を持っていないと答えてください" : `${phoneToJA(req.body.userPhone)}と答えてください`}。 
        6. それ以外の情報を聞かれたら、分からないと答えてください。
        7. もしその枠が予約できないならば、${planBOptionsJA[req.body.planB - 1]}。 それでもダメなら予約を諦めてください。
        8. スタッフに感謝して電話を切ってください。

        会話の例:
        あなた: こんにちは、7月25日の19時に3名で予約をお願いできまでしょうか？
        レストラン: はい、25日の19時ですね。ではお名前と電話番号をお願いします。
        あなた: 名前はジョン・スミス、電話番号は09012345678です。
        レストラン: ありがとうございます、では7月25日の19時にお待ちしております。
        あなた: ありがとうございます、では失礼します。
    `;

    console.log(req.body.language==="ja" ? taskJA : task);

    const data = {
        "phone_number": req.body.restaurantPhone,
        "from": null,
        "task": req.body.language==="ja" ? taskJA : task,
        "model": "enhanced",
        "language": req.body.language,
        "voice": req.body.language==="ja" ? "0bcb8f02-3950-4e87-a988-6c65be206f30" : "nat",
        "voice_settings": {},
        "pathway_id": null,
        "local_dialing": false,
        "max_duration": 5,
        "answered_by_enabled": false,
        "wait_for_greeting": false,
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
        "analysis_schema": {
            "is_reservation_successful": "boolean",
        },
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

app.post('/email', async (req, res) => {
    console.log('Email requested:', req.body);

    const url = process.env.ZAPIER_WEBHOOK;

    try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json'},
          body: JSON.stringify(req.body)
        })
          .then((response) => {
            return response.json();
          })
          .then((response) => {
            console.log(response);
          });
      } catch (error) {
        console.error(error);
      }
    
    res.status(200).send({
        response: 'Email sent'
    });
});

app.use((req, res, next) => {
    res.status(404).send('Not Found');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Webhook receiver listening on port ${PORT}`);
});