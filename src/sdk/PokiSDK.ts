export class PokiWrapper {
    private isInitialized = false;
    private hasGameplayStarted = false;
    private lastCommercialTime = 0;
    private readonly COMMERCIAL_COOLDOWN_MS = 180000; // 3 menit interval aman

    public async init(): Promise<void> {
        return new Promise((resolve) => {
            const win = window as unknown as {
                PokiSDK?: {
                    init: () => Promise<void>;
                    gameplayStart: () => void;
                    gameplayStop: () => void;
                    commercialBreak: () => Promise<void>;
                    rewardedBreak: () => Promise<boolean>;
                };
            };

            if (win.PokiSDK) {
                win.PokiSDK.init()
                    .then(() => {
                        this.isInitialized = true;
                        resolve();
                    })
                    .catch(() => {
                        console.warn('PokiSDK init failed or adblock detected. Proceeding in standalone mode.');
                        resolve();
                    });
            } else {
                // Mock standalone environment
                this.isInitialized = false;
                resolve();
            }
        });
    }

    public gameplayStart(): void {
        if (!this.hasGameplayStarted) {
            this.hasGameplayStarted = true;
            const win = window as unknown as { PokiSDK?: { gameplayStart: () => void } };
            if (win.PokiSDK) {
                win.PokiSDK.gameplayStart();
            }
        }
    }

    public gameplayStop(): void {
        if (this.hasGameplayStarted) {
            this.hasGameplayStarted = false;
            const win = window as unknown as { PokiSDK?: { gameplayStop: () => void } };
            if (win.PokiSDK) {
                win.PokiSDK.gameplayStop();
            }
        }
    }

    public async commercialBreak(): Promise<void> {
        const now = Date.now();
        if (now - this.lastCommercialTime < this.COMMERCIAL_COOLDOWN_MS) {
            return; // Masih cooldown, lewati
        }

        this.gameplayStop();
        this.lastCommercialTime = now;

        const win = window as unknown as { PokiSDK?: { commercialBreak: () => Promise<void> } };
        if (win.PokiSDK) {
            try {
                await win.PokiSDK.commercialBreak();
            } catch (e) {
                console.warn('Commercial break skipped or failed:', e);
            }
        }
        this.gameplayStart();
    }

    public async rewardedBreak(): Promise<boolean> {
        this.gameplayStop();
        const win = window as unknown as { PokiSDK?: { rewardedBreak: () => Promise<boolean> } };

        let success = true;
        if (win.PokiSDK) {
            try {
                success = await win.PokiSDK.rewardedBreak();
            } catch (e) {
                console.warn('Rewarded break failed:', e);
                success = false;
            }
        } else {
            // Mock standalone mode: simulate watching ad for 1 second
            await new Promise((r) => setTimeout(r, 1000));
            success = true;
        }

        this.gameplayStart();
        return success;
    }
}
