# Vocalize — a small text-to-speech studio

A Flask web app that turns text into spoken audio using **edge-tts**
(Microsoft Edge's free neural TTS service). No API key needed — but it does
need an internet connection at runtime, since edge-tts calls out to
Microsoft to do the speech synthesis.

## Features

- **Male and female neural voices** across ~40 languages (curated fallback;
  the app also tries to live-fetch Microsoft's full voice catalog — 300+
  voices — on first load and falls back automatically if that's unreachable)
- Language selector, with a gender toggle and a specific-voice picker underneath
- **Pacing presets** — 0.85x, 1.0x, 1.1x, 1.25x
- **Pitch presets** — Low, Normal, High
- In-browser player with a live waveform driven by the actual audio (Web Audio API)
- Draggable seek bar with current / total time
- Transport controls: restart, back 5s, play/pause, forward 5s, loop, volume
- One-click **Export MP3**
- Session history of recent generations, with play and remove

Output audio is MP3, 48 kbps CBR, 24 kHz mono (edge-tts's default format).

## Setup

```bash
cd tts_studio
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Then open **http://127.0.0.1:5000** in your browser.

## Deploying on Render

Render's default start command is `gunicorn app:app`, but two things need
to be right for that to work:

1. **`gunicorn` must be in `requirements.txt`** — it now is.
2. **It must bind to the port Render gives you**, not its own default. Set
   the Render service's **Start Command** to:

   ```
   gunicorn app:app --bind 0.0.0.0:$PORT
   ```

   (A `Procfile` with this exact command is included, so Render should pick
   it up automatically — but if you've set a custom Start Command in the
   dashboard, update it to match, since a dashboard setting overrides the
   Procfile.)

One more thing worth knowing for Render specifically: the free tier's
filesystem is ephemeral, so anything saved to `static/audio/` disappears on
every redeploy/restart — fine for a demo, but don't rely on it for
long-term storage.

## Notes

- Generated MP3s are saved to `static/audio/`. History is in-memory only (it
  resets when you restart the server); audio files are deleted from disk
  when you remove an item from Recent, but not automatically on restart —
  clear `static/audio/` periodically if you run this for a long time.
- Text is capped at 3000 characters per request (`MAX_CHARS` in `app.py`).
- The voice catalog is fetched live once per server process and cached in
  memory (`get_voices()` in `app.py`). If your network is unavailable at
  startup, it silently falls back to the curated `FALLBACK_VOICES` list,
  which still covers ~20 languages with a male and female voice each.
- This is a single-user local app: history is a plain in-memory list, not
  tied to sessions or accounts. Don't deploy it publicly as-is.
