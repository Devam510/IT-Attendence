// Vibe Tech Labs — Geofence Engine
// Point-in-polygon, accuracy gate, altitude, Wi-Fi, mock location detection
// Produces a composite location confidence score (0–100)

export interface GeoPoint {
    lat: number;
    lng: number;
    altitude?: number;
    accuracy: number; // meters
    speed?: number;
}

export interface OfficeLocation {
    lat: number;
    lng: number;
    altitudeM?: number;
    radiusM: number;
    geofencePolygon?: { lat: number; lng: number }[] | null;
    wifiBssids: string[];
}

export interface GeoVerifyInput {
    userLocation: GeoPoint;
    office: OfficeLocation;
    biometricVerified: boolean;
    wifiBssid?: string;
    isMockLocation?: boolean;
}

export interface GeoVerifyResult {
    score: number; // 0–100
    passed: boolean; // score >= 75
    factors: Record<string, { score: number; max: number; reason: string }>;
    distanceM: number;
}

// ─── Haversine Distance (meters) ────────────────────────

function toRad(deg: number): number {
    return (deg * Math.PI) / 180;
}

export function haversineDistance(
    lat1: number, lng1: number,
    lat2: number, lng2: number
): number {
    const R = 6371000; // Earth radius in meters
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ─── Point-in-Polygon (Ray Casting) ─────────────────────

export function pointInPolygon(
    point: { lat: number; lng: number },
    polygon: { lat: number; lng: number }[]
): boolean {
    if (!polygon || polygon.length < 3) return false;

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const pi = polygon[i];
        const pj = polygon[j];
        if (!pi || !pj) continue;

        const xi = pi.lat, yi = pi.lng;
        const xj = pj.lat, yj = pj.lng;

        const intersect =
            yi > point.lng !== yj > point.lng &&
            point.lat < ((xj - xi) * (point.lng - yi)) / (yj - yi) + xi;

        if (intersect) inside = !inside;
    }
    return inside;
}

// ─── Composite Location Verification ────────────────────

export function verifyLocation(input: GeoVerifyInput): GeoVerifyResult {
    const factors: GeoVerifyResult["factors"] = {};
    const { userLocation, office } = input;

    // 1. Mock Location Detection (instant fail: -100)
    if (input.isMockLocation) {
        factors.mockLocation = { score: -100, max: 0, reason: "Mock location detected — BLOCKED" };
    }

    // 2. Distance Check (30 points)
    const distance = haversineDistance(
        userLocation.lat, userLocation.lng,
        office.lat, office.lng
    );

    if (distance <= office.radiusM) {
        factors.distance = { score: 30, max: 30, reason: `Within geofence (${Math.round(distance)}m)` };
    } else if (distance <= office.radiusM * 1.5) {
        factors.distance = { score: 15, max: 30, reason: `Near geofence (${Math.round(distance)}m)` };
    } else {
        factors.distance = { score: 0, max: 30, reason: `Outside geofence (${Math.round(distance)}m)` };
    }

    // 3. GPS Accuracy Gate (20 points)
    if (userLocation.accuracy <= 20) {
        factors.accuracy = { score: 20, max: 20, reason: `High accuracy (${userLocation.accuracy}m)` };
    } else if (userLocation.accuracy <= 50) {
        factors.accuracy = { score: 15, max: 20, reason: `Good accuracy (${userLocation.accuracy}m)` };
    } else if (userLocation.accuracy <= 100) {
        factors.accuracy = { score: 10, max: 20, reason: `Fair accuracy (${userLocation.accuracy}m)` };
    } else {
        factors.accuracy = { score: 0, max: 20, reason: `Poor accuracy (${userLocation.accuracy}m) — exceeds 100m` };
    }

    // 4. Polygon Check (15 points, if polygon defined)
    if (office.geofencePolygon && Array.isArray(office.geofencePolygon) && office.geofencePolygon.length >= 3) {
        const inPoly = pointInPolygon(userLocation, office.geofencePolygon);
        factors.polygon = inPoly
            ? { score: 15, max: 15, reason: "Inside office polygon" }
            : { score: 0, max: 15, reason: "Outside office polygon" };
    } else {
        // No polygon — award default points
        factors.polygon = { score: 10, max: 15, reason: "No polygon defined — radius only" };
    }

    // 5. Altitude Check (10 points, if defined)
    if (office.altitudeM != null && userLocation.altitude != null) {
        const altDiff = Math.abs(userLocation.altitude - office.altitudeM);
        if (altDiff <= 15) {
            factors.altitude = { score: 10, max: 10, reason: `Altitude match (±${Math.round(altDiff)}m)` };
        } else if (altDiff <= 50) {
            factors.altitude = { score: 5, max: 10, reason: `Altitude near (±${Math.round(altDiff)}m)` };
        } else {
            factors.altitude = { score: 0, max: 10, reason: `Altitude mismatch (±${Math.round(altDiff)}m)` };
        }
    } else {
        factors.altitude = { score: 5, max: 10, reason: "Altitude not available" };
    }

    // 6. Wi-Fi BSSID (15 points)
    if (input.wifiBssid && office.wifiBssids.length > 0) {
        const bssidMatch = office.wifiBssids.some(
            (b) => b.toLowerCase() === input.wifiBssid!.toLowerCase()
        );
        factors.wifi = bssidMatch
            ? { score: 15, max: 15, reason: "Office Wi-Fi detected" }
            : { score: 0, max: 15, reason: "Unknown Wi-Fi network" };
    } else {
        factors.wifi = { score: 5, max: 15, reason: "Wi-Fi check not available" };
    }

    // 7. Biometric (10 points)
    factors.biometric = input.biometricVerified
        ? { score: 10, max: 10, reason: "Biometric verified" }
        : { score: 0, max: 10, reason: "Biometric not verified" };

    // Calculate total
    const rawScore = Object.values(factors).reduce((sum, f) => sum + f.score, 0);
    const score = Math.max(0, Math.min(100, rawScore));

    return {
        score,
        passed: score >= 75,
        factors,
        distanceM: Math.round(distance),
    };
}
