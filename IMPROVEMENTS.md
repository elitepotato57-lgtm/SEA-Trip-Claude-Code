# Improvements pass (started 23 Nov 2026, before flying on 26 Nov)

A running log: what was checked, what was found, what changed, what was skipped and why.
Anything users can see that changed is an **experiment** (off by default, Tools › Developer › Experiments).
Pure bug fixes and invisible fixes are not.

## Phase 1: audit

### How it was checked
- `node tests/audit.js`: a 393 x 852 phone visits every tab and every Tools page (24 screens) with the pretend location in
  **Bangkok**, **Koh Phangan** and **Siem Reap**, and reports JavaScript errors, anything wider than the screen, tap targets under
  32 px, icon buttons with no label, empty links and broken pictures.
- `node tests/audit-offline.js`: first load on slow 4G (1.6 Mbit/s, 150 ms), memory with central Bangkok loaded, scrolling a long
  list, then Bangkok saved for offline and every tab opened in airplane mode.
- Facts on the route re-checked against gov.uk (its content API, fetched 23 Nov 2026): entry rules and emergency numbers for
  Thailand, Cambodia and Vietnam.
- Firebase rules (`firebase/database.rules.json`) read line by line.

### What was found
| # | Finding | How bad on the trip | Done |
|---|---|---|---|
| 1 | No JavaScript errors on any of the 72 screen visits, and nothing makes the page scroll sideways. | Good news | – |
| 2 | Settings › Testing: the "Pretend I'm in" menu stuck out 11 px past the screen edge (its padding was added on top of its width). | Small | Fixed (all `.field` menus and boxes now size with their padding included) |
| 3 | Chips that run past the screen edge (Munch, Activities, Translator, Emergency) are in rows that scroll sideways on purpose. | None | Audit taught to skip them |
| 4 | Small tap targets: only links inside sentences (sources, credits), which the accessibility guidelines exempt. Every button and icon is 32 px or more, and every icon button has a VoiceOver label. | None | – |
| 5 | Offline: after saving Bangkok, all 18 tabs and Tools pages open in airplane mode with no errors and nothing blank. Lists come from the saved city; pages that need signal (weather, translator, Friends, currency rates) say so. | Good news | – |
| 6 | Speed: on slow 4G the map is ready in about 5.5 s, with about 830 KB downloaded (GitHub Pages compresses the files; the test server now does the same so the numbers match). Memory with central Bangkok loaded is about 51 MB; scrolling the Munch list is smooth (20 steps in 0.3 s). | Fine | Test server compresses like the live site |
| 7 | Facts: Thailand visa-free stay 30 days (since 15 Sep 2026), digital arrival card (TDAC) within 3 days before arriving, emergency 191 / 1155 / 1669 / 199. Cambodia: visa needed, 30 days, e-visa at least 4 days ahead, 117 / 118 / 119. Vietnam: visa-free 45 days, 113 / 114 / 115 / 112. **All match what the app says.** | – | "Checked" dates for Thailand and Cambodia moved to 23 Nov 2026 |
| 8 | The map's base streets and the Wikimedia photos can't be reached from the test machine, so they weren't part of the speed or offline check. | – | Note only |

### Firebase rules: what's protected, and the risks
Protected properly: your location (`loc`) is readable only by the friends you switched "Sees you" on for; phone numbers (`phones`)
only by the friends you allow; messages, SOS alerts, invites and friend requests only by the person they're addressed to; live split
groups only by their members; the Google key only by developers and the friends a developer switched on; usage counts only by developers.

Risks, smallest first:
1. **Anyone with the app can sign in** (anonymous sign-in is how it works). Someone who somehow learned a person's private ID could
   send them a message, an invite, a friend request or a fake "I'm lost" alert. They can't read anything back. IDs are never shown
   in the app; friend codes are 6 random characters (about a billion possibilities).
2. **Message and alert sizes aren't capped**, so a malicious app user could write large junk into someone's inbox. Low risk with
   six mates; worth a size limit if the app goes public.
3. **Developers can make other developers**, and every developer can delete split groups, set everyone's photo, share the Google key
   and read usage. Phase 2 ties deleting groups to your phone only.
4. **No rate limits**: on the free plan, someone could fill the database. Firebase's free-plan limits stop the bill at £0 (the
   project has no card), so the worst case is the app's Friends features stop until the next month.

## Phase 2: split costs and alerts

### 1. Only Dylan's phone deletes split groups (done, not an experiment: a permissions fix)
Before: the Delete button showed on any developer phone, and the rules let any developer delete a group or take someone out.
Now there's an **owner** (`owner/` in Firebase): a developer phone claims it once (Tools › Developer › Owner), and from then on the
rules only let the owner delete a group's name or take people out, which is what deleting a group needs. The button shows only on the
owner's phone. Adding people, adding and deleting payments and everything else in Split costs are unchanged.
**Dylan must re-publish the rules and claim owner on his phone** (FIREBASE-SETUP.md).
