export function getGoogleMapsDirectionsUrl(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) {
    return null;
  }

  const destination = `${latitude},${longitude}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

export function getGoogleMapsPointUrl(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) {
    return null;
  }

  const location = `${latitude},${longitude}`;
  return `https://www.google.com/maps?q=${encodeURIComponent(location)}`;
}

export function getGoogleMapsRouteUrl(points: Array<{ latitude: number | null; longitude: number | null }>) {
  const validPoints = points.filter(
    (point): point is { latitude: number; longitude: number } =>
      point.latitude !== null && point.longitude !== null,
  );

  if (!validPoints.length) {
    return null;
  }

  if (validPoints.length === 1) {
    return getGoogleMapsDirectionsUrl(validPoints[0].latitude, validPoints[0].longitude);
  }

  const origin = `${validPoints[0].latitude},${validPoints[0].longitude}`;
  const destinationPoint = validPoints[validPoints.length - 1];
  const destination = `${destinationPoint.latitude},${destinationPoint.longitude}`;
  const waypointPoints = validPoints.slice(1, -1).slice(0, 23);
  const waypoints = waypointPoints.map((point) => `${point.latitude},${point.longitude}`).join("|");
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });

  if (waypoints) {
    params.set("waypoints", waypoints);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
