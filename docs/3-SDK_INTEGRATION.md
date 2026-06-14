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

But what if the candidate hides a phone below their desk out of the webcam's view? 
➡️ **[Proceed to Part 4: Mobile Sentinel](./4-MOBILE_SENTINEL.md)** to learn how to turn their own phone into a secondary security camera!
