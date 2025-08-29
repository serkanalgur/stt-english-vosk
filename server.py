import os
import json
import time
from flask import Flask, render_template, request
from flask_socketio import SocketIO

# Vosk imports
from vosk import Model, KaldiRecognizer

app = Flask(__name__, static_folder="static")
app.config["SECRET_KEY"] = "english-speech-recognition"
socketio = SocketIO(app, async_mode="gevent", cors_allowed_origins="*")

# Model path
MODEL_PATH = "/app/models/en"


def verify_model():
    """Verify the English model structure for older format"""
    if not os.path.exists(MODEL_PATH):
        print(f"❌ ERROR: Model directory {MODEL_PATH} does not exist!")
        return False

    # Older models have am/final.mdl instead of am.bin
    if not os.path.isfile(os.path.join(MODEL_PATH, "am", "final.mdl")):
        print("❌ ERROR: am/final.mdl is missing!")
        return False

    if not os.path.isdir(os.path.join(MODEL_PATH, "graph")):
        print("❌ ERROR: graph directory is missing!")
        return False

    if not os.path.isfile(os.path.join(MODEL_PATH, "conf", "mfcc.conf")):
        print("❌ ERROR: mfcc.conf is missing!")
        return False

    print("✅ Model structure verified successfully!")
    return True


# Initialize model at startup
print("🔍 Verifying English model at startup...")
if not verify_model():
    print(
        "❌ CRITICAL ERROR: English model is invalid or missing. Please check Docker build logs."
    )
    exit(1)

try:
    print(f"🔄 Loading English model from: {MODEL_PATH}")
    model = Model(MODEL_PATH)
    print("✅ English model loaded successfully!")
except Exception as e:
    print(f"❌ CRITICAL ERROR loading model: {str(e)}")
    exit(1)


@app.route("/")
def index():
    return render_template("index.html")


@socketio.on("connect")
def handle_connect():
    """Initialize environment when client connects"""
    print(f"Client connected: {request.sid}")
    # Initialize environment storage
    socketio.server.environ[request.sid] = {
        "connected_at": time.time(),
        "status": "connected",
    }
    socketio.emit("status", {"status": "connected"})
    print("Intialized environment for new connection")


@socketio.on("disconnect")
def handle_disconnect():
    """Clean up when client disconnects"""
    print(f"Client disconnected: {request.sid}")
    if request.sid in socketio.server.environ:
        if "recognizer" in socketio.server.environ[request.sid]:
            del socketio.server.environ[request.sid]["recognizer"]
        del socketio.server.environ[request.sid]


@socketio.on("start_recognition")
def handle_start_recognition():
    """Handle start recognition request"""
    # Create recognizer with 16kHz sample rate
    recognizer = KaldiRecognizer(model, 16000)

    # Store recognizer in session
    socketio.server.environ[request.sid]["recognizer"] = recognizer
    print(f"🎙️ Started recognition for {request.sid}")
    socketio.emit("status", {"status": "listening"})


@socketio.on("audio_data")
def handle_audio_data(*args):
    """Process audio chunks with variable arguments"""
    # Always use the first argument as audio data
    audio_data = args[0]

    # Check if recognizer exists for this session
    if (
        request.sid not in socketio.server.environ
        or "recognizer" not in socketio.server.environ[request.sid]
    ):
        return

    recognizer = socketio.server.environ[request.sid]["recognizer"]

    # Process audio chunk
    if recognizer.AcceptWaveform(audio_data):
        result = json.loads(recognizer.Result())
        text = result.get("text", "")
        if text:
            print(f"📝 Final result: {text}")
            socketio.emit("recognized", {"text": text, "final": True})
    else:
        partial = json.loads(recognizer.PartialResult())
        partial_text = partial.get("partial", "")
        if partial_text:
            socketio.emit("recognized", {"text": partial_text, "final": False})


@socketio.on("stop_recognition")
def handle_stop_recognition():
    """Clean up when recognition stops"""
    if (
        request.sid in socketio.server.environ
        and "recognizer" in socketio.server.environ[request.sid]
    ):
        del socketio.server.environ[request.sid]["recognizer"]
        print(f"⏹️ Stopped recognition for {request.sid}")
    socketio.emit("status", {"status": "stopped"})


if __name__ == "__main__":
    print("\n🚀 Starting English-only Speech Recognition Server")
    print("🔊 Listening on http://localhost:5000")
    socketio.run(app, host="0.0.0.0", port=5000, allow_unsafe_werkzeug=True)
