# Notifications when the app is closed: one-time setup

What it does: when a mate presses **I'm lost**, sends you a sticker or a **Meet up** spot, your phone shows a notification even
if the app is closed. It costs nothing: Cloudflare's free plan (no card needed) runs a tiny program, the "worker", that passes
the notification on.

You do this once, on any phone or computer. It takes about 15 minutes. Until it's done, Tools › Friends › Notifications says
"Not set up yet" and alerts pop up only while the app is open.

## 1. Make a free Cloudflare account
1. Go to **dash.cloudflare.com/sign-up**, sign up with your email and a password, and confirm the email.
2. Pick the **Free** plan if it asks. Don't add a card: nothing here needs one.

## 2. Make the worker
1. In Cloudflare, open **Workers & Pages** (in the menu) and tap **Create**, then **Create Worker** (or "Start with Hello World").
2. Name it `sea-trip-push` and tap **Deploy**.
3. Tap **Edit code**. Delete everything in the editor.
4. On GitHub, open this repository's `push/worker.js`, tap **Raw**, select all and copy it. Paste it into Cloudflare's editor.
5. Tap **Deploy** (top right).
6. Copy the worker's address. It looks like `https://sea-trip-push.YOURNAME.workers.dev`. Keep it for step 5.

## 3. Make the keys (on your phone, in the app)
1. Make sure your phone is the developer phone (you typed ELITE POTATO, so Tools › Developer is there).
2. Open **Tools › Friends**, scroll to **Notifications**, open **Developer: make the notification keys** and tap **Make keys**.
3. You'll see two boxes: **VAPID_PUBLIC** (one long line) and **VAPID_PRIVATE** (starts with `{`). Copy each one somewhere
   safe, like a note. They aren't kept by the app, so if you lose them, just make new ones and do steps 4 and 5 again.

## 4. Give the worker its settings
In Cloudflare: **Workers & Pages › sea-trip-push › Settings › Variables and Secrets › Add**. Add these five. Use type **Text**
for all except VAPID_PRIVATE, which is type **Secret**:

| Name | Value |
|---|---|
| `DB_URL` | your Firebase database address: the `databaseURL` in your `config.js` (starts `https://` and ends `.firebasedatabase.app`) |
| `VAPID_PUBLIC` | the VAPID_PUBLIC from step 3 |
| `VAPID_PRIVATE` | the VAPID_PRIVATE from step 3 (type **Secret**) |
| `VAPID_SUBJECT` | `https://elitepotato57-lgtm.github.io/SEA-Trip-Claude-Code/` |
| `ALLOW_ORIGIN` | `https://elitepotato57-lgtm.github.io` |

Tap **Deploy** (or **Save and deploy**) at the end.

## 5. Tell the app where the worker is
1. On GitHub, open `config.js` and tap the pencil to edit it. **Don't delete anything that's already there.**
2. Add this line at the end, with your worker address from step 2 and your VAPID_PUBLIC from step 3:
   ```
   window.SEA_PUSH = {url:"https://sea-trip-push.YOURNAME.workers.dev", key:"PASTE-VAPID_PUBLIC-HERE"};
   ```
3. Tap **Commit changes**.

## 6. Re-publish the Firebase rules
The rules now include who may notify whom (`push` and `pushok`). Same as before (FIREBASE-SETUP.md): open the Firebase console ›
Realtime Database › **Rules**, replace everything with the contents of `firebase/database.rules.json` from GitHub, and tap
**Publish**.

## 7. Turn it on, phone by phone
1. Close and reopen the app twice (so it picks up the new `config.js`).
2. **iPhones only get notifications from the app added to the home screen** (iOS 16.4 or newer): in Safari, Share › **Add to
   Home Screen**, then always open it from that icon.
3. In the app: **Tools › Friends › Notifications › Turn on notifications**, and allow them when the phone asks. Everyone does this
   on their own phone.
4. Test it: ask a mate to send you a sticker while your app is closed.

## If something goes wrong
- "Not set up yet" in the app: step 5 isn't done, or the app hasn't been reopened twice since.
- "Notifications are blocked": iPhone Settings › Notifications › the app › Allow Notifications.
- Nothing arrives: check step 4's values (no spaces at the ends), and that step 6 was published. In Cloudflare, the worker's
  **Logs** tab shows each try and why it failed ("not allowed to notify this friend" means the friend hasn't turned
  notifications on yet).
- Free-plan limits: 100,000 notifications a day, far more than six people will use.
