import * as tf from '@tensorflow/tfjs';
import { BaseEngine } from '../core/BaseEngine';
import type { EngineConfig } from '../core/types';
import { CameraManager } from '../media/CameraManager';
import { MicrophoneManager } from '../media/MicrophoneManager';
import { MobileVisionPipeline } from '../ai/MobileVisionPipeline';
import { AudioPipeline } from '../ai/AudioPipeline';
import { CalibrationManager } from '../managers/CalibrationManager';

export class SecondaryMobileEngine extends BaseEngine {
    private cameraManager: CameraManager;
    private microphoneManager: MicrophoneManager;
    
    private visionPipeline: MobileVisionPipeline | null = null;
    private audioPipeline: AudioPipeline | null = null;
    private calibrationManager: CalibrationManager;

    constructor(config: EngineConfig) {
        super(config);
        
        this.cameraManager = new CameraManager();
        this.microphoneManager = new MicrophoneManager();
        this.calibrationManager = new CalibrationManager();
    }

    protected async initializePipelines(): Promise<void> {
        const reqCam = this.config.required_sensors.includes("camera");
        const reqMic = this.config.required_sensors.includes("microphone");

        if (reqCam) {
            await this.cameraManager.initialize("user");
            this.visionPipeline = new MobileVisionPipeline(this.cameraManager, this.anomalyEngine);
            await this.visionPipeline.initialize();
            await this.visionPipeline.start();
        }

        if (reqMic) {
            await this.microphoneManager.initialize();
            this.audioPipeline = new AudioPipeline(this.microphoneManager, this.anomalyEngine);
            await this.audioPipeline.initialize();
            await this.audioPipeline.start();
        }

        // Trigger Mobile Face Calibration
        if (reqCam && this.visionPipeline) {
            const authEmbedding = await this.calibrationManager.calibrateMobileFace(
                this.cameraManager, 
                this.visionPipeline.getMobilenet(), 
                this.visionPipeline.getFaceModel(),
                this.anomalyEngine
            );
            if (authEmbedding) {
                this.visionPipeline.setAuthorizedFaceEmbedding(authEmbedding);
            }
        }

        // Audio pipeline is considered calibrated once initialized on mobile (since it gets the sig from PC)
        if (this.audioPipeline) {
            this.audioPipeline.setCalibrationComplete(true);
        }
    }

    protected async onFrame(): Promise<void> {
        if (this.visionPipeline) {
            await this.visionPipeline.processFrame();
        }
    }

    protected async handleRearScanTrigger(reason: string): Promise<void> {
        if (this.visionPipeline) {
            console.log(`[Edge SDK] Mobile received Rear Scan Trigger. (Reason: ${reason})`);
            await this.visionPipeline.executeSilentRearScan();
        }
    }

    protected disposePipelines(): void {
        if (this.visionPipeline) this.visionPipeline.dispose();
        if (this.audioPipeline) this.audioPipeline.dispose();
        this.cameraManager.stop();
        this.microphoneManager.stop();
    }

    // --- Developer Expose API ---

    public loadAudioBaseline(signatureArray: number[]): void {
        if (this.audioPipeline) {
            const signatureTensor = tf.tensor1d(signatureArray);
            this.audioPipeline.setBaseAudioEmbedding(signatureTensor);
            this.audioPipeline.setCalibrationComplete(true);
            console.log("[Edge SDK] Audio Baseline loaded into Mobile Engine.");
        }
    }
}
