# Industry Grade - Edge-Assisted Anti-Cheat System

<div align="center">
  <p>A highly scalable, mathematically rigorous, and privacy-first proctoring engine powered by Edge AI.</p>
</div>

---

## 🛑 The Problem with Traditional Proctoring
Most anti-cheat systems upload heavy 1080p video feeds from the candidate's webcam to centralized servers where heavy AI models run. This causes **insane GPU costs**, **high latency**, and massive **privacy concerns**.

## 🚀 The Edge-Assisted Solution
This SDK flips the architecture. It runs **TensorFlow.js** (Vision) and **Meyda DSP** (Audio) entirely in the candidate's browser via WebAssembly. It mathematically compresses video/audio into tiny anomaly confidence scores and sends lightweight JSON over WebSockets to a Node.js backend. 
**Result:** Infinite scalability, zero GPU costs, and zero privacy breaches.

---

## 📚 Complete Documentation Suite

We have broken down the documentation into a simple, 5-part guide suitable for beginners and advanced developers alike.

### [Part 1: Introduction & Architecture](./docs/1-INTRODUCTION.md)
Start here to understand the 3-Layer architecture (SDK, Ingestion Gateway, Analytics Worker) and why Edge-AI is superior.

### [Part 2: Backend & Infrastructure Setup](./docs/2-BACKEND_SETUP.md)
Step-by-step instructions for DevOps / Backend engineers to spin up the WebSocket server, Redis queues, and configure the Webhook Receiver.

### [Part 3: Frontend SDK Integration](./docs/3-SDK_INTEGRATION.md)
A complete tutorial for Frontend developers. Includes copy-paste ready examples for implementing the `PrimaryPCEngine` in **React** and **Vanilla JS**.

### [Part 4: The Mobile Sentinel](./docs/4-MOBILE_SENTINEL.md)
Learn how to eliminate the "blind spot" below the candidate's desk by pairing their own smartphone as a secondary, 3rd-person security camera using QR Codes.

### [Part 5: Architecture Workflows](./docs/5-ARCHITECTURE_FLOWS.md)
The exact, step-by-step sequence of events. Learn how the system initializes, how the AI loops run asynchronously without freezing the UI, and the exact lifecycle of an anomaly from detection to webhook transmission.

### [Part 6: Complete API Reference Deep Dive](./docs/6-API_REFERENCE_DEEP_DIVE.md)
A byte-by-byte deep dive into every single file, class, method, and variable in the `src/sdk/` directory. Perfect for advanced developers who need to understand the underlying Math, DSP filters, and throttling mechanisms.

---

## Quick Start (Local Development)

If you just want to run the project locally and see the UI in action:

1. **Start the WebSocket Gateway:**
   ```bash
   npm run dev
   ```
2. **Start the Analytics Worker (in a new terminal):**
   ```bash
   npx ts-node src/worker.ts
   ```
3. **Start the Dummy Webhook Server (in a new terminal):**
   ```bash
   npx ts-node scripts/webhook-receiver.ts
   ```
4. **Start the Beautiful Frontend UI (in a new terminal):**
   ```bash
   cd testing_frontend
   npm run dev
   ```
   *Open `http://localhost:5173` in your browser.*
