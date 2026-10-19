# BAVSA: launch guide

This folder is the full BAVSA website. It costs **$0** to run, and students don't need to pay or make an extra account:

| Piece | What it does | Cost |
|---|---|---|
| **Vercel** (Hobby plan) | Hosts the website at a link like `bavsa.vercel.app` | Free. Keep BAVSA non-commercial (no ads, payments or donations). |
| **Bavi's AI** | Runs on each student's own phone with a small open-source model (Qwen2.5, Apache-2.0 license). The first use downloads about 1 GB. | Free for everyone, no account. |
| *Optional:* "Smarter answers" | A student can switch Bavi to their own free Puter account in Settings for better answers. Phones that can't run the on-device AI are offered this too. | The student's own free Puter allowance. Never you. |
| **Firebase** (Spark plan), *optional* | Google sign-in and class chats | Free, no credit card. Add it whenever you're ready (Part 2). |

---

## Part 1: Launch today (about 15 minutes)

Everything works except class chats.

1. **GitHub:** make a free account at **github.com**. Click **New repository**, name it `bavsa`, and click **Create repository**. Click **uploading an existing file**, drag in **everything in this folder**, and click **Commit changes**.
2. **Vercel:** go to **vercel.com** and sign up with GitHub (free **Hobby** plan). Click **Add New → Project**, choose `bavsa`, click **Import**, leave the settings alone (framework: **Other**) and click **Deploy**.
3. In about a minute you'll get your link, like `bavsa-abc123.vercel.app`. That's your live app. You can rename it under **Settings → Domains**.
4. **Try it on your phone:** open the link, go through setup, and ask Bavi something. Tap **Download** the first time (use Wi-Fi). After that, Bavi answers right on the phone.
5. **Make it feel like an app:** in Safari tap **Share → Add to Home Screen**, or in Chrome tap **⋮ → Add to Home screen**.

## Part 2: Turn on class chats (about 30 minutes, any time later)

1. Go to **console.firebase.google.com** and click **Create a project** named `bavsa` (you can turn Analytics off).
2. **Build → Authentication → Get started → Google**, switch it on, pick a support email, and **Save**.
3. **Build → Firestore Database → Create database** in **production mode**. Open the **Rules** tab, replace everything with the contents of `firestore.rules`, and click **Publish**.
4. Click the gear icon, then **Project settings → Your apps → web icon `</>`**. Name it `BAVSA` and click **Register app**. Copy the settings into `firebase-config.js` (replace the placeholder values).
5. On GitHub, open `firebase-config.js`, click the pencil icon, paste your version, and click **Commit changes**. Vercel updates the site automatically.
6. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain** and add your Vercel address.
7. Open the app, go to **Chats**, and tap **Sign in with Google**.

## Good to know

- **Which phones run Bavi on-device:** recent iPhones (iOS 26 or newer, in Safari) and recent Android phones (in Chrome). Older or low-memory phones get offered *Smarter answers* instead.
- **On-device Bavi is smaller and less smart** than cloud AI. It's good for explanations, translations, quizzes and plans, but can make mistakes on hard math. For photos, it reads printed text. Handwriting and diagrams work much better with *Smarter answers*.
- **Updating BAVSA:** change or re-upload a file on GitHub, and Vercel publishes it within a minute or two.
- **Reports and contact messages** (once Firebase is on): Firebase console → **Firestore Database** → `schools → … → reports`, and `support`. Check these regularly. You can delete messages and disable accounts under **Authentication → Users**.
- **Before sharing widely:** fill in `privacy.html` with an adult's help. BAVSA is for students **13 and older**. Keep the "Bavi is an AI" notes in place.
- **App Store and Google Play (later):** the site can be wrapped into a phone app with a tool like Capacitor. Apple and Google charge developer fees. Ask for help when you get there.
