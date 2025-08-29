// Initialize Socket.IO connection
const socket = io();

// DOM elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const transcriptionEl = document.getElementById('transcription');

// Audio variables
let audioContext;
let mediaStream;
let scriptProcessor;
let recognizing = false;

// Socket.IO event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    statusEl.textContent = 'Status: Connected - click Start to begin';
    startBtn.disabled = false;
});

socket.on('connect_error', (err) => {
    console.error('Connection error:', err);
    statusEl.textContent = `Status: Connection failed - ${err.message}`;
    alert(`Connection error: ${err.message}`);
});

socket.on('status', (data) => {
    if (data.status === 'listening') {
        statusEl.textContent = 'Status: Listening...';
        recognizing = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else if (data.status === 'connected') {
        statusEl.textContent = 'Status: Connected - click Start to begin';
        startBtn.disabled = false;
        stopBtn.disabled = true;
    } else {
        statusEl.textContent = 'Status: Not listening';
        recognizing = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
});

socket.on('recognized', (data) => {
    if (data.final) {
        const p = document.createElement('p');
        p.className = 'final';
        p.textContent = data.text;
        transcriptionEl.appendChild(p);
        transcriptionEl.scrollTop = transcriptionEl.scrollHeight;
    } else {
        // Update partial result
        const partials = transcriptionEl.querySelectorAll('.partial');
        if (partials.length > 0) {
            partials[partials.length - 1].textContent = data.text;
        } else if (data.text) {
            const p = document.createElement('p');
            p.className = 'partial';
            p.textContent = data.text;
            transcriptionEl.appendChild(p);
        }
        transcriptionEl.scrollTop = transcriptionEl.scrollHeight;
    }
});

socket.on('error', (data) => {
    console.error('Recognition error:', data.message);
    statusEl.innerHTML = `Status: Error - <span style="color: red;">${data.message}</span>`;
    alert(`Error: ${data.message}`);
    stopRecognition();
});

// Start recognition
startBtn.addEventListener('click', () => {
    socket.emit('start_recognition');

    statusEl.textContent = 'Status: Starting recognition...';
    startBtn.disabled = true;

    // Initialize audio if not already done
    if (!audioContext) {
        initAudio();
    }
});

// Stop recognition
stopBtn.addEventListener('click', () => {
    stopRecognition();
});

function stopRecognition() {
    socket.emit('stop_recognition');
    statusEl.textContent = 'Status: Stopping recognition...';
    recognizing = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    cleanupAudio();
}

function initAudio() {
    // Create audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
    });

    // Request microphone access
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
            mediaStream = stream;
            const source = audioContext.createMediaStreamSource(stream);

            // Create script processor for audio processing
            scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContext.destination);

            // Handle audio data
            scriptProcessor.onaudioprocess = (event) => {
                if (!recognizing) return;

                // Get audio data (mono channel)
                const audioData = event.inputBuffer.getChannelData(0);

                // Convert to 16-bit PCM
                const pcmData = new Int16Array(audioData.length);
                for (let i = 0; i < audioData.length; i++) {
                    pcmData[i] = audioData[i] * 32767;
                }

                // Send to server
                socket.emit('audio_data', pcmData.buffer, { binary: true, compress: false });
            };
        })
        .catch(err => {
            console.error('Microphone access denied:', err);
            alert('Microphone access is required for speech recognition');
            statusEl.innerHTML = `Status: <span style="color: red;">Microphone access denied</span>`;
            startBtn.disabled = false;
        });
}

function cleanupAudio() {
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (recognizing) {
        socket.emit('stop_recognition');
    }
    cleanupAudio();
});
