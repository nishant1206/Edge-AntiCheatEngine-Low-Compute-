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

## What's Next?
Now that you understand the "Why" and "What", let's get your hands dirty. 
➡️ **[Proceed to Part 2: Backend Setup](./2-BACKEND_SETUP.md)** to spin up the infrastructure!
