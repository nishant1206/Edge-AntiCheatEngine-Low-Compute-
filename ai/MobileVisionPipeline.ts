import type { IAnomalyReporter } from '../core/types';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as blazeface from '@tensorflow-models/blazeface';
import * as mobilenet from '@tensorflow-models/mobilenet';
import { IPipeline } from '../core/types';
import { CameraManager } from '../media/CameraManager';

export class MobileVisionPipeline implements IPipeline {
    private camera: CameraManager;
    private reporter: IAnomalyReporter;
    
    private cocoSsdModel: cocoSsd.ObjectDetection | null = null;
    private faceModel: blazeface.BlazeFaceModel | null = null;
    private mobilenetModel: mobilenet.MobileNet | null = null;
    
    private authorizedFaceEmbedding: tf.Tensor | null = null;
    private isRunning: boolean = false;
    private isSilentRearScanning: boolean = false;

    constructor(camera: CameraManager, reporter: IAnomalyReporter) {
        this.camera = camera;
        this.reporter = reporter;
    }

    public async initialize(): Promise<void> {
        console.log("[Edge SDK] Loading Mobile Vision AI Models (COCO-SSD, BlazeFace)...");
        await tf.setBackend('webgl');
        await tf.ready();
        
        [this.cocoSsdModel, this.faceModel, this.mobilenetModel] = await Promise.all([
            cocoSsd.load(),
            blazeface.load(),
            mobilenet.load({ version: 2, alpha: 1.0 })
        ]);
        console.log("[Edge SDK] Mobile Vision Models loaded in WebGL mode.");
    }

    public async start(): Promise<void> {
        this.isRunning = true;
    }

    public stop(): void {
        this.isRunning = false;
    }

    public setAuthorizedFaceEmbedding(embedding: tf.Tensor): void {
        if (this.authorizedFaceEmbedding) this.authorizedFaceEmbedding.dispose();
        this.authorizedFaceEmbedding = embedding;
    }

    public getMobilenet(): mobilenet.MobileNet | null { return this.mobilenetModel; }
    public getFaceModel(): blazeface.BlazeFaceModel | null { return this.faceModel; }

    public async processFrame(): Promise<void> {
        if (!this.isRunning || this.isSilentRearScanning || !this.cocoSsdModel) return;
        const videoElement = this.camera.getVideoElement();
        const canvas = this.camera.getCanvas();
        const ctx = this.camera.getContext();
        
        if (!videoElement || !canvas || !ctx) return;
        if (videoElement.readyState < 2 || videoElement.videoWidth === 0) return;

        // --- Send Debug Frame ---
        try {
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            // Throttle to 5 FPS is handled by BaseEngine's onFrame loop, so we can just send it
            const frameBase64 = canvas.toDataURL("image/jpeg", 0.3);
            this.reporter.sendDebugFrame(frameBase64);
        } catch (e: any) {
            console.warn("[Edge SDK] Failed to capture mobile debug frame:", e);
        }

        // --- Object Detection ---
        try {
            const predictions = await this.cocoSsdModel.detect(videoElement);
            
            // Check for forbidden objects
            let foundPhone = false;
            let foundBook = false;
            let personCount = 0;
            
            for (const p of predictions) {
                if (p.class === "cell phone" && p.score > 0.6) foundPhone = true;
                if (p.class === "book" && p.score > 0.6) foundBook = true;
                if (p.class === "person" && p.score > 0.6) personCount++;
            }
            
            if (foundPhone || foundBook) {
                console.warn("[Edge SDK] Forbidden object detected!");
                this.reporter.reportAnomaly("FORBIDDEN_OBJECT_DETECTED", 0.9);
            }
            
            if (personCount > 1) {
                console.warn(`[Edge SDK] Multiple people detected! Count: ${personCount}`);
                this.reporter.reportAnomaly("MULTIPLE_PEOPLE_DETECTED", 0.95);
            }
        } catch (e: any) {
            console.error("[Edge SDK] COCO-SSD Detection Error:", e);
        }
    }

    public async executeSilentRearScan(): Promise<void> {
        if (this.isSilentRearScanning || !this.cocoSsdModel) return;
        this.isSilentRearScanning = true;
        console.log("[Edge SDK] Initiating Silent Rear Camera Scan...");
        
        try {
            this.camera.stop(); // Stop front camera
            await new Promise(r => setTimeout(r, 1000)); // Wait for ISP lock to release
            
            await this.camera.initialize("environment"); // Start rear camera
            await new Promise(r => setTimeout(r, 1500)); // Wait for autofocus
            
            const videoElement = this.camera.getVideoElement();
            const canvas = this.camera.getCanvas();
            const ctx = this.camera.getContext();
            
            if (!videoElement || !canvas || !ctx) {
                this.isSilentRearScanning = false;
                return;
            }

            // Stream the back camera to the PC for 5 seconds (25 frames at 5 FPS)
            for (let i = 0; i < 25; i++) {
                if (videoElement.videoWidth > 0) {
                    try {
                        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                        const frameBase64 = canvas.toDataURL("image/jpeg", 0.4);
                        this.reporter.sendDebugFrame(frameBase64);
                    } catch (e) {}
                }
                
                const predictions = await this.cocoSsdModel.detect(videoElement);
                
                for (const p of predictions) {
                    if (["person", "cell phone", "laptop", "book"].includes(p.class) && p.score > 0.6) {
                        console.warn(`[Edge SDK] REAR CAMERA CAUGHT ANOMALY: ${p.class}`);
                        this.reporter.reportAnomaly("REAR_CAMERA_ANOMALY_DETECTED", p.score);
                    }
                }
                
                await new Promise(r => setTimeout(r, 200));
            }
        } catch (err) {
            console.error("[Edge SDK] Rear Scan Failed:", err);
        } finally {
            this.camera.stop();
            await new Promise(r => setTimeout(r, 1000));
            await this.camera.initialize("user"); // Restore front camera
            this.isSilentRearScanning = false;
            console.log("[Edge SDK] Restored Front Camera.");
        }
    }

    public dispose(): void {
        this.stop();
        if (this.authorizedFaceEmbedding) this.authorizedFaceEmbedding.dispose();
        this.authorizedFaceEmbedding = null;
    }
}
