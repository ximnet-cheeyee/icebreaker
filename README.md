# Icebreaker

Realtime multiplayer grid-navigation icebreaker game. Two modes:

- **Blind Navigator** — 2–4 teams, each with a Board-Mover who can see the grid and
  executes moves called out by teammates, in a strict per-team turn order. Teams play
  concurrently.
- **Hidden Saboteur** — everyone shares one board and one strict turn order. One
  secretly-selected player (the Saboteur) can see the target and quietly misdirects
  the group. Revealed only at the end.

Stack: React + Vite + TypeScript + Tailwind, Supabase (Postgres + Realtime), deployed
free on Vercel. No auth, no paid services.

---

## 1. Local setup

```bash
npm install
cp .env.example .env.local
# fill in .env.local with your Supabase project values (see section 2)
npm run dev
```

## 2. Supabase setup

1. Go to https://supabase.com → sign in → **New project**.
2. Pick a name/password/region, wait for provisioning (~2 min).
3. Left sidebar → **SQL Editor** → **New query**.
4. Paste the entire contents of `supabase/schema.sql` and click **Run**.
   This creates all tables, RLS policies, the authoritative `make_move` RPC, and
   adds every table to the `supabase_realtime` publication in one shot — you don't
   need to separately toggle anything under Database → Replication.
5. Left sidebar → **Project Settings → API**.
   - Copy **Project URL** → paste into `.env.local` as `VITE_SUPABASE_URL`.
   - Copy the **anon / publishable** key → paste as `VITE_SUPABASE_PUBLISHABLE_KEY`.
6. Restart `npm run dev` so Vite picks up the new env vars.

That's it — RLS policies are intentionally permissive (`using (true)`) since this is
an internal game with no accounts; see section 8 for the security tradeoffs.

## 3. Audio assets (optional — game works without them)

`AudioManager.ts` expects files at these exact paths under `public/`:

```
public/audio/bgm/lobby.ogg
public/audio/bgm/gameplay.ogg
public/audio/bgm/suspense.ogg
public/audio/bgm/victory.ogg
public/audio/sfx/button.ogg
public/audio/sfx/move.ogg
public/audio/sfx/boundary.ogg
public/audio/sfx/trap.ogg
public/audio/sfx/stun.ogg
public/audio/sfx/glitch.ogg
public/audio/sfx/target-found.ogg
public/audio/sfx/countdown.ogg
public/audio/sfx/reveal.ogg
public/audio/sfx/saboteur-reveal.ogg
```

Free CC0 sources: **pixabay.com/music**, **pixabay.com/sound-effects**, **kenney.nl**
(no attribution required). All `.play()` calls are wrapped in `.catch()`, so missing
files never break gameplay — you can ship without audio and add it later.

## 4. GitHub

```bash
git init
git add .
git commit -m "Icebreaker game"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/icebreaker.git
git push -u origin main
```

`.gitignore` already excludes `node_modules`, `dist`, and `.env*`.

## 5. Vercel deployment

1. Go to https://vercel.com → sign in with GitHub.
2. **Add New → Project** → import your `icebreaker` repo.
3. Framework preset: **Vite** (auto-detected).
4. Build command: `npm run build` (default). Output directory: `dist` (default).
5. **Environment Variables** — add both:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
6. Click **Deploy**.
7. Once live, open the URL, click **CREATE GAME**, then on another device open
   `https://your-app.vercel.app/join?room=CODE` (or scan the QR) to confirm deep
   links work — `vercel.json` in the repo root handles the SPA rewrite so this
   doesn't 404.

## 6. Local dev across multiple devices (testing before the event)

Run `npm run dev -- --host` so it binds to your LAN IP, then on phones on the same
Wi-Fi open `http://YOUR_LAN_IP:5173`. Faster than deploying for every test.

## 7. Game-day quick start

1. Open the deployed Vercel URL on the host laptop, connected to the TV.
2. **CREATE GAME.**
3. Tap the 🔊 icon once (unlocks audio on this device — required by browser
   autoplay policy).
4. Display the QR code on the TV; players scan with their phones.
5. Configure mode / grid size / victory condition / modifiers.
6. **Blind Navigator:** pick team count → **Shuffle Teams** → confirm/adjust
   Board-Movers.
7. **START GAME.**
8. Players call out directions to their Board-Mover (Blind Navigator) or take
   turns directly (Hidden Saboteur).
9. Use **Reveal Target** on the TV near the end for drama; **End Match** if needed.
10. After the match, **View History** → pick the match → **▶ Animate Path** to
    replay it (and reveal the Saboteur, if that mode was played).

## 8. Security notes

No login, no accounts — players just enter a name + room code. RLS policies are
open (`using (true)`) because this is meant for a private event with people you
trust in the room. The Saboteur's identity and hidden targets are simply never
sent to other players' queries, which is enough secrecy for a social game — this
is not designed to resist a technically adversarial player inspecting network
traffic.

## 9. Troubleshooting

- **Blank screen / "Room not found"** → check `.env.local` (or Vercel env vars)
  are set and you ran `supabase/schema.sql`.
- **Moves don't do anything** → check the Supabase SQL Editor logs; the `make_move`
  RPC raises exceptions (e.g. "Not your turn") that surface as thrown errors in
  the browser console.
- **QR code points to the wrong domain** → it's built from `window.location.origin`
  at render time, so this only happens if you open the host screen from a different
  domain than the one on the TV.
- **No sound** → confirm files exist at the exact paths in section 3, and that
  someone tapped the 🔊 toggle once (autoplay is blocked otherwise). Game remains
  fully playable without audio.