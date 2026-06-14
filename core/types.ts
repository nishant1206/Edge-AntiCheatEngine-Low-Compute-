export interface EdgeEventPayload {
    session_id: string;
    event_type: "HEARTBEAT" | "ANOMALY" | "DEBUG_FRAME" | "TRIGGER_REAR_SCAN";
    timestamp: number;
    payload: {
        anomaly_class?: "GAZE_DISPLACEMENT" | "INVALID_SCREEN" | "TAB_UNFOCUSED" | "CAMERA_BLOCKED" | "UNAUTHORIZED_SPEECH" | "FORBIDDEN_OBJECT_DETECTED" | "MULTIPLE_PEOPLE_DETECTED" | "REAR_CAMERA_ANOMALY_DETECTED" | "OTHER_PERSON_DETECTED";
        confidence?: number;
        fps_maintained?: number;
        frame?: string; // Base64 JPEG for Debug Streaming
        debug_msg?: string;
        reason?: string;
        status?: string;
        device?: string;
    };
}

export interface EngineConfig {
    session_id: string;
    wss_url: string;
    required_sensors: ("camera" | "screen" | "microphone")[];
    device_role?: "PRIMARY_PC" | "SECONDARY_MOBILE";
}

// Internal interface for pipelines to send payloads
export interface IAnomalyReporter {
    reportAnomaly(anomalyClass: EdgeEventPayload['payload']['anomaly_class'], confidence: number, frameBase64?: string): void;
    sendDebugFrame(frameBase64: string): void;
    sendHeartbeat(debugMsg?: string): void;
}

export interface IPipeline {
    initialize(): Promise<void>;
    start(): Promise<void>;
    stop(): void;
    dispose(): void;
}
