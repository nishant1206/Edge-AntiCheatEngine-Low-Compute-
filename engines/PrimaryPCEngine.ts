import { BaseEngine } from '../core/BaseEngine';
import type { EngineConfig } from '../core/types';
import { EventTraps } from '../core/EventTraps';
import { CameraManager } from '../media/CameraManager';
import { MicrophoneManager } from '../media/MicrophoneManager';
import { ScreenManager } from '../media/ScreenManager';
import { PCVisionPipeline } from '../ai/PCVisionPipeline';
import { AudioPipeline } from '../ai/AudioPipeline';
import { CalibrationManager } from '../managers/CalibrationManager';

export class PrimaryPCEngine extends BaseEngine {
    private eventTraps: EventTraps;
    private cameraManager: CameraManager;
    private microphoneManager: MicrophoneManager;
    private screenManager: ScreenManager;
    
    private visionPipeline: PCVisionPipeline | null = null;
    private audioPipeline: AudioPipeline | null = null;
    private calibrationManager: CalibrationManager;

    constructor(config: EngineConfig) {
        super(config);
        
        this.eventTraps = new EventTraps(this.anomalyEngine);
        this.cameraManager = new CameraManager();
        this.microphoneManager = new MicrophoneManager();
        this.screenManager = new ScreenManager(this.anomalyEngine);
        this.calibrationManager = new CalibrationManager();
    }

    protected async initializePipelines(): Promise<void> {
        this.eventTraps.start();

        const reqCam = this.config.required_sensors.includes("camera");
        const reqMic = this.config.required_sensors.includes("microphone");
        const reqScreen = this.config.required_sensors.includes("screen");

        // 1. Initialize Media
        if (reqCam) {
            await this.cameraManager.initialize("user");
            this.visionPipeline = new PCVisionPipeline(this.cameraManager, this.anomalyEngine);
            await this.visionPipeline.initialize();
            await this.visionPipeline.start();
        }

        if (reqMic) {
            await this.microphoneManager.initialize();
            this.audioPipeline = new AudioPipeline(this.microphoneManager, this.anomalyEngine);
            await this.audioPipeline.initialize();
            await this.audioPipeline.start();
        }

        if (reqScreen) {
            await this.screenManager.initialize();
        }
    }

    protected async onFrame(): Promise<void> {
        if (this.visionPipeline) {
            await this.visionPipeline.processFrame();
        }
    }

    protected async handleRearScanTrigger(reason: string): Promise<void> {
        // PC does not do Rear Scans. This is a Mobile-only feature.
        console.warn(`[Edge SDK] PC received Rear Scan Trigger, but PC cannot do rear scans. Ignoring. (Reason: ${reason})`);
    }

    protected disposePipelines(): void {
        this.eventTraps.stop();
        if (this.visionPipeline) this.visionPipeline.dispose();
        if (this.audioPipeline) this.audioPipeline.dispose();
        this.cameraManager.stop();
        this.microphoneManager.stop();
        this.screenManager.stop();
    }

    // --- Developer Expose API ---

    public async calibrateGaze(pose: "STRAIGHT" | "LEFT" | "RIGHT" | "UP" | "DOWN" | "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT"): Promise<boolean> {
        if (!this.visionPipeline) return false;
        return this.calibrationManager.calibrateGaze(pose, this.visionPipeline, this.cameraManager);
    }

    public async startEdgeAI(): Promise<void> {
        console.log("[Edge SDK] Starting Edge AI Background learning...");
        if (this.visionPipeline && this.visionPipeline.getMobilenet()) {
            if (this.visionPipeline) this.visionPipeline.setCalibrationComplete(true);
        }
        if (this.audioPipeline) {
            this.audioPipeline.setCalibrationComplete(true);
        }
    }

    public captureAudioBaselineFrame(): boolean {
        if (!this.audioPipeline) return false;
        return this.audioPipeline.captureAudioBaselineFrame();
    }
    
    public computeAudioBaseline(): void {
        if (!this.audioPipeline) return;
        this.audioPipeline.computeAudioBaseline();
    }

    public exportAudioSignature(): string | null {
        if (!this.audioPipeline) return null;
        const emb = this.audioPipeline.getBaseAudioEmbedding();
        if (!emb) return null;
        
        const arr = Array.from(emb.dataSync());
        return arr.map(v => v.toFixed(4)).join(',');
    }
}
