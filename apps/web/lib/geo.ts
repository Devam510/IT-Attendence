/**
 * Robust Geolocation Utility
 * Implements a multi-phase fetching strategy to handle weak GPS signals
 * and "Location request timed out" errors common on mobile devices.
 */

export interface RobustLocationOptions {
    highAccuracyTimeout?: number;
    lowAccuracyTimeout?: number;
}

/**
 * Attempts to get the current position with high accuracy first,
 * then falls back to low accuracy if it fails or times out.
 */
export async function getRobustLocation(options: RobustLocationOptions = {}): Promise<GeolocationPosition> {
    const {
        highAccuracyTimeout = 20000, // 20s for high accuracy
        lowAccuracyTimeout = 10000,   // 10s for low accuracy fallback
    } = options;

    if (!navigator.geolocation) {
        throw new Error("Geolocation is not supported by your browser.");
    }

    try {
        // Phase 1: High Accuracy
        // We try for a precise lock first.
        return await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: highAccuracyTimeout,
                maximumAge: 0,
            });
        });
    } catch (error: any) {
        // If permission was denied, don't retry (it will fail again)
        if (error.code === error.PERMISSION_DENIED) {
            throw error;
        }

        // Phase 2: Fallback to Low Accuracy
        // This uses Wi-Fi/Cell towers and is much more reliable indoors.
        try {
            return await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: false,
                    timeout: lowAccuracyTimeout,
                    maximumAge: 0,
                });
            });
        } catch (fallbackError: any) {
            // Both attempts failed, throw the original error or the fallback error
            throw fallbackError;
        }
    }
}
