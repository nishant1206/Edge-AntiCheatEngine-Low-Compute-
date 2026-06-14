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
➡️ **[Proceed to Part 3: SDK Integration](./3-SDK_INTEGRATION.md)** to add the AI to your frontend website!
