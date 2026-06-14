import type { IAnomalyReporter } from '../core/types';

export class ScreenManager {
    private stream: MediaStream | null = null;
    private reporter: IAnomalyReporter;
    private isRunning: boolean = false;

    constructor(reporter: IAnomalyReporter) {
        this.reporter = reporter;
    }

    public async initialize(): Promise<void> {
        try {
            console.log("[Edge SDK] Requesting screen share permissions...");
            this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            console.log("[Edge SDK] Screen share granted.");
            this.isRunning = true;
            
            // INVALID_SCREEN Trap
            const videoTrack = this.stream.getVideoTracks()[0];
            videoTrack.onended = () => {
                if (this.isRunning) {
                    console.warn("[Edge SDK] Screen share disconnected!");
                    this.reporter.reportAnomaly("INVALID_SCREEN", 1.0);
                }
            };
        } catch (err) {
            console.error("[Edge SDK] Screen share denied.", err);
            throw err;
        }
    }

    public getStream(): MediaStream | null {
        return this.stream;
    }

    public stop(): void {
        this.isRunning = false;
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }
}
