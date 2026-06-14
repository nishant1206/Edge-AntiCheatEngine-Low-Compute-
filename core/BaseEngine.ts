import type { EngineConfig } from './types';
import { IPipeline } from './types';
import { NetworkClient } from './NetworkClient';
import { AnomalyEngine } from '../managers/AnomalyEngine';

export abstract class BaseEngine {
    protected config: EngineConfig;
    protected network: NetworkClient;
    protected anomalyEngine: AnomalyEngine;
    
    protected isRunning: boolean = false;
    private heartbeatInterval: number | null = null;
    
    // Abstract loop management
    protected animationFrameId: number | null = null;
    protected lastFrameTime: number = 0;
    protected targetFPS: number = 5;

    // Callbacks
    public onDebugFrameReceived?: (frameBase64: string) => void;

    constructor(config: EngineConfig) {
        this.config = config;
        this.network = new NetworkClient(this.config);
        this.anomalyEngine = new AnomalyEngine(this.network, this.config);
        
        // Bind network callbacks
        this.network.onDebugFrameReceived = (frame) => {
            if (this.onDebugFrameReceived) this.onDebugFrameReceived(frame);
        };
        
        this.network.onTriggerRearScan = async (reason) => {
            await this.handleRearScanTrigger(reason);
        };
    }

    public async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        await this.initializePipelines();
        
        this.network.connect();
        this.startHeartbeat();
        this.startAdaptiveLoop();
    }

    public stop(): void {
        this.isRunning = false;
        if (this.heartbeatInterval) window.clearInterval(this.heartbeatInterval);
        if (this.animationFrameId) window.cancelAnimationFrame(this.animationFrameId);
        
        this.disposePipelines();
        this.network.disconnect();
    }

    private startHeartbeat(): void {
        this.heartbeatInterval = window.setInterval(() => {
            this.anomalyEngine.sendHeartbeat();
        }, 5000); // 5 seconds
    }

    private startAdaptiveLoop(): void {
        this.lastFrameTime = performance.now();
        const loop = async (timestamp: number) => {
            if (!this.isRunning) return;

            const delta = timestamp - this.lastFrameTime;
            const interval = 1000 / this.targetFPS;

            if (delta >= interval) {
                this.lastFrameTime = timestamp - (delta % interval);
                await this.onFrame();
            }

            this.animationFrameId = window.requestAnimationFrame(loop);
        };

        this.animationFrameId = window.requestAnimationFrame(loop);
    }

    // --- Abstract Methods to be implemented by PC and Mobile Engines ---
    
    protected abstract initializePipelines(): Promise<void>;
    protected abstract disposePipelines(): void;
    protected abstract onFrame(): Promise<void>;
    protected abstract handleRearScanTrigger(reason: string): Promise<void>;
}
