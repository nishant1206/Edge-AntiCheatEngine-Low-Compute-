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

➡️ **[Proceed to Part 6: API Reference Deep Dive](./6-API_REFERENCE_DEEP_DIVE.md)** to see the absolute byte-level implementation of every function.
