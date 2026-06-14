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

➡️ **[Proceed to Part 5: API Reference](./5-API_REFERENCE.md)** for a deep dive into every function in the SDK.
