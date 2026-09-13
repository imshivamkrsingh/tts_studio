"""
Vocalize — a small text-to-speech studio.

Uses edge-tts (Microsoft Edge's free neural TTS service) so no API key is
required, while still getting a real choice of male / female neural voices
per language, plus rate and pitch control. Requires an internet connection
at runtime, since edge-tts calls out to Microsoft's service.
"""
import asyncio
import os
import uuid
from datetime import datetime

import edge_tts
from flask import Flask, render_template, request, jsonify, send_from_directory, abort

APP_DIR = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(APP_DIR, "static", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

MAX_CHARS = 3000
AUDIO_SPEC = "MP3 · 48 kbps · 24 kHz"

# Maps locale codes to display names. This — not the FriendlyName string
# Microsoft returns — is what voices get grouped by, so a Male and a Female
# voice for the same locale always land under the exact same "Language"
# value and the gender toggle actually has something to switch between.
LOCALE_NAMES = {
    "en-US": "English (US)", "en-GB": "English (UK)", "en-AU": "English (Australia)",
    "en-IN": "English (India)", "en-CA": "English (Canada)", "en-IE": "English (Ireland)",
    "en-ZA": "English (South Africa)", "en-NZ": "English (New Zealand)", "en-PH": "English (Philippines)",
    "es-ES": "Spanish (Spain)", "es-MX": "Spanish (Mexico)", "es-US": "Spanish (US)",
    "es-AR": "Spanish (Argentina)", "es-CO": "Spanish (Colombia)",
    "fr-FR": "French", "fr-CA": "French (Canada)", "fr-BE": "French (Belgium)", "fr-CH": "French (Switzerland)",
    "de-DE": "German", "de-AT": "German (Austria)", "de-CH": "German (Switzerland)",
    "it-IT": "Italian", "it-CH": "Italian (Switzerland)",
    "pt-BR": "Portuguese (Brazil)", "pt-PT": "Portuguese (Portugal)",
    "nl-NL": "Dutch", "nl-BE": "Dutch (Belgium)",
    "ja-JP": "Japanese", "ko-KR": "Korean",
    "zh-CN": "Chinese (Mandarin)", "zh-TW": "Chinese (Taiwan)", "zh-HK": "Chinese (Hong Kong)",
    "hi-IN": "Hindi", "bn-IN": "Bengali (India)", "bn-BD": "Bengali (Bangladesh)",
    "ta-IN": "Tamil", "te-IN": "Telugu", "mr-IN": "Marathi", "gu-IN": "Gujarati",
    "kn-IN": "Kannada", "ml-IN": "Malayalam", "pa-IN": "Punjabi", "ur-PK": "Urdu",
    "ar-SA": "Arabic (Saudi Arabia)", "ar-EG": "Arabic (Egypt)", "ar-AE": "Arabic (UAE)",
    "ru-RU": "Russian", "uk-UA": "Ukrainian", "pl-PL": "Polish", "cs-CZ": "Czech",
    "sk-SK": "Slovak", "hu-HU": "Hungarian", "ro-RO": "Romanian", "bg-BG": "Bulgarian",
    "hr-HR": "Croatian", "sr-RS": "Serbian", "sl-SI": "Slovenian",
    "el-GR": "Greek", "tr-TR": "Turkish", "he-IL": "Hebrew", "fa-IR": "Persian",
    "sv-SE": "Swedish", "nb-NO": "Norwegian", "da-DK": "Danish", "fi-FI": "Finnish",
    "et-EE": "Estonian", "lv-LV": "Latvian", "lt-LT": "Lithuanian",
    "th-TH": "Thai", "vi-VN": "Vietnamese", "id-ID": "Indonesian", "ms-MY": "Malay",
    "fil-PH": "Filipino", "sw-KE": "Swahili", "af-ZA": "Afrikaans",
}


def locale_label(locale):
    return LOCALE_NAMES.get(locale, locale)


# Curated fallback voices — used if the live catalog can't be fetched (e.g. no
# internet yet). Covers common languages with a Male and Female neural voice
# each, which is exactly the male/female choice the UI needs either way.
_FALLBACK_RAW = [
    ("en-US-GuyNeural", "Male", "en-US"), ("en-US-JennyNeural", "Female", "en-US"),
    ("en-US-DavisNeural", "Male", "en-US"), ("en-US-AriaNeural", "Female", "en-US"),
    ("en-GB-RyanNeural", "Male", "en-GB"), ("en-GB-SoniaNeural", "Female", "en-GB"),
    ("en-AU-WilliamNeural", "Male", "en-AU"), ("en-AU-NatashaNeural", "Female", "en-AU"),
    ("en-IN-PrabhatNeural", "Male", "en-IN"), ("en-IN-NeerjaNeural", "Female", "en-IN"),
    ("es-ES-AlvaroNeural", "Male", "es-ES"), ("es-ES-ElviraNeural", "Female", "es-ES"),
    ("es-MX-JorgeNeural", "Male", "es-MX"), ("es-MX-DaliaNeural", "Female", "es-MX"),
    ("fr-FR-HenriNeural", "Male", "fr-FR"), ("fr-FR-DeniseNeural", "Female", "fr-FR"),
    ("de-DE-ConradNeural", "Male", "de-DE"), ("de-DE-KatjaNeural", "Female", "de-DE"),
    ("it-IT-DiegoNeural", "Male", "it-IT"), ("it-IT-ElsaNeural", "Female", "it-IT"),
    ("pt-BR-AntonioNeural", "Male", "pt-BR"), ("pt-BR-FranciscaNeural", "Female", "pt-BR"),
    ("ja-JP-KeitaNeural", "Male", "ja-JP"), ("ja-JP-NanamiNeural", "Female", "ja-JP"),
    ("ko-KR-InJoonNeural", "Male", "ko-KR"), ("ko-KR-SunHiNeural", "Female", "ko-KR"),
    ("zh-CN-YunxiNeural", "Male", "zh-CN"), ("zh-CN-XiaoxiaoNeural", "Female", "zh-CN"),
    ("hi-IN-MadhurNeural", "Male", "hi-IN"), ("hi-IN-SwaraNeural", "Female", "hi-IN"),
    ("ar-SA-HamedNeural", "Male", "ar-SA"), ("ar-SA-ZariyahNeural", "Female", "ar-SA"),
    ("ru-RU-DmitryNeural", "Male", "ru-RU"), ("ru-RU-SvetlanaNeural", "Female", "ru-RU"),
    ("tr-TR-AhmetNeural", "Male", "tr-TR"), ("tr-TR-EmelNeural", "Female", "tr-TR"),
    ("nl-NL-MaartenNeural", "Male", "nl-NL"), ("nl-NL-ColetteNeural", "Female", "nl-NL"),
    ("pl-PL-MarekNeural", "Male", "pl-PL"), ("pl-PL-ZofiaNeural", "Female", "pl-PL"),
]

FALLBACK_VOICES = [
    {"ShortName": sn, "Gender": g, "Locale": loc, "Language": locale_label(loc)}
    for sn, g, loc in _FALLBACK_RAW
]

# Pacing presets shown as quick-select buttons in the UI.
PACING_PRESETS = [
    {"value": "-15%", "label": "0.85x"},
    {"value": "+0%", "label": "1.0x", "default": True},
    {"value": "+10%", "label": "1.1x"},
    {"value": "+25%", "label": "1.25x"},
]

# Pitch presets — subtle shifts so voices stay natural.
PITCH_PRESETS = [
    {"value": "-15Hz", "label": "Low"},
    {"value": "+0Hz", "label": "Normal", "default": True},
    {"value": "+15Hz", "label": "High"},
]

_voice_cache = None


def get_voices():
    """Return the voice catalog, live-fetched once and cached, falling back
    to the curated list if edge-tts can't reach the network."""
    global _voice_cache
    if _voice_cache is not None:
        return _voice_cache
    try:
        raw = asyncio.run(asyncio.wait_for(edge_tts.list_voices(), timeout=6))
        voices = []
        for v in raw:
            if not v["ShortName"].endswith("Neural"):
                continue
            locale = v["Locale"]
            voices.append({
                "ShortName": v["ShortName"],
                "Gender": v["Gender"],
                "Locale": locale,
                "Language": locale_label(locale),
            })
        _voice_cache = voices if voices else FALLBACK_VOICES
    except Exception:
        _voice_cache = FALLBACK_VOICES
    return _voice_cache


history = []

app = Flask(__name__)


@app.route("/")
def index():
    voices = get_voices()
    return render_template(
        "index.html",
        voices=voices,
        pacing_presets=PACING_PRESETS,
        pitch_presets=PITCH_PRESETS,
        max_chars=MAX_CHARS,
        audio_spec=AUDIO_SPEC,
    )


@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    voice = (data.get("voice") or "en-US-JennyNeural").strip()
    rate = (data.get("rate") or "+0%").strip()
    pitch = (data.get("pitch") or "+0Hz").strip()

    if not text:
        return jsonify({"error": "Type or paste some text first."}), 400
    if len(text) > MAX_CHARS:
        return jsonify({"error": f"That's {len(text)} characters — keep it under {MAX_CHARS}."}), 400

    known = {v["ShortName"] for v in get_voices()} | {v["ShortName"] for v in FALLBACK_VOICES}
    if voice not in known:
        return jsonify({"error": "Unknown voice."}), 400

    filename = f"{uuid.uuid4().hex}.mp3"
    filepath = os.path.join(AUDIO_DIR, filename)

    async def synthesize():
        communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate, pitch=pitch)
        await communicate.save(filepath)

    try:
        asyncio.run(synthesize())
    except Exception as exc:
        return jsonify({"error": f"Couldn't generate audio: {exc}"}), 502

    voice_meta = next((v for v in get_voices() if v["ShortName"] == voice), None) or {}

    entry = {
        "id": filename,
        "text": text,
        "preview": text if len(text) <= 80 else text[:77] + "...",
        "voice": voice,
        "voice_label": voice.split("-")[-1].replace("Neural", ""),
        "gender": voice_meta.get("Gender", ""),
        "language": voice_meta.get("Language", ""),
        "rate": rate,
        "pitch": pitch,
        "url": f"/audio/{filename}",
        "created_at": datetime.now().strftime("%H:%M:%S"),
        "chars": len(text),
    }
    history.insert(0, entry)
    del history[50:]

    return jsonify({"ok": True, "entry": entry})


@app.route("/api/history")
def get_history():
    return jsonify({"history": history})


@app.route("/api/history/<entry_id>", methods=["DELETE"])
def delete_history_entry(entry_id):
    global history
    match = next((e for e in history if e["id"] == entry_id), None)
    if not match:
        return jsonify({"error": "Not found"}), 404
    history = [e for e in history if e["id"] != entry_id]
    filepath = os.path.join(AUDIO_DIR, entry_id)
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
        except OSError:
            pass
    return jsonify({"ok": True})


@app.route("/audio/<path:filename>")
def serve_audio(filename):
    if "/" in filename or "\\" in filename:
        abort(400)
    return send_from_directory(AUDIO_DIR, filename)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
