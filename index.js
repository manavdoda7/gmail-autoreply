const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
const base64 = require("./base64");

// If modifying these scopes, delete token.json.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}
let sent = new Set();
/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listLabels(auth) {
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.labels.list({
    userId: "me",
  });
  const labels = res.data.labels;
  if (!labels || labels.length === 0) {
    console.log("No labels found.");
    return;
  }
  console.log("Labels:");
  labels.forEach((label) => {
    console.log(`- ${label.name}`);
  });
}

function checkMail(msgId, auth) {
  console.log(msgId);
  const gmail = google.gmail({ version: "v1", auth });
  //This api call will fetch the mailbody.
  gmail.users.messages.get(
    {
      userId: "me",
      id: msgId,
    },
    (err, res) => {
      let email = res.data.payload.headers[16].value.split("<");
      email = email[1];
      email = email.substring(0, email.length - 1);
      console.log(email);
      let mins =
        (Number(new Date()) - Number(res.data.internalDate)) / 1000 / 60;
      console.log(mins);
      if (mins <= 1 && sent.has(email) == false) {
        sent.add(email);
        return email;
      }
    }
  );
  return -1;
}

function listMessages(auth, query) {
  return new Promise((resolve, reject) => {
    const gmail = google.gmail({ version: "v1", auth });
    gmail.users.messages.list(
      {
        userId: "me",
        maxResults: 100,
      },
      async (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        if (!res.data.messages) {
          resolve([]);
          return;
        }
        resolve(res.data);
        for (let i = 0; i < res.data.messages.length; i++) {
          let a = checkMail(res.data.messages[1].id, auth);
          if (a != -1) {
            const options = {
              to: a,
              subject: "I'm not available",
              text: "This email is sent from the command line",
              textEncoding: "base64",
              headers: [
                { key: "X-Application-Developer", value: "Manav Doda" },
                { key: "X-Application-Version", value: "v1.0.0.2" },
              ],
            };

            const sendMail = require("./sendMail");
            const messageId = await sendMail(options);
            console.log(messageId);
          }
        }
      }
    );
  });
}

setInterval(()=>authorize().then(listMessages).catch(console.error), 1000*60)
