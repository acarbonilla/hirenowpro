/**
 * Geolocation utilities for tracking applicant location
 */

export interface GeolocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * Get current geolocation from browser
 * @param timeoutMs Request timeout in milliseconds (default 3000ms)
 * @returns Promise with latitude and longitude
 */
export const getCurrentLocation = (timeoutMs: number = 3000): Promise<GeolocationData> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        let errorMessage = "Unable to get location";

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location access denied. Please enable location permissions.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information unavailable.";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out.";
            break;
        }

        reject(new Error(errorMessage));
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      }
    );
  });
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param lat1 - First latitude
 * @param lon1 - First longitude
 * @param lat2 - Second latitude
 * @param lon2 - Second longitude
 * @returns Distance in meters
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // Earth's radius in meters
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

/**
 * Format distance for display
 * @param meters - Distance in meters
 * @returns Formatted string (e.g., "250m" or "1.5km")
 */
export const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
};

/**
 * Check if location is within geofence radius
 * @param lat - Current latitude
 * @param lon - Current longitude
 * @param officeLat - Office latitude
 * @param officeLon - Office longitude
 * @param radiusMeters - Geofence radius in meters (default 500m)
 * @returns true if within geofence
 */
export const isWithinGeofence = (
  lat: number,
  lon: number,
  officeLat: number,
  officeLon: number,
  radiusMeters: number = 500
): boolean => {
  const distance = calculateDistance(lat, lon, officeLat, officeLon);
  return distance <= radiusMeters;
};
