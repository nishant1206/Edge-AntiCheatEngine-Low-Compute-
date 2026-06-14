import type { EdgeEventPayload } from '../core/types';
import type { EngineConfig } from './types';

export class NetworkClient {
    private ws: WebSocket | null = null;
    private config: EngineConfig;
    
    // Callbacks for the Engine to bind to
    public onDebugFrameReceived?: (frameBase64: string) => void;
    public onTriggerRearScan?: (reason: string) => void;

    constructor(config: EngineConfig) {
        this.config = config;
    }

    public connect(): void {
        const url = new URL(this.config.wss_url);
        url.searchParams.append("session_id", this.config.session_id);
        
        this.ws = new WebSocket(url.toString());

        this.ws.onopen = () => console.log("[Edge SDK] WebSocket connection established.");
        this.ws.onerror = (error) => console.error("[Edge SDK] WebSocket error:", error);
        this.ws.onclose = () => console.warn("[Edge SDK] WebSocket closed.");
        
        this.ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // Route incoming Debug Frames to the UI callback (Usually PC)
                if (data.type === "DEBUG_FRAME" && this.onDebugFrameReceived) {
                    this.onDebugFrameReceived(data.frame);
                }

                // Listen for cross-device triggers (Usually Mobile)
                if (data.type === "TRIGGER_REAR_SCAN" && this.onTriggerRearScan) {
                    this.onTriggerRearScan(data.reason || "PC Trigger");
                }
            } catch (err: any) {
                console.warn("[Edge SDK] WS OnMessage Error:", err);
            }
        };
    }

    public sendPayload(event_type: "HEARTBEAT" | "ANOMALY" | "DEBUG_FRAME", payload: any = {}): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const data: EdgeEventPayload = {
            session_id: this.config.session_id,
            event_type,
            timestamp: Date.now(),
            payload
        };

        this.ws.send(JSON.stringify(data));
    }

    public disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
