export interface GameConfig {
    // 1. Probe & Sweeper
    probeSpeed: number;
    accelRate: number;
    turnRate: number;
    sweeperWidth: number;
    brushPower: number;
    suspensionPitch: number;
    suspensionRoll: number;
    trailsEnabled: boolean;
    trailFadeDuration: number;

    // 2. Camera (Dedicated Tab)
    camDistance: number;
    camHeight: number;
    camPitch: number;
    camFov: number;
    camSmoothPos: number;
    camSmoothLook: number;
    followCamera: boolean;
    comfortMode: boolean;
    lazyFollow: boolean;
    camAutoRealign: boolean;
    camIdleCinematic: boolean;
    camIdleSeconds: number;

    // 3. Moon & Shaders
    moonScale: number;
    dirtHeight: number;
    softness: number;
    shadowBrightness: number;
    intensity: number;
    spacePreset: string;

    // 4. Audio
    soundEnabled: boolean;

    // 5. Vacuum Tank (Debug & Tuning)
    tankCapacity: number;
    tankFillSpeed: number;
    tankGlowIntensity: number;
    tankGlassOpacity: number;
    tankColorStyle: string;
    tankScale: number;
    tankLength: number;
    cartCount: number;
    cartSpacing: number;
}

// User-chosen default settings from test tuning
export const DEFAULT_CONFIG: GameConfig = {
    // Probe
    probeSpeed: 0.90,
    accelRate: 5.50,
    turnRate: 2.80,
    sweeperWidth: 0.20,
    brushPower: 1.00,
    suspensionPitch: 1.00,
    suspensionRoll: 1.00,
    trailsEnabled: true,
    trailFadeDuration: 4.50,

    // Camera
    camDistance: 1.85,
    camHeight: 0.52,
    camPitch: 0.42,
    camFov: 52,
    camSmoothPos: 6.0,
    camSmoothLook: 7.5,
    followCamera: true,
    comfortMode: true,
    lazyFollow: true,
    camAutoRealign: true,
    camIdleCinematic: true,
    camIdleSeconds: 25.0,

    // Moon & Shaders
    moonScale: 1.00,
    dirtHeight: 0.012,
    softness: 0.55,
    shadowBrightness: 0.48,
    intensity: 1.15,
    spacePreset: 'auto',

    // Audio
    soundEnabled: true,

    // Vacuum Tank Debug & Tuning
    tankCapacity: 100,
    tankFillSpeed: 1.00,
    tankGlowIntensity: 0.65,
    tankGlassOpacity: 0.28,
    tankColorStyle: 'palette',
    tankScale: 1.00,
    tankLength: 1.00,
    cartCount: 1,
    cartSpacing: 1.00
};

export class ConfigManager {
    public static current: GameConfig = { ...DEFAULT_CONFIG };
    private static readonly STORAGE_KEY = 'lunar_sweeper_custom_config_v6';

    public static loadFromStorage(): void {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                this.current = { ...DEFAULT_CONFIG, ...parsed };
                if (!this.current.tankScale || this.current.tankScale <= 0) this.current.tankScale = 1.00;
                if (!this.current.tankLength || this.current.tankLength <= 0) this.current.tankLength = 1.00;
                if (!this.current.cartCount || this.current.cartCount < 1) this.current.cartCount = 1;
            } else {
                this.current = { ...DEFAULT_CONFIG };
            }
        } catch (e) {
            console.warn('Failed to load config from storage:', e);
            this.current = { ...DEFAULT_CONFIG };
        }
    }

    public static saveToStorage(): void {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.current, null, 2));
        } catch (e) {
            console.warn('Failed to save config to storage:', e);
        }
    }

    public static resetToDefault(): void {
        this.current = { ...DEFAULT_CONFIG };
        this.saveToStorage();
    }

    public static exportJSON(): string {
        return JSON.stringify({
            app: 'Lunar Sweeper 3D',
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            config: this.current
        }, null, 2);
    }

    public static importJSON(jsonStr: string): boolean {
        try {
            const parsed = JSON.parse(jsonStr);
            const cfg = parsed.config || parsed;
            this.current = { ...DEFAULT_CONFIG, ...cfg };
            this.saveToStorage();
            return true;
        } catch (e) {
            console.error('Invalid JSON config:', e);
            return false;
        }
    }
}
