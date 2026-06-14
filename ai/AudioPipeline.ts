import type { IAnomalyReporter } from '../core/types';
import * as tf from '@tensorflow/tfjs';
import Meyda from 'meyda';
import { IPipeline } from '../core/types';
import { MicrophoneManager } from '../media/MicrophoneManager';

export class AudioPipeline implements IPipeline {
    private micManager: MicrophoneManager;
    private reporter: IAnomalyReporter;
    private meydaAnalyzer: any = null;
    
    private baseAudioEmbedding: tf.Tensor | null = null;
    private recentAudioFrames: number[][] = [];
    private audioBaselineFrames: number[][] = [];
    private isRunning: boolean = false;
    private isCalibrationComplete: boolean = false;

    constructor(micManager: MicrophoneManager, reporter: IAnomalyReporter) {
        this.micManager = micManager;
        this.reporter = reporter;
    }

    public async initialize(): Promise<void> {
        // Initialization handled during start when stream is active
    }

    public async start(): Promise<void> {
        this.isRunning = true;
        const audioContext = this.micManager.getAudioContext();
        const source = this.micManager.getSourceNode();

        if (!audioContext || !source) {
            console.warn("[Edge SDK] Cannot start AudioPipeline: Missing AudioContext or SourceNode.");
            return;
        }

        // --- Vocal Isolation DSP Filters ---
        const highpass = audioContext.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.value = 85; 

        const lowpass = audioContext.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = 3000;

        source.connect(highpass);
        highpass.connect(lowpass);
        
        this.meydaAnalyzer = Meyda.createMeydaAnalyzer({
            audioContext: audioContext,
            source: lowpass,
            bufferSize: 2048,
            featureExtractors: ['mfcc', 'rms'],
            callback: (features: any) => this.processAudioFrame(features)
        });
        
        this.meydaAnalyzer.start();
        console.log("[Edge SDK] Audio DSP Pipeline started with Vocal Isolation Filters.");
    }

    public setCalibrationComplete(status: boolean): void {
        this.isCalibrationComplete = status;
    }

    public setBaseAudioEmbedding(embedding: tf.Tensor): void {
        if (this.baseAudioEmbedding) {
            this.baseAudioEmbedding.dispose();
        }
        this.baseAudioEmbedding = embedding;
    }

    public getBaseAudioEmbedding(): tf.Tensor | null {
        return this.baseAudioEmbedding;
    }

    private processAudioFrame(features: any): void {
        if (!this.isRunning || !this.isCalibrationComplete) return;
        
        const rms = features.rms;
        const mfcc = features.mfcc;
        
        if (rms < 0.01) {
            this.recentAudioFrames = []; 
            return; 
        }
        
        if (this.baseAudioEmbedding && mfcc) {
            this.recentAudioFrames.push(mfcc);
            if (this.recentAudioFrames.length >= 10) { 
                this.runAudioVerification(this.recentAudioFrames);
                this.recentAudioFrames = []; 
            }
        }
    }

    private runAudioVerification(frames: number[][]): void {
        if (!this.baseAudioEmbedding) return;
        
        tf.tidy(() => {
            const stacked = tf.tensor2d(frames);
            const currentEmbedding = tf.mean(stacked, 0); 
            
            const normA = currentEmbedding.norm();
            const normB = this.baseAudioEmbedding!.norm();
            const dotProduct = tf.sum(tf.mul(currentEmbedding, this.baseAudioEmbedding!));
            
            const similarityTensor = dotProduct.div(tf.mul(normA, normB));
            const similarity = similarityTensor.dataSync()[0];
            
            console.log(`[Edge SDK] Live Voice Similarity: ${similarity.toFixed(4)}`);
            
            const AUDIO_SIMILARITY_THRESHOLD = 0.95; 
            
            if (similarity < AUDIO_SIMILARITY_THRESHOLD) {
                console.warn(`[Edge SDK] Unauthorized Speech! Voice timbre changed. (Similarity: ${similarity.toFixed(2)})`);
                this.reporter.reportAnomaly("UNAUTHORIZED_SPEECH", 1 - similarity);
            }
        });
    }

    public captureAudioBaselineFrame(): boolean {
        if (!this.meydaAnalyzer) return false;
        
        const features = this.meydaAnalyzer.get(['mfcc', 'rms']);
        if (!features || !features.mfcc) return false;
        
        const rms = features.rms as number;
        if (rms > 0.01) {
            this.audioBaselineFrames.push(features.mfcc as number[]);
            return true;
        }
        return false;
    }
    
    public computeAudioBaseline(): void {
        if (this.audioBaselineFrames.length === 0) {
            console.warn("[Edge SDK] Cannot compute audio baseline: 0 frames captured.");
            return;
        }
        
        this.baseAudioEmbedding = tf.tidy(() => {
            const stacked = tf.tensor2d(this.audioBaselineFrames);
            return tf.mean(stacked, 0); 
        });
        
        console.log(`[Edge SDK] Voice Baseline computed from ${this.audioBaselineFrames.length} frames.`);
    }

    public stop(): void {
        this.isRunning = false;
        if (this.meydaAnalyzer) {
            this.meydaAnalyzer.stop();
        }
    }

    public dispose(): void {
        this.stop();
        if (this.baseAudioEmbedding) {
            this.baseAudioEmbedding.dispose();
            this.baseAudioEmbedding = null;
        }
    }
}
