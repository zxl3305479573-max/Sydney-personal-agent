import CoreLocation
import ExpoModulesCore
import Foundation

private struct NativeGeocodeInfo: Sendable {
  let label: String?
  let city: String?
  let district: String?
  let region: String?
}

@MainActor
private final class SingleLocationRequester: NSObject, CLLocationManagerDelegate {
  private var manager: CLLocationManager?
  private var continuation: CheckedContinuation<CLLocation?, Error>?
  private var timeoutWork: DispatchWorkItem?
  private var requestedFix = false

  func fetch(requestPermission: Bool, timeoutSeconds: Double) async throws -> CLLocation? {
    try await withCheckedThrowingContinuation { cont in
      self.continuation = cont
      let mgr = CLLocationManager()
      self.manager = mgr
      mgr.delegate = self
      mgr.desiredAccuracy = kCLLocationAccuracyHundredMeters

      let work = DispatchWorkItem { [weak self] in
        guard let self else { return }
        if let cached = self.manager?.location,
          cached.horizontalAccuracy >= 0,
          cached.horizontalAccuracy <= 500,
          abs(cached.timestamp.timeIntervalSinceNow) < 300
        {
          self.finish(returning: cached)
        } else {
          self.finish(returning: nil)
        }
      }
      self.timeoutWork = work
      DispatchQueue.main.asyncAfter(deadline: .now() + timeoutSeconds, execute: work)

      switch mgr.authorizationStatus {
      case .authorizedWhenInUse, .authorizedAlways:
        self.requestedFix = true
        mgr.requestLocation()
      case .notDetermined:
        if requestPermission {
          mgr.requestWhenInUseAuthorization()
        } else {
          self.finish(returning: nil)
        }
      case .denied, .restricted:
        self.finish(
          throwing: NSError(
            domain: "SydneyLocation",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "location_denied"]
          ))
      @unknown default:
        self.finish(returning: nil)
      }
    }
  }

  private func handleAuthorizationChange(_ status: CLAuthorizationStatus) {
    guard continuation != nil else { return }
    switch status {
    case .authorizedWhenInUse, .authorizedAlways:
      if !requestedFix {
        requestedFix = true
        manager?.requestLocation()
      }
    case .denied, .restricted:
      finish(
        throwing: NSError(
          domain: "SydneyLocation",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "location_denied"]
        ))
    case .notDetermined:
      break
    @unknown default:
      finish(returning: nil)
    }
  }

  private func handleLocations(_ locations: [CLLocation]) {
    guard let best = locations.last(where: { $0.horizontalAccuracy >= 0 }) else { return }
    finish(returning: best)
  }

  private func handleError(_ error: Error) {
    if let clError = error as? CLError {
      if clError.code == .locationUnknown {
        return
      }
      if clError.code == .denied {
        finish(
          throwing: NSError(
            domain: "SydneyLocation",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "location_denied"]
          ))
        return
      }
    }
    if let cached = manager?.location,
      cached.horizontalAccuracy >= 0,
      cached.horizontalAccuracy <= 500,
      abs(cached.timestamp.timeIntervalSinceNow) < 300
    {
      finish(returning: cached)
    } else {
      finish(throwing: error)
    }
  }

  private func finish(returning location: CLLocation?) {
    guard let cont = continuation else { return }
    continuation = nil
    timeoutWork?.cancel()
    timeoutWork = nil
    manager?.delegate = nil
    manager?.stopUpdatingLocation()
    manager = nil
    cont.resume(returning: location)
  }

  private func finish(throwing error: Error) {
    guard let cont = continuation else { return }
    continuation = nil
    timeoutWork?.cancel()
    timeoutWork = nil
    manager?.delegate = nil
    manager?.stopUpdatingLocation()
    manager = nil
    cont.resume(throwing: error)
  }

  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let status = manager.authorizationStatus
    Task { @MainActor [weak self] in
      self?.handleAuthorizationChange(status)
    }
  }

  nonisolated func locationManager(
    _ manager: CLLocationManager,
    didUpdateLocations locations: [CLLocation]
  ) {
    Task { @MainActor [weak self] in
      self?.handleLocations(locations)
    }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    Task { @MainActor [weak self] in
      self?.handleError(error)
    }
  }
}

@MainActor
private func reverseGeocodePlacemark(_ location: CLLocation) async -> NativeGeocodeInfo {
  await withCheckedContinuation { cont in
    let geocoder = CLGeocoder()
    var settled = false
    let settle: @MainActor (NativeGeocodeInfo) -> Void = { info in
      guard !settled else { return }
      settled = true
      cont.resume(returning: info)
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
      if !settled {
        geocoder.cancelGeocode()
        settle(NativeGeocodeInfo(label: nil, city: nil, district: nil, region: nil))
      }
    }

    geocoder.reverseGeocodeLocation(location, preferredLocale: Locale.current) { placemarks, _ in
      let placemark = placemarks?.first
      let region = placemark?.administrativeArea?.trimmingCharacters(in: .whitespacesAndNewlines)
      let rawCity = placemark?.locality?.trimmingCharacters(in: .whitespacesAndNewlines)
      let district = placemark?.subLocality?.trimmingCharacters(in: .whitespacesAndNewlines)
      let street = placemark?.thoroughfare?.trimmingCharacters(in: .whitespacesAndNewlines)
      let name = placemark?.name?.trimmingCharacters(in: .whitespacesAndNewlines)

      let city = (rawCity?.isEmpty == false ? rawCity : nil)
        ?? (region?.isEmpty == false ? region : nil)
      let cleanDistrict = district?.isEmpty == false ? district : nil
      let cleanRegion = region?.isEmpty == false ? region : nil

      var parts: [String] = []
      if let city, !city.isEmpty {
        parts.append(city)
      }
      if let cleanDistrict, !parts.contains(cleanDistrict) {
        parts.append(cleanDistrict)
      } else if parts.isEmpty, let cleanRegion {
        parts.append(cleanRegion)
      }
      if parts.isEmpty, let street, !street.isEmpty {
        parts.append(street)
      } else if parts.isEmpty, let name, !name.isEmpty {
        parts.append(name)
      }

      let label = parts.isEmpty ? nil : parts.joined(separator: " · ")
      let info = NativeGeocodeInfo(
        label: label,
        city: city,
        district: cleanDistrict,
        region: cleanRegion
      )
      Task { @MainActor in
        settle(info)
      }
    }
  }
}

public class SydneyLocationModule: Module {
  private static func statusString(_ status: CLAuthorizationStatus) -> String {
    switch status {
    case .authorizedWhenInUse, .authorizedAlways:
      return "authorized"
    case .denied:
      return "denied"
    case .restricted:
      return "restricted"
    case .notDetermined:
      return "notDetermined"
    @unknown default:
      return "notDetermined"
    }
  }

  public func definition() -> ModuleDefinition {
    Name("SydneyLocation")

    Function("isAvailable") { () -> Bool in
      Bundle.main.object(forInfoDictionaryKey: "NSLocationWhenInUseUsageDescription") is String
    }

    Function("authorizationStatus") { () -> String in
      Self.statusString(CLLocationManager().authorizationStatus)
    }

    AsyncFunction("getCurrentLocation") {
      (requestPermission: Bool, timeoutMs: Double?) async throws -> [String: Any]? in
      guard Bundle.main.object(forInfoDictionaryKey: "NSLocationWhenInUseUsageDescription") is String
      else {
        return nil
      }
      let timeoutSeconds = min(max((timeoutMs ?? 12_000) / 1000.0, 3.0), 25.0)
      let requester = await MainActor.run { SingleLocationRequester() }
      guard
        let location = try await requester.fetch(
          requestPermission: requestPermission,
          timeoutSeconds: timeoutSeconds
        )
      else {
        return nil
      }

      let geocode = await reverseGeocodePlacemark(location)
      var result: [String: Any] = [
        "latitude": location.coordinate.latitude,
        "longitude": location.coordinate.longitude,
        "accuracyMeters": max(0, location.horizontalAccuracy),
        "timestampMs": location.timestamp.timeIntervalSince1970 * 1000.0,
      ]
      if let label = geocode.label { result["label"] = label }
      if let city = geocode.city { result["city"] = city }
      if let district = geocode.district { result["district"] = district }
      if let region = geocode.region { result["region"] = region }
      return result
    }
  }
}
