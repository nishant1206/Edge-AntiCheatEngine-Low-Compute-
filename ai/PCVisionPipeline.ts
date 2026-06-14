import type { IAnomalyReporter } from '../core/types';
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as blazeface from '@tensorflow-models/blazeface';
import * as knnClassifier from '@tensorflow-models/knn-classifier';
import { IPipeline } from '../core/types';
import { CameraManager } from '../media/CameraManager';

export class PCVisionPipeline implements IPipeline {
    private camera: CameraManager;
    private reporter: IAnomalyReporter;
    
    private mobilenetModel: mobilenet.MobileNet | null = null;
    private faceModel: blazeface.BlazeFaceModel | null = null;
    private gazeClassifier: knnClassifier.KNNClassifier | null = null;
    
    private baseValidEmbedding: tf.Tensor | null = null;
    private authorizedFaceEmbedding: tf.Tensor | null = null;
    
    private faceCropCanvas: HTMLCanvasElement | null = null;
    private isRunning: boolean = false;
    private isCalibrationComplete: boolean = false;

    constructor(camera: CameraManager, reporter: IAnomalyReporter) {
        this.camera = camera;
        this.reporter = reporter;
        this.gazeClassifier = knnClassifier.create();
    }

    public async initialize(): Promise<void> {
        console.log("[Edge SDK] Loading PC Vision AI Models (MobileNet, BlazeFace)...");
        await tf.setBackend('webgl');
        await tf.ready();
        
        [this.mobilenetModel, this.faceModel] = await Promise.all([
            mobilenet.load({ version: 2, alpha: 1.0 }),
            blazeface.load()
        ]);
        console.log("[Edge SDK] PC Vision Models loaded in WebGL mode.");
    }

    public async start(): Promise<void> {
        this.isRunning = true;
    }

    public stop(): void {
        this.isRunning = false;
    }

    public setCalibrationComplete(status: boolean): void {
        this.isCalibrationComplete = status;
    }

    public setBaseValidEmbedding(embedding: tf.Tensor): void {
        if (this.baseValidEmbedding) this.baseValidEmbedding.dispose();
        this.baseValidEmbedding = embedding;
    }

    public setAuthorizedFaceEmbedding(embedding: tf.Tensor): void {
        if (this.authorizedFaceEmbedding) this.authorizedFaceEmbedding.dispose();
        this.authorizedFaceEmbedding = embedding;
    }

    public getMobilenet(): mobilenet.MobileNet | null { return this.mobilenetModel; }
    public getFaceModel(): blazeface.BlazeFaceModel | null { return this.faceModel; }
    public getClassifier(): knnClassifier.KNNClassifier | null { return this.gazeClassifier; }

    public async processFrame(): Promise<void> {
        if (!this.isRunning) return;
        const videoElement = this.camera.getVideoElement();
        const canvas = this.camera.getCanvas();
        const ctx = this.camera.getContext();
        
        if (!videoElement || !canvas || !ctx) return;
        if (videoElement.readyState < 2 || videoElement.videoWidth === 0) return;

        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        // 1. Brightness / Occlusion Check (CAMERA_BLOCKED)
        if (this.checkCameraBlocked(ctx, canvas.width, canvas.height)) {
            return; // If blocked, don't run face logic
        }

        // 2. Custom TFJS ML Model Classification (INVALID_SCREEN)
        this.checkInvalidScreen(videoElement);

        // 3. Face Detection Check (GAZE_DISPLACEMENT / OTHER_PERSON)
        await this.checkFaceAndGaze(videoElement);
    }

    private checkCameraBlocked(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
        const frameData = ctx.getImageData(0, 0, width, height);
        const data = frameData.data;
        let totalBrightness = 0;
        
        for (let i = 0; i < data.length; i += 16) {
            totalBrightness += (0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
        }
        
        const avgBrightness = totalBrightness / (data.length / 16);
        if (avgBrightness < 10) {
            console.warn("[Edge SDK] Camera blocked / occlusion detected!");
            this.reporter.reportAnomaly("CAMERA_BLOCKED", 0.95);
            return true;
        }
        return false;
    }

    private checkInvalidScreen(videoElement: HTMLVideoElement): void {
        if (!this.baseValidEmbedding || !this.mobilenetModel) return;
        try {
            const embedding = this.mobilenetModel.infer(videoElement, true);
            const normA = embedding.norm();
            const normB = this.baseValidEmbedding.norm();
            const dotProduct = tf.sum(tf.mul(embedding, this.baseValidEmbedding));
            const similarityTensor = dotProduct.div(tf.mul(normA, normB));
            const similarity = similarityTensor.dataSync()[0];
            
            embedding.dispose();
            normA.dispose();
            normB.dispose();
            dotProduct.dispose();
            similarityTensor.dispose();
            
            if (similarity < 0.8) {
                console.warn(`[Edge SDK] Anomaly Detected! Similarity Score dropped to ${similarity.toFixed(2)}`);
                this.reporter.reportAnomaly("INVALID_SCREEN", 1 - similarity);
            }
        } catch (err) {}
    }

    private async checkFaceAndGaze(videoElement: HTMLVideoElement): Promise<void> {
        if (!this.isCalibrationComplete || !this.faceModel || !this.gazeClassifier || this.gazeClassifier.getNumClasses() === 0 || !this.mobilenetModel) return;
        
        try {
            const predictions = await this.faceModel.estimateFaces(videoElement, false);
            if (predictions.length === 0) {
                console.warn("[Edge SDK] Gaze displacement! Face completely missing.");
                this.reporter.reportAnomaly("GAZE_DISPLACEMENT", 0.95);
                return;
            }

            const topLeft = predictions[0].topLeft as [number, number];
            const bottomRight = predictions[0].bottomRight as [number, number];
            const width = Math.max(1, bottomRight[0] - topLeft[0]);
            const height = Math.max(1, bottomRight[1] - topLeft[1]);

            if (!this.faceCropCanvas) this.faceCropCanvas = document.createElement('canvas');
            this.faceCropCanvas.width = width;
            this.faceCropCanvas.height = height;
            const ctx = this.faceCropCanvas.getContext('2d');
            
            if (ctx) {
                ctx.drawImage(videoElement, topLeft[0], topLeft[1], width, height, 0, 0, width, height);
                const embedding = this.mobilenetModel.infer(this.faceCropCanvas, true);
                
                let isOtherPerson = false;
                if (this.authorizedFaceEmbedding) {
                    const normA = embedding.norm();
                    const normB = this.authorizedFaceEmbedding.norm();
                    const dotProduct = tf.sum(tf.mul(embedding, this.authorizedFaceEmbedding));
                    const similarityTensor = dotProduct.div(tf.mul(normA, normB));
                    const similarity = similarityTensor.dataSync()[0];
                    
                    normA.dispose();
                    normB.dispose();
                    dotProduct.dispose();
                    similarityTensor.dispose();
                    
                    if (similarity < 0.85) {
                        isOtherPerson = true;
                        console.warn(`[Edge SDK] Identity Mismatch! Expected Authorized User. (Similarity: ${similarity.toFixed(2)})`);
                        this.reporter.reportAnomaly("OTHER_PERSON_DETECTED", 1 - similarity);
                    }
                }

                if (!isOtherPerson) {
                    const result = await this.gazeClassifier.predictClass(embedding);
                    if (result.label === 'GAZE_INVALID' && result.confidences['GAZE_INVALID'] > 0.8) {
                        console.warn(`[Edge SDK] ML Gaze displacement! Looked away. (Conf: ${result.confidences['GAZE_INVALID'].toFixed(2)})`);
                        this.reporter.reportAnomaly("GAZE_DISPLACEMENT", result.confidences['GAZE_INVALID']);
                    }
                }
                embedding.dispose();
            }
        } catch (err) {}
    }

    public dispose(): void {
        this.stop();
        if (this.gazeClassifier) this.gazeClassifier.clearAllClasses();
        if (this.authorizedFaceEmbedding) this.authorizedFaceEmbedding.dispose();
        if (this.baseValidEmbedding) this.baseValidEmbedding.dispose();
        this.baseValidEmbedding = null;
        this.authorizedFaceEmbedding = null;
    }
}
