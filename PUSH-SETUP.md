# Alerts when the app is closed: one-time setup (about 10 minutes)

When someone taps **I'm lost**, their mates get the alert straight away if the app is open. With this set up, it also
pops up as a notification on phones where the app is **closed**.

It needs a tiny free "relay" on Cloudflare. A phone can't send these notifications by itself, because Apple only accepts
them signed with a secret key, and that key can't live in the app where anyone could read it. The relay keeps the key,
signs each alert and passes it on. It stores nothing. The free plan allows 100,000 requests a day, so it costs nothing
and needs no card.

You can do all of this on your phone.

## 1. Make the relay on Cloudflare
1. Go to **dash.cloudflare.com** and sign up (free), or log in.
2. Open **Workers & Pages** › **Create** › **Create Worker** (start from "Hello World").
3. Name it `sea-trip-push` and press **Deploy**.
4. Press **Edit code**. Delete everything in the editor.
5. Open https://raw.githubusercontent.com/elitepotato57-lgtm/SEA-Trip-Claude-Code/main/push/worker.mjs, select all of it,
   copy it, paste it into the editor and press **Deploy**.
6. Copy the Worker's address. It looks like `https://sea-trip-push.<your-name>.workers.dev`.

## 2. Make the keys in the app (your phone)
1. In the app, open **Tools › Developer › Alerts when the app is closed**.
2. Tap **Make the keys**. A box appears with a long secret starting `{"kty":"EC"`.
3. Tap **Copy the secret**. Don't close the page yet. The secret isn't kept anywhere else; if you lose it, just make new keys.

## 3. Give the secret to the relay
1. Back in Cloudflare, open your `sea-trip-push` Worker › **Settings** › **Variables and Secrets** › **Add**.
2. Type: **Secret**. Name: `VAPID_JWK` (exactly that). Value: paste the secret.
3. Press **Deploy** (or **Save**).

## 4. Tell the app where the relay is
1. In the app, in the same Developer section, paste the Worker's address into **Relay address** and tap **Save the address**.
2. **Re-publish the Firebase rules** (they have a new part for this): copy all of
   https://raw.githubusercontent.com/elitepotato57-lgtm/SEA-Trip-Claude-Code/main/firebase/database.rules.json into
   Firebase › Realtime Database › Rules and press **Publish**.

## 5. Each mate turns it on (once per phone)
1. The app must be **added to the Home Screen** (Share › Add to Home Screen) and opened from there. iPhones only allow
   notifications for apps on the Home Screen (iOS 16.4 or later).
2. Open **Tools › Friends**, scroll to **I'm lost** and tap **Get alerts when the app is closed**.
3. Tap **Allow** when the phone asks about notifications.

To check it works, tap **Send this phone a test alert** in Tools › Developer after turning alerts on, then close the app.
The notification should arrive within a few seconds.

## If it doesn't work
- **"The relay didn't answer"**: check the address (it starts with `https://` and ends with `workers.dev`) and that the
  secret is saved as `VAPID_JWK`. Opening the address in a browser should show `"ready":true`.
- **Nothing pops up**: check the phone's Settings › Notifications › SEA Trip is on, and Focus or Do Not Disturb is off.
- **Made new keys?** Paste the new secret into Cloudflare again (step 3). Phones switch to the new keys by themselves the
  next time they open Friends.
