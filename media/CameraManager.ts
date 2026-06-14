export class CameraManager {
    private stream: MediaStream | null = null;
    private videoElement: HTMLVideoElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;

    public async initialize(facingMode: "user" | "environment" = "user"): Promise<void> {
        try {
            console.log(`[Edge SDK] Requesting Camera permission (facingMode: ${facingMode})...`);
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: facingMode } 
            });
            console.log("[Edge SDK] Camera permission granted.");

            this.createVideoElement();
            this.createCanvas();
        } catch (err) {
            console.error("[Edge SDK] Camera permission denied.", err);
            throw err;
        }
    }

    private createVideoElement(): void {
        this.videoElement = document.createElement("video");
        this.videoElement.srcObject = this.stream;
        this.videoElement.autoplay = true;
        this.videoElement.playsInline = true;
        this.videoElement.muted = true;
        this.videoElement.setAttribute("playsinline", "true");
        this.videoElement.setAttribute("autoplay", "true");
        this.videoElement.setAttribute("muted", "true");
        
        // Styling for debug
        this.videoElement.style.width = "320px";
        this.videoElement.style.borderRadius = "8px";
        this.videoElement.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)";
        this.videoElement.style.position = "fixed";
        this.videoElement.style.bottom = "20px";
        this.videoElement.style.right = "20px";
        this.videoElement.style.zIndex = "9999";
        this.videoElement.style.border = "2px solid #10b981";
        this.videoElement.style.transform = "scaleX(-1)"; // Mirror effect
        
        document.body.appendChild(this.videoElement);
        this.videoElement.play().catch(() => {});
    }

    private createCanvas(): void {
        this.canvas = document.createElement("canvas");
        this.canvas.width = 320;
        this.canvas.height = 240;
        this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    }

    public getVideoElement(): HTMLVideoElement | null {
        return this.videoElement;
    }

    public getCanvas(): HTMLCanvasElement | null {
        return this.canvas;
    }

    public getContext(): CanvasRenderingContext2D | null {
        return this.ctx;
    }
    
    public getStream(): MediaStream | null {
        return this.stream;
    }

    public stop(): void {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.srcObject = null;
            if (this.videoElement.parentNode) {
                this.videoElement.parentNode.removeChild(this.videoElement);
            }
            this.videoElement = null;
        }
        this.canvas = null;
        this.ctx = null;
    }
}
