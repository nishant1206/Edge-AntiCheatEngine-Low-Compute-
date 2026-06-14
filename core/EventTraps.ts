import type { IAnomalyReporter } from './types';

export class EventTraps {
    private reporter: IAnomalyReporter;
    private boundHandleVisibilityChange: () => void;

    constructor(reporter: IAnomalyReporter) {
        this.reporter = reporter;
        this.boundHandleVisibilityChange = this.handleVisibilityChange.bind(this);
    }

    public start(): void {
        document.addEventListener("visibilitychange", this.boundHandleVisibilityChange);
    }

    public stop(): void {
        document.removeEventListener("visibilitychange", this.boundHandleVisibilityChange);
    }

    private handleVisibilityChange(): void {
        if (document.hidden) {
            console.warn("[Edge SDK] Tab unfocused detected!");
            this.reporter.reportAnomaly("TAB_UNFOCUSED", 1.0);
        }
    }
}
