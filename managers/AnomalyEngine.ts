import type { EdgeEventPayload } from '../core/types';
import type { EngineConfig } from '../core/types';
import type { IAnomalyReporter } from '../core/types';
import { NetworkClient } from '../core/NetworkClient';

export class AnomalyEngine implements IAnomalyReporter {
    private network: NetworkClient;
    private config: EngineConfig;
    
    // Throttles
    private lastAlerts: Record<string, number> = {};

    constructor(network: NetworkClient, config: EngineConfig) {
        this.network = network;
        this.config = config;
    }

    public reportAnomaly(anomalyClass: EdgeEventPayload['payload']['anomaly_class'], confidence: number, frameBase64?: string): void {
        const now = Date.now();
        const lastAlert = this.lastAlerts[anomalyClass || ""] || 0;
        
        // General throttle of 3000ms per anomaly class to prevent spam
        if (now - lastAlert > 3000) {
            this.network.sendPayload("ANOMALY", {
                anomaly_class: anomalyClass,
                confidence: confidence,
                frame: frameBase64
            });
            this.lastAlerts[anomalyClass || ""] = now;
            
            // Self-Trigger: If the mobile device detects an anomaly on itself, trigger the Rear Scan locally!
            if (this.config.device_role === "SECONDARY_MOBILE" && anomalyClass !== "REAR_CAMERA_ANOMALY_DETECTED") {
                if (this.network.onTriggerRearScan) {
                    this.network.onTriggerRearScan("Local Anomaly Detected");
                }
            }
        }
    }

    public sendDebugFrame(frameBase64: string): void {
        this.network.sendPayload("DEBUG_FRAME", { frame: frameBase64 });
    }

    public sendHeartbeat(debugMsg?: string): void {
        this.network.sendPayload("HEARTBEAT", { debug_msg: debugMsg });
    }
}
