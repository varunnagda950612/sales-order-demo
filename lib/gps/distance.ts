const earthRadiusMeters = 6_371_000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function getDistanceMeters(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
) {
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const fromLatitudeRadians = toRadians(fromLatitude);
  const toLatitudeRadians = toRadians(toLatitude);

  const halfChordLength =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(fromLatitudeRadians) *
      Math.cos(toLatitudeRadians) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  const angularDistance =
    2 * Math.atan2(Math.sqrt(halfChordLength), Math.sqrt(1 - halfChordLength));

  return Math.round(earthRadiusMeters * angularDistance);
}
