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
