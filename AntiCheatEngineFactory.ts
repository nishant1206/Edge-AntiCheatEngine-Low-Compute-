import type { EngineConfig } from './core/types';
import { PrimaryPCEngine } from './engines/PrimaryPCEngine';
import { SecondaryMobileEngine } from './engines/SecondaryMobileEngine';

export class AntiCheatEngineFactory {
    public static create(config: EngineConfig): PrimaryPCEngine | SecondaryMobileEngine {
        if (config.device_role === "SECONDARY_MOBILE") {
            console.log("[Edge SDK] Factory instantiated SecondaryMobileEngine");
            return new SecondaryMobileEngine(config);
        } else {
            console.log("[Edge SDK] Factory instantiated PrimaryPCEngine");
            return new PrimaryPCEngine(config);
        }
    }
}
