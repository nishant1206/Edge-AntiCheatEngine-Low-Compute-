import * as tf from '@tensorflow/tfjs';
import { PCVisionPipeline } from '../ai/PCVisionPipeline';
import { CameraManager } from '../media/CameraManager';
import type { IAnomalyReporter } from '../core/types';

export class CalibrationManager {
    public async calibrateGaze(
        pose: "STRAIGHT" | "LEFT" | "RIGHT" | "UP" | "DOWN" | "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT",
        pipeline: PCVisionPipeline,
        camera: CameraManager
    ): Promise<boolean> {
        const faceModel = pipeline.getFaceModel();
        const mobilenetModel = pipeline.getMobilenet();
        const gazeClassifier = pipeline.getClassifier();
        const videoElement = camera.getVideoElement();

        if (!faceModel || !videoElement || !mobilenetModel || !gazeClassifier) return false;

        try {
            const predictions = await faceModel.estimateFaces(videoElement, false);
            if (predictions.length === 0) return false;

            const landmarks = predictions[0].landmarks as [number, number][];
            if (landmarks.length < 4) return false;

            const rightEye = landmarks[0];
            const leftEye = landmarks[1];
            const nose = landmarks[2];
            const mouth = landmarks[3];

            const distRight = Math.sqrt(Math.pow(rightEye[0] - nose[0], 2) + Math.pow(rightEye[1] - nose[1], 2));
            const distLeft = Math.sqrt(Math.pow(leftEye[0] - nose[0], 2) + Math.pow(leftEye[1] - nose[1], 2));
            const yawRatio = distRight > 0 ? distLeft / distRight : 1;

            const eyeCenterY = (rightEye[1] + leftEye[1]) / 2;
            const distEyesToNoseY = Math.abs(nose[1] - eyeCenterY);
            const distNoseToMouthY = Math.abs(mouth[1] - nose[1]);
            const pitchRatio = distNoseToMouthY > 0 ? distEyesToNoseY / distNoseToMouthY : 1;

            let isCorrectPose = false;
            switch (pose) {
                case "STRAIGHT":
                    if (yawRatio >= 0.4 && yawRatio <= 2.5 && pitchRatio >= 0.2 && pitchRatio <= 4.0) isCorrectPose = true;
                    break;
                case "LEFT":
                    if (yawRatio < 0.85) isCorrectPose = true;
                    break;
                case "RIGHT":
                    if (yawRatio > 1.15) isCorrectPose = true;
                    break;
                case "UP":
                    if (pitchRatio < 0.8) isCorrectPose = true;
                    break;
                case "DOWN":
                    if (pitchRatio > 1.8) isCorrectPose = true;
                    break;
                case "TOP_LEFT":
                    if (yawRatio <= 0.85 && pitchRatio <= 0.8) isCorrectPose = true;
                    break;
                case "TOP_RIGHT":
                    if (yawRatio >= 1.15 && pitchRatio <= 0.8) isCorrectPose = true;
                    break;
                case "BOTTOM_LEFT":
                    if (yawRatio <= 0.85 && pitchRatio >= 1.8) isCorrectPose = true;
                    break;
                case "BOTTOM_RIGHT":
                    if (yawRatio >= 1.15 && pitchRatio >= 1.8) isCorrectPose = true;
                    break;
            }

            if (isCorrectPose) {
                const topLeft = predictions[0].topLeft as [number, number];
                const bottomRight = predictions[0].bottomRight as [number, number];
                const width = Math.max(1, bottomRight[0] - topLeft[0]);
                const height = Math.max(1, bottomRight[1] - topLeft[1]);

                const faceCropCanvas = document.createElement('canvas');
                faceCropCanvas.width = width;
                faceCropCanvas.height = height;
                const ctx = faceCropCanvas.getContext('2d');
                
                if (ctx) {
                    ctx.drawImage(videoElement, topLeft[0], topLeft[1], width, height, 0, 0, width, height);
                    const embedding = mobilenetModel.infer(faceCropCanvas, true);
                    const label = pose === "STRAIGHT" ? "GAZE_VALID" : "GAZE_INVALID";
                    
                    if (pose === "STRAIGHT") {
                        pipeline.setAuthorizedFaceEmbedding(tf.clone(embedding));
                        console.log("[Edge SDK] Primary Authorized Face Baseline Captured.");
                    }
                    
                    gazeClassifier.addExample(embedding, label);
                    embedding.dispose();
                    return true;
                }
            }
            return false;
        } catch (err) {
            return false;
        }
    }

    public async calibrateMobileFace(
        camera: CameraManager,
        mobilenetModel: any,
        faceModel: any,
        reporter: IAnomalyReporter
    ): Promise<tf.Tensor | null> {
        const videoElement = camera.getVideoElement();
        if (!videoElement || !faceModel || !mobilenetModel) return null;
        
        console.log("[Edge SDK] Starting 3-second Mobile Side-Profile Calibration...");
        reporter.sendHeartbeat("Mobile Face Calibration started. Please look at the camera.");

        let capturedEmbeddings: tf.Tensor[] = [];
        
        reporter.sendHeartbeat("Please place your phone down and look at your screen (Laptop / PC). Calibrating in 5 seconds...");
        await new Promise(r => setTimeout(r, 5000));
        
        for (let i = 0; i < 30; i++) {
            try {
                const predictions = await faceModel.estimateFaces(videoElement, false);
                if (predictions.length > 0) {
                    const topLeft = predictions[0].topLeft as [number, number];
                    const bottomRight = predictions[0].bottomRight as [number, number];
                    const width = Math.max(1, bottomRight[0] - topLeft[0]);
                    const height = Math.max(1, bottomRight[1] - topLeft[1]);

                    const faceCropCanvas = document.createElement('canvas');
                    faceCropCanvas.width = width;
                    faceCropCanvas.height = height;
                    const ctx = faceCropCanvas.getContext('2d');
                    
                    if (ctx) {
                        ctx.drawImage(videoElement, topLeft[0], topLeft[1], width, height, 0, 0, width, height);
                        const embedding = mobilenetModel.infer(faceCropCanvas, true);
                        capturedEmbeddings.push(tf.clone(embedding));
                        embedding.dispose();
                    }
                }
            } catch(e) {}
            await new Promise(r => setTimeout(r, 100));
        }

        if (capturedEmbeddings.length > 0) {
            const stacked = tf.stack(capturedEmbeddings);
            const authorizedFaceEmbedding = tf.mean(stacked, 0);
            
            capturedEmbeddings.forEach(e => e.dispose());
            stacked.dispose();
            console.log(`[Edge SDK] Mobile Baseline captured! (${capturedEmbeddings.length} frames)`);
            reporter.sendHeartbeat(`Mobile Face Calibration complete. Frames: ${capturedEmbeddings.length}`);
            return authorizedFaceEmbedding;
        } else {
            console.warn("[Edge SDK] Could not find a face during Mobile Calibration!");
            reporter.sendHeartbeat("Mobile Face Calibration failed: No face found.");
            return null;
        }
    }
}
