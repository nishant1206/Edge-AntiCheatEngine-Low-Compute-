# Part 1: Introduction to Edge-Assisted Anti-Cheat

Welcome to the **Edge-Assisted Anti-Cheat System**. Whether you are building an online examination platform, a competitive gaming tournament, or a secure remote-work environment, this library provides a highly scalable, mathematically rigorous, and cost-effective way to proctor users.

---

## 🛑 The Problem with Traditional Proctoring

Most modern anti-cheat and proctoring solutions (like Proctorio or Mettl) work by recording a candidate's webcam and microphone, streaming that heavy video data to a centralized cloud server, and running heavy AI models (like OpenCV or PyTorch) on the server to detect cheating.

This traditional approach has massive drawbacks:
1. **Insane Server Costs:** Processing live video feeds for 10,000 concurrent students requires hundreds of expensive GPU servers.
2. **High Latency:** Uploading 1080p video from a student with poor internet causes severe lag.
3. **Privacy Concerns:** Sending raw, intimate video of a student's bedroom to a 3rd-party server is a massive privacy risk.

---

## 🚀 The Edge-Assisted Solution

This library flips the architecture upside down. **"Edge"** means the computation happens directly on the candidate's own device (their browser or phone).

Instead of sending *video* to the server, this SDK runs **TensorFlow.js** and **Meyda DSP (Digital Signal Processing)** directly inside the user's browser via WebAssembly. 

The SDK mathematically converts what the camera and microphone see into tiny numbers (tensors and embeddings). It compares these numbers locally, and **only sends a tiny JSON alert (a few bytes)** to the server if someone actually cheats.

### The Benefits
- **$0 GPU Costs:** You do not need a single GPU to run this system. The candidate's laptop handles the heavy lifting.
- **Privacy First:** Raw video or audio never leaves the candidate's computer. Only mathematical confidence scores are sent.
- **Infinite Scalability:** A single, cheap $10 NodeJS server can easily handle 50,000+ concurrent users because it only receives lightweight JSON WebSockets.

---

## 🏗️ The 3-Layer Architecture

To understand how to use this library, you need to understand its 3 simple layers:

### Layer 1: The Edge SDK (What you put in your Frontend)
This is the JavaScript library you import into your React, Vue, or Vanilla JS frontend. It asks the user for Camera/Mic permissions, loads the AI models, and watches for anomalies (like someone else entering the room, or a different voice speaking).

### Layer 2: The Ingestion Gateway (The Highway)
This is a NodeJS WebSocket server. Its only job is to stay connected to all the students and accept their JSON alerts. It acts like a massive highway, dumping all incoming alerts directly into a highly optimized **Redis Stream**.

### Layer 3: The Analytics Worker (The Brain)
This is a background server process. It reads the alerts from Redis, checks if the student has triggered too many warnings in the last few seconds (throttling), and if so, it fires a standard **HTTP Webhook** to your actual company's database to disqualify the student.

---

# Part 2: Backend & Infrastructure Setup

Before you can add the Anti-Cheat SDK to your frontend website, you need to spin up the backend infrastructure (Layers 2 and 3) that will receive and process the cheating alerts.

Don't worry, because the AI runs on the Edge, this backend is extremely lightweight and cheap to host.

---

## 🛠️ Prerequisites

You will need the following running on your server (or locally for testing):
1. **Node.js** (v18+)
2. **MongoDB** (Usually running on port `27017`)
3. **Redis Server** (Usually running on port `6379`)

---

## Step 1: The Ingestion Gateway (WebSocket Server)

The Ingestion Gateway (`src/server.ts`) is the server your students will connect to. Its only job is to accept WebSocket connections, take the JSON alerts, and throw them into Redis as fast as possible.

### How to Run it:
Open your terminal in the root of the project and run:
```bash
npm install
npm run dev
```
*(In production, you would compile the TypeScript using `npm run build` and run `node dist/server.js`)*

### What happens under the hood?
When a student's SDK detects cheating (e.g., "Multiple faces detected"), it sends a JSON payload to this server.
The server instantly executes this command:
```typescript
await redis.xadd('telemetry:events', '*', 'data', rawString);
```
`XADD` is an ultra-fast Redis command that adds the data to a stream called `telemetry:events`. Because it doesn't do any heavy database lookups, this server can handle thousands of concurrent students easily.

---

## Step 2: The Analytics Worker (The Brain)

Now that Redis is filling up with cheating alerts, we need a background process to read them, decide if they are severe enough, and alert your company's database. This is the Analytics Worker (`src/worker.ts`).

### How to Run it:
Open a **second terminal** and run:
```bash
npx ts-node src/worker.ts
```

### What happens under the hood?
1. The worker connects to Redis using Consumer Groups (`XREADGROUP`). This means if your user base grows massively, you can just start 5 or 10 of these workers, and Redis will safely distribute the events among them without duplication!
2. It groups alerts by `session_id`. If a student triggers "Looking Away" 5 times in 2 seconds, the worker throttles it so you only get 1 clean alert.
3. It fetches the student's company Webhook URL from MongoDB.
4. It cryptographically signs the alert using HMAC-SHA256 (for security) and sends an HTTP POST request to the Webhook.

---

## Step 3: Your Company's Webhook Receiver

This Anti-Cheat system is designed to be a completely independent microservice. It doesn't write directly to your company's main user database. Instead, it sends Webhooks.

You need to create an endpoint (e.g., `POST https://api.yourcompany.com/anticheat-alert`) in your own backend (Python, PHP, Node, Java) to receive these alerts.

### Example: Testing the Webhook Locally
We have provided a dummy Webhook receiver so you can test the flow locally. 

Open a **third terminal** and run:
```bash
npx ts-node scripts/webhook-receiver.ts
```
This script will start a mock server on port `9999` and automatically insert a dummy configuration into MongoDB telling the Analytics worker to send alerts to `http://localhost:9999/webhook`.

### What the Webhook Payload looks like:
When cheating is detected, your company's server will receive a POST request looking exactly like this:
```json
{
  "incident_id": "6d13bed0-64e9-4804-bc7f-3f083804aa4f",
  "session_id": "candidate_uuid_123",
  "timestamp": 1781430923882,
  "threat_level": "WARNING",
  "trigger": "OTHER_PERSON_DETECTED",
  "evidence_metrics": {
    "anomaly_class": "OTHER_PERSON_DETECTED",
    "confidence": 0.85
  }
}
```

Now you can update your database (e.g., `UPDATE users SET status = 'disqualified' WHERE id = 'candidate_uuid_123'`).

---

## 🎉 Backend Complete!
Your backend is now fully operational and waiting for candidates to connect.

---

# Part 3: Frontend SDK Integration

Now that your backend is running, it's time to add the Edge AI into your actual frontend website (e.g., the page where a student takes their exam).

This SDK is framework agnostic. You can use it in React, Vue, Next.js, Angular, or pure Vanilla JS.

---

## 📦 Installation

Assuming you have published the SDK or linked it locally, install it via npm:

```bash
npm install edge-anticheat-sdk
```

*(Note: Because the AI models are lazy-loaded via CDNs, this library won't massively bloat your initial bundle size).*

---

## 🛠️ The Factory Pattern

You will **never** instantiate the individual engines (like `PrimaryPCEngine`) directly using the `new` keyword. Instead, the SDK uses the `AntiCheatEngineFactory`. 

This makes it incredibly simple to initialize. You just give it a configuration object, and it wires up all the complex TensorFlow pipelines for you.

---

## ⚛️ Integration Example: React / Next.js

Here is a complete, copy-paste ready example of how to build an Exam Room component in React.

```tsx
import React, { useState, useEffect } from 'react';
import { AntiCheatEngineFactory, PrimaryPCEngine } from 'edge-anticheat-sdk';

export default function ExamRoom({ candidateId }) {
    // Keep a reference to the engine so we can stop it later
    const [engine, setEngine] = useState<PrimaryPCEngine | null>(null);
    const [status, setStatus] = useState("Idle");

    const startExam = async () => {
        try {
            setStatus("Connecting to Backend...");

            // 1. Create the Engine via Factory
            const pce = AntiCheatEngineFactory.create({
                session_id: candidateId, 
                wss_url: "ws://localhost:8081", // Your Ingestion Gateway URL
                required_sensors: ["camera", "microphone", "screen"],
                device_role: "PRIMARY_PC"
            }) as PrimaryPCEngine;

            setStatus("Requesting Hardware Permissions...");

            // 2. Start the Engine (Prompts user for Camera/Mic/Screen)
            await pce.start();
            setEngine(pce);
            
            // --- CALIBRATION PHASE ---
            setStatus("Calibrating Voice... Please read the screen aloud.");
            
            // 3. Audio Calibration (We need ~50 frames of speech to build a baseline)
            let voiceFrames = 0;
            while(voiceFrames < 50) {
                // Returns true if voice is detected, false if silence
                if (pce.captureAudioBaselineFrame()) {
                    voiceFrames++;
                }
                // Poll every 100ms
                await new Promise(r => setTimeout(r, 100)); 
            }
            // Averages the voice frames into a unique mathematical signature
            pce.computeAudioBaseline();

            // 4. (Optional) Gaze Calibration
            setStatus("Calibrating Gaze... Look straight ahead.");
            await pce.calibrateGaze("CENTER");

            // --- EXAM START ---
            setStatus("Monitoring Active. You may begin the exam.");
            
            // 5. Start the AI Loop!
            // This runs infinitely in the background using requestAnimationFrame
            pce.startEdgeAI();

        } catch (error) {
            console.error("Failed to start Anti-Cheat:", error);
            setStatus("Error: " + error.message);
        }
    };

    // Cleanup when the user leaves the page
    useEffect(() => {
        return () => {
            if (engine) {
                engine.stop();
            }
        };
    }, [engine]);

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
            <h1>Exam Dashboard</h1>
            <p><strong>Status:</strong> {status}</p>
            
            <button 
                onClick={startExam} 
                disabled={status.includes("Active")}
                style={{ padding: '10px 20px', fontSize: '16px' }}
            >
                Start Exam & Anti-Cheat
            </button>

            {/* Your exam questions would go here */}
            {status.includes("Active") && (
                <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '20px' }}>
                    <h2>Question 1</h2>
                    <p>What is the capital of France?</p>
                    <input type="text" placeholder="Your answer..." />
                </div>
            )}
        </div>
    );
}
```

---

## 📜 Integration Example: Vanilla JavaScript

If you aren't using a framework, it's just as easy in pure HTML/JS.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Vanilla JS Exam</title>
</head>
<body>
    <button id="startBtn">Start Proctoring</button>
    <p id="statusTxt">Idle</p>

    <!-- Import as an ES Module -->
    <script type="module">
        import { AntiCheatEngineFactory } from './node_modules/edge-anticheat-sdk/dist/index.js';

        document.getElementById('startBtn').addEventListener('click', async () => {
            const statusTxt = document.getElementById('statusTxt');
            
            try {
                // 1. Create Engine
                const engine = AntiCheatEngineFactory.create({
                    session_id: "vanilla_test_1",
                    wss_url: "ws://localhost:8081",
                    required_sensors: ["camera"],
                    device_role: "PRIMARY_PC"
                });

                // 2. Start Hardware
                statusTxt.innerText = "Requesting Camera...";
                await engine.start();

                // 3. Skip complex calibration and just start AI
                statusTxt.innerText = "Monitoring...";
                engine.startEdgeAI();

            } catch(e) {
                statusTxt.innerText = "Error: " + e.message;
            }
        });
    </script>
</body>
</html>
```

## 🎉 Frontend Complete!
You now have a fully functional Edge-AI Anti-Cheat system protecting your web app!
 
# Part 4: The Mobile Sentinel (Secondary Device)

One of the biggest flaws in traditional webcam proctoring is the "Blind Spot". A candidate can easily hide a second phone or notes below their desk, out of the laptop webcam's field of view.

The Edge-Assisted Anti-Cheat System solves this by turning the candidate's own smartphone into a **Secondary Sentinel**. They place their phone beside them (like a 3rd-person security camera).

---

## 🔗 The Architecture of Cross-Device P2P

The Mobile Phone and the PC do not communicate directly via Bluetooth or local network (because that is notoriously unreliable across different OSs). 

Instead, they sync via the **Ingestion Gateway (WebSocket Server)** using the exact same `session_id`.

**The Flow:**
1. The PC generates a unique URL containing the `session_id`.
2. The PC displays this URL as a QR Code.
3. The candidate scans the QR Code with their phone.
4. The phone opens a web browser, instantiates the `SecondaryMobileEngine` using the same `session_id`, and connects to the same WebSocket server.
5. **The Magic:** If the PC detects suspicious audio (like whispering), it sends an alert to the server. The server instantly routes a `TRIGGER_REAR_SCAN` command to the Mobile phone. The phone then secretly activates its `COCO-SSD` object detection model to scan the room for "cell phones" or "other people"!

---

## 📱 Generating the QR Code (On the PC)

To pair the devices, you need to show a QR code on your React/Vue application.

```javascript
import QRCode from 'qrcode';
// Assuming 'pce' is your PrimaryPCEngine from Part 3

// 1. Get the candidate's session ID
const sessionId = "candidate_uuid_123";

// 2. (Optional but recommended) Export the Voice Signature so the phone knows what the user sounds like!
// Note: Only do this AFTER computeAudioBaseline() is finished.
const voiceSig = pce.exportAudioSignature();

// 3. Construct the pairing URL
const mobileUrl = `https://exam.yourcompany.com/mobile?session=${sessionId}&voice_sig=${voiceSig}`;

// 4. Render it to a <canvas> element
QRCode.toCanvas(document.getElementById('qr-canvas'), mobileUrl, function (error) {
    if (error) console.error("QR Code Error:", error);
    console.log("QR Code Generated!");
});
```

---

## 🚀 The Mobile Receiver App (On the Phone)

You need to host a secondary webpage specifically for the mobile device. When the candidate scans the QR code, they land here.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mobile Sentinel Active</title>
</head>
<body>
    <h1>Security Camera Active</h1>
    <p>Please place your phone beside you so we can see your desk.</p>
    
    <!-- We must show the video feed so the browser doesn't kill the tab -->
    <video id="mobile-video" autoplay playsinline style="width:100%; border-radius: 8px;"></video>

    <script type="module">
        import { AntiCheatEngineFactory } from './node_modules/edge-anticheat-sdk/dist/index.js';

        // 1. Parse the URL Parameters
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session');
        const voiceSig = urlParams.get('voice_sig');

        if (!sessionId) {
            alert("Invalid QR Code!");
            throw new Error("Missing Session ID");
        }

        // 2. Create the Mobile Engine
        const mobileEngine = AntiCheatEngineFactory.create({
            session_id: sessionId,
            wss_url: "ws://your-ingestion-gateway:8081",
            required_sensors: ["camera"], // We only need the rear camera
            device_role: "SECONDARY_MOBILE"
        });

        // 3. Import the Voice Signature (If provided)
        if (voiceSig) {
            mobileEngine.importAudioSignature(voiceSig);
        }

        // 4. Start the Engine (Requests Rear Camera)
        await mobileEngine.start();

        // Attach video feed to DOM
        const videoElement = document.getElementById('mobile-video');
        videoElement.srcObject = mobileEngine.getMediaStream();

        // 5. Start Listening!
        // The mobile engine will now sit idly waiting for the Ingestion Server
        // to send a TRIGGER_REAR_SCAN command.
        mobileEngine.startEdgeAI();

    </script>
</body>
</html>
```

---

## 🧠 Dual-Mode Security: Continuous + Triggered

The Mobile Sentinel actually uses a highly optimized **Dual-Mode** approach to maximize security without completely destroying the phone's battery:

1. **Continuous Front Scan:** The phone's front camera constantly monitors the desk area. It runs a lightweight `COCO-SSD` loop looking for forbidden objects (cell phones, books) or multiple people entering its field of view. If detected, it fires an anomaly immediately.
2. **Triggered Rear Scan (The "Blind Spot" Check):** If the PC detects suspicious audio (like whispering), the server routes a `TRIGGER_REAR_SCAN` command to the phone. The phone *temporarily* turns off the front camera, silently switches to the **rear camera** for 5 seconds to scan the rest of the room, and then switches back. 

This ensures that the entire environment is secured from multiple angles!

---

# Part 5: Architecture Workflows (Sequence & Flows)

To truly understand this SDK, you must understand the exact sequence in which functions are executed. This document breaks down the "Flow" of data and execution from the moment a user clicks "Start Exam" to the moment a cheating webhook fires.

---

## Flow 1: The Bootstrapping Process (Initialization)

When you initialize the Anti-Cheat system, a very specific sequence of events occurs to ensure the hardware is ready and the AI models are downloaded into the browser's WebGL memory.

1. **`AntiCheatEngineFactory.create(config)`**
   - **What it does:** Reads the `device_role` from the config. 
   - **Flow:** If `PRIMARY_PC`, it returns a `new PrimaryPCEngine()`. If `SECONDARY_MOBILE`, it returns a `new SecondaryMobileEngine()`.

2. **`await engine.start()`**
   - **What it does:** This is the big initialization step.
   - **Flow:**
     - It loops through your `config.required_sensors` array (`["camera", "microphone", "screen"]`).
     - It calls `CameraManager.initialize("user")` -> This triggers the browser popup: *"localhost wants to use your camera"*.
     - It calls `MicrophoneManager.initialize()` -> Triggers the microphone popup.
     - It calls `ScreenManager.initialize()` -> Triggers the screen-sharing prompt.
     - Once hardware is secured, it instantiates the Pipelines (`PCVisionPipeline` and `AudioPipeline`).
     - It calls `pipeline.initialize()`, which executes `tf.setBackend('webgl')` and downloads `BlazeFace`, `MobileNet`, and `Meyda`.
     - Finally, it establishes the WebSocket connection to the Ingestion Gateway via `NetworkClient.connect()`.

---

## Flow 2: The AI Loop (The Heartbeat)

The SDK does not use `setInterval` because that blocks the main thread and freezes the UI. Instead, it uses an "Adaptive Game Loop" built on `requestAnimationFrame`.

1. **`engine.startEdgeAI()` is called.**
2. **`BaseEngine.startAdaptiveLoop()` begins.**
   - **What it does:** It captures the current hardware time using `performance.now()`.
   - **Flow:**
     - It checks the `targetFPS` (usually `5` frames per second).
     - If enough time has passed (e.g., 200ms), it calls the abstract `onFrame()` method.
     - `onFrame()` calls `visionPipeline.processFrame()` and `screenManager.checkFocus()`.
     - `processFrame()` takes the current `<video>` frame, passes it to TensorFlow, and evaluates it.
     - The loop immediately schedules itself again using `window.requestAnimationFrame(loop)`.

*(This architecture guarantees that the AI processing only happens as fast as the browser can render, preventing older laptops from crashing).*

---

## Flow 3: The Anomaly Journey (How a Cheat gets caught)

What exactly happens when a candidate looks away from the screen?

1. **Detection in the Pipeline:**
   - `PCVisionPipeline.processFrame()` pulls the camera frame.
   - It runs `BlazeFace` to find the eyes, nose, and mouth.
   - It runs the internal KNN Classifier. The classifier says: *"This geometry matches the 'LEFT' pose with 95% confidence."*
   - Because "LEFT" is not the center screen, the pipeline executes: `this.reporter.reportAnomaly("GAZE_DISPLACEMENT", 0.95);`

2. **Throttling in `AnomalyEngine`:**
   - The `reportAnomaly()` function is fired.
   - The `AnomalyEngine` checks its internal state: *"Did I already report GAZE_DISPLACEMENT in the last 3000ms?"*
   - If yes -> It ignores it (to prevent spamming the server 5 times a second).
   - If no -> It updates the last-sent timestamp and calls `NetworkClient.sendPayload()`.

3. **Transmission in `NetworkClient`:**
   - Formats the data into a strict JSON payload: `{ session_id: "123", event_type: "ANOMALY", payload: { anomaly_class: "GAZE_DISPLACEMENT", confidence: 0.95 } }`.
   - Sends it over the WebSocket stringified.

4. **Ingestion Gateway (`server.ts`):**
   - Receives the JSON string.
   - Does ZERO validation (for extreme speed).
   - Immediately executes `redis.xadd('telemetry:events', ...)` dumping it into Redis.

5. **Analytics Engine (`worker.ts`):**
   - Pulls the raw JSON from Redis.
   - Queries MongoDB to find the Webhook URL for the client.
   - Calculates a cryptographic signature using `crypto.createHmac`.
   - Fires a standard HTTP POST request to the customer's backend.

---

## Flow 4: The Mobile Cross-Device Trigger

This is the most complex flow, demonstrating the P2P routing over the WebSocket.

1. PC Audio Pipeline detects someone whispering (`UNAUTHORIZED_SPEECH`).
2. PC sends the `ANOMALY` to `server.ts` (Gateway).
3. The Gateway notices this is a PC anomaly. It searches its active WebSocket connections for any device tagged as `SECONDARY_MOBILE` that has the exact same `session_id`.
4. The Gateway sends a `TRIGGER_REAR_SCAN` WebSocket payload down to the Mobile Phone.
5. The Mobile Phone receives this in `NetworkClient.ts`, which triggers the callback `onTriggerRearScan()`.
6. The `SecondaryMobileEngine` intercepts this and calls `visionPipeline.executeSilentRearScan()`.
7. **The Mobile Vision Pipeline temporarily turns off the front camera, turns on the rear camera, runs `COCO-SSD` for 5 seconds to search for hidden phones, and then turns the front camera back on.**

---

# Part 6: API Reference Deep Dive (Every Function & Byte)

This document is the absolute deepest level of documentation available for the Edge-Assisted Anti-Cheat System. It documents every single internal file, class, interface, and property within the `src/sdk/` directory.

---

## 📁 `src/sdk/core/` (The Foundation)

### 1. `types.ts`
Contains the TypeScript interfaces used across the application.
- **`EngineConfig`**: The required config object. Contains `session_id`, `wss_url`, `required_sensors`, and `device_role`.
- **`EdgeEventPayload`**: The strict JSON format sent to the server. Includes `anomaly_class` (e.g., `"UNAUTHORIZED_SPEECH"`) and a `confidence` float.
- **`IAnomalyReporter`**: An interface defining `reportAnomaly`, `sendDebugFrame`, and `sendHeartbeat`.
- **`IPipeline`**: An interface all AI pipelines must implement (`initialize`, `start`, `stop`, `dispose`).

### 2. `NetworkClient.ts`
Handles the raw WebSocket connection.
- **`connect()`**: Appends the `session_id` to the `wss_url` as a query parameter and establishes the `WebSocket`. Sets up the `onmessage` listener.
- **`onmessage(event)`**: Parses incoming JSON. If it sees `type === "TRIGGER_REAR_SCAN"`, it fires the `onTriggerRearScan` callback which the `BaseEngine` listens to.
- **`sendPayload(event_type, payload)`**: Stringifies the data and pushes it over the socket. Fails silently if the socket is closed (to prevent crashing the exam).

### 3. `BaseEngine.ts`
An abstract class that `PrimaryPCEngine` and `SecondaryMobileEngine` extend. It handles the heavy lifting of the AI Loop.
- **`startAdaptiveLoop()`**: The core engine heartbeat. Uses `window.requestAnimationFrame`. It tracks time using `performance.now()`. It calculates the `delta`. If `delta >= (1000 / this.targetFPS)`, it triggers the abstract `onFrame()` method. This ensures the AI never runs faster than the requested FPS (default 5 FPS), saving CPU.

### 4. `EventTraps.ts`
Monitors DOM-level events.
- **`bindTabFocusTraps()`**: Adds event listeners to `window` for `blur` and `focus`, and `document` for `visibilitychange`. If the user minimizes the browser or clicks to another monitor, it fires a `TAB_UNFOCUSED` anomaly with 100% confidence.

---

## 📁 `src/sdk/managers/` (The Controllers)

### 1. `AnomalyEngine.ts`
Implements the `IAnomalyReporter` interface. It is the gatekeeper before the network.
- **`lastAlerts: Record<string, number>`**: A dictionary tracking the timestamp of the last time a specific anomaly was fired.
- **`reportAnomaly(anomalyClass, confidence, frameBase64)`**: Checks if `now - lastAlert > 3000ms`. This 3-second throttle is critical. Without it, a single look away from the screen would generate 15 WebSocket messages per second, crashing the backend.

### 2. `CalibrationManager.ts`
Handles the one-time setup of the user's biometric baselines.
- **`calibrateGaze(camera, mobilenet, facemodel, poseId)`**:
  1. Detects the face using `BlazeFace`.
  2. Crops the HTML `<canvas>` to just the face bounding box.
  3. Passes the cropped face into `MobileNet`.
  4. Returns a 1D Tensor (1024-length array of floats). This is the embedding.
- **`calibrateMobileFace()`**: Similar to above, but executed on the mobile phone to verify the candidate's identity against the PC's embedding.

---

## 📁 `src/sdk/media/` (Hardware Interfacing)

### 1. `CameraManager.ts`
- **`initialize(facingMode: "user" | "environment")`**: Calls `navigator.mediaDevices.getUserMedia({ video: { facingMode } })`. It dynamically creates a hidden HTML `<video>` and `<canvas>` element in the DOM to stream the frames.
- **`getCanvas()` / `getContext()`**: Provides the 2D rendering context used by TensorFlow to extract pixel data.

### 2. `MicrophoneManager.ts`
- **`initialize()`**: Requests `{ audio: true }`.
- **`getAudioContext()`**: Creates a new `window.AudioContext()`.
- **`getSourceNode()`**: Creates a `MediaStreamAudioSourceNode` from the microphone stream. This node is required to pipe the audio into the DSP filters.

---

## 📁 `src/sdk/ai/` (The Brains)

### 1. `PCVisionPipeline.ts`
The heaviest pipeline. Runs face detection and geometry validation.
- **`initialize()`**: Sets WebGL backend. Loads BlazeFace, MobileNet, and the custom KNN Classifier.
- **`processFrame()`**: 
  - Retrieves the video canvas.
  - Counts faces. If `> 1` -> `MULTIPLE_PEOPLE_DETECTED`. If `0` -> `FACE_NOT_VISIBLE`.
  - Calculates the Cosine Similarity against the `authorizedFaceEmbedding`. If `< 0.85` -> `UNAUTHORIZED_PERSON_DETECTED`.
  - Extracts the face bounding box, feeds it to the KNN Classifier. If the predicted pose is not `"CENTER"`, it fires `GAZE_DISPLACEMENT`.

### 2. `AudioPipeline.ts`
Handles Digital Signal Processing (DSP).
- **`start()`**: Creates two `BiquadFilterNode`s. A Highpass at 85Hz and a Lowpass at 3000Hz. This filters out background hums (AC units, fans) and isolates the human vocal range. It then pipes this cleaned audio into `Meyda.createMeydaAnalyzer()`.
- **`processAudioFrame()`**: Called continuously by Meyda. It extracts the `rms` (volume) and `mfcc` (Mel-frequency cepstral coefficients - the shape of the vocal tract).
- **`runAudioVerification()`**: Takes 10 sequential MFCC arrays, averages them, and does a Cosine Similarity check against the baseline `baseAudioEmbedding`. If `< 0.95`, it fires `UNAUTHORIZED_SPEECH`.

### 3. `MobileVisionPipeline.ts`
Optimized for the secondary device.
- **`processFrame()`**: The Continuous Front Scan. Uses `COCO-SSD`. It searches the frame for `"cell phone"`, `"book"`, and `"person"`.
- **`executeSilentRearScan()`**: The Triggered Scan. Stops the front camera `CameraManager`, restarts it with `facingMode: "environment"`. Waits 1.5 seconds for hardware autofocus. Captures 25 frames (5 seconds at 5 FPS) running `COCO-SSD` on the room behind the candidate. Fires `REAR_CAMERA_ANOMALY_DETECTED` if it sees forbidden objects. Finally, restarts the front camera.

---

## 📁 `src/sdk/engines/` (The Assemblers)

### 1. `PrimaryPCEngine.ts`
Extends `BaseEngine`.
- Overrides `initializePipelines()` to instantiate the Camera, Mic, Screen, Vision Pipeline, and Audio Pipeline.
- Exposes developer-friendly methods like `captureAudioBaselineFrame()` which directly calls `this.audioPipeline.captureAudioBaselineFrame()`.

### 2. `SecondaryMobileEngine.ts`
Extends `BaseEngine`.
- Overrides `initializePipelines()` but only initializes the components required by the Mobile Phone.
- Contains the callback `handleRearScanTrigger(reason)` which executes the `executeSilentRearScan()` method on the Mobile Vision Pipeline.

---

## Conclusion

Every function in this library is designed with two goals in mind: **Performance** (preventing blocking the main UI thread via `requestAnimationFrame` and `WebGL`) and **Security** (calculating anomalies entirely via Mathematical Tensors on the Edge before the data is throttled and transmitted). 

You now possess a complete byte-level understanding of the system!

