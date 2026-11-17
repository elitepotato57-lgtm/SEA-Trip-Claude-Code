# Switching on Friends (location sharing)

Friends lets you and your mates see each other on the map. It needs a free Firebase project (Google's) so phones can pass
locations to each other. The free plan ("Spark") needs no card. You do this once; everyone gets it.

## 1. Make the project (about 5 minutes)

1. Go to https://console.firebase.google.com and sign in with your Google account.
2. **Create a project**. Call it something like `sea-trip`. You can turn Google Analytics **off**.
3. Stay on the free **Spark** plan. Don't upgrade.

## 2. Turn on sign-in

1. In the left menu: **Build › Authentication › Get started**.
2. **Sign-in method › Anonymous › Enable › Save**. (Nobody types a password; each phone gets its own private ID.)

## 3. Make the database

1. **Build › Realtime Database › Create Database**.
2. Location: **Singapore (asia-southeast1)** (closest to Thailand and Bali).
3. Start in **locked mode**.
4. Open the **Rules** tab, delete what's there, paste everything from `firebase/database.rules.json` in this repo, and **Publish**.
   These rules mean: only you can change your own data, and your location can only be read by the friends you've switched on.
5. Copy the database address shown at the top of the Data tab. It looks like
   `https://sea-trip-default-rtdb.asia-southeast1.firebasedatabase.app`

## 4. Get the web settings

1. Click the cog (top left) › **Project settings** › **Your apps** › the `</>` (web) button.
2. Give it a nickname (`trip app`), don't tick Hosting, **Register app**.
3. You'll see a block of code with `apiKey: "…"`. Copy just the `apiKey` value.

## 5. Put them in config.js (on GitHub)

Open `config.js` in the repo on GitHub, click the pencil, and **add** this line under the Google key line (keep that one):

```js
window.SEA_FIREBASE = {apiKey: "PASTE-API-KEY", databaseURL: "PASTE-DATABASE-ADDRESS"};
```

Commit it. In a minute or two, close and reopen the app twice. **Tools › Friends** now works.

## When the rules change

New features sometimes need new rules (live split groups did). If something says "Firebase said no", open
**Realtime Database › Rules**, replace everything with the latest `firebase/database.rules.json` and **Publish** again.

## Developer phone (faces for everyone)

On your iPhone: type **ELITE POTATO** in the map search ("Developer mode on"). Then **Tools › Friends ›
Add friend › Make this phone the developer**. Only the first phone to do this gets it; the database refuses anyone else.
The developer phone gets a **Photo** button next to each friend (and **My photo**); the faces show for everyone.

## Using it

- Add your name, then **Send it** to share your 6-letter friend code in the group chat.
- Type a mate's code and **Add**. They see "Added you" and can add you back in one tap.
- **Share my location** is off until you turn it on. Each friend has their own switch: "Sees you" or "Hidden".
  Turning sharing off deletes your last position.
- Phones only send their position while the app is open (iPhones don't let web apps run in the background), so a
  friend's pin says when they were last seen.

## Good to know

- The `apiKey` for a Firebase web app isn't a password: it only says which project to talk to. The database rules are
  what keep locations private. Optionally, in Google Cloud Console › APIs & Services › Credentials, restrict the key to
  the website `elitepotato57-lgtm.github.io`.
- Free plan limits (1 GB stored, 10 GB downloaded a month, 100 phones connected at once) are far beyond what a group of mates uses.

## GitHub says the API key is leaked

GitHub warns about any Google key it sees, and the Firebase `apiKey` in `config.js` is one. A website has to send that key to
every phone, so it can't be hidden. It isn't a password: the database rules keep data private. What stops anyone else using
your key is locking it to this app:

1. Go to https://console.cloud.google.com/apis/credentials (same Google account) and pick your Firebase project at the top.
2. Click the key named **Browser key (auto created by Firebase)**.
3. **Application restrictions** › **Websites**. Add `https://elitepotato57-lgtm.github.io/*` and `http://localhost:8765/*`.
4. **API restrictions** › **Restrict key**. Tick **Identity Toolkit API** and **Token Service API** (those are all the app uses). Save.
5. Back on GitHub: **Security** › **Secret scanning** › open the alert › **Close as** › "Used in tests / false positive"
   (or "Revoked" if you made a new key and put it in `config.js` instead).

## New rules (stickers and messages)

Re-publish `firebase/database.rules.json` (Realtime Database › Rules › paste › Publish) so sticker messages work.
Message stickers: a developer phone (type **ELITE POTATO** in the map search) adds them under Friends › Add friend › Developer.

## New rules (games and the Trip tally)

The five games in **Friends › Play** need new rules: re-publish `firebase/database.rules.json` (Realtime Database › Rules ›
delete everything › paste › **Publish**). They replace the old Rock Paper Scissors rule (`games`) with:

- `parties`: a game. Only the people in it can see it or play; you can only start one with yourself in it.
- `tally`: the Trip tally. Everyone in the app can read it; each phone can only change its own wins.

Until you do, starting a game says "Firebase said no".
