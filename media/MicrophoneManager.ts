export class MicrophoneManager {
    private stream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;

    public async initialize(): Promise<void> {
        try {
            console.log(`[Edge SDK] Requesting Microphone permission...`);
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("[Edge SDK] Microphone permission granted.");

            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            this.audioContext = new AudioContextClass();
            this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
        } catch (err) {
            console.error("[Edge SDK] Microphone permission denied.", err);
            throw err;
        }
    }

    public getAudioContext(): AudioContext | null {
        return this.audioContext;
    }

    public getSourceNode(): MediaStreamAudioSourceNode | null {
        return this.sourceNode;
    }
    
    public getStream(): MediaStream | null {
        return this.stream;
    }

    public stop(): void {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.sourceNode = null;
    }
}
