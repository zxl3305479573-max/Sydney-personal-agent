#if compiler(>=6.4) && canImport(ScreenCaptureKit)
import CoreMedia
import Foundation
import ScreenCaptureKit
import Vision

@available(iOS 27.0, *)
final class CompanionScreenCapture: NSObject, SCContentSharingPickerObserver, SCStreamDelegate, SCStreamOutput {
  private let lock = NSLock()
  private let frameQueue = DispatchQueue(label: "sydney.companion.screen.frames")
  private var phase = "idle"
  private var generation = 0
  private var lastFrameTime: TimeInterval = 0
  private var latestText: String?
  private var latestTextTime: TimeInterval = 0
  private var stream: SCStream?
  private var activeStream: ObjectIdentifier?
  private var authorize: (() -> Bool)?
  private var authorizationTimer: Timer?
  var onState: ((String) -> Void)?

  func state() -> String {
    lock.lock()
    defer { lock.unlock() }
    return phase
  }

  private func transition(_ next: String) {
    lock.lock()
    phase = next
    lock.unlock()
    onState?(next)
  }

  private func clearActiveCapture() {
    lock.lock()
    generation += 1
    latestText = nil
    activeStream = nil
    lock.unlock()
  }

  func present(authorize: @escaping () -> Bool) -> Bool {
    guard state() == "idle" || (state() == "failed" && stream == nil) else { return false }
    self.authorize = authorize
    lock.lock()
    generation += 1
    lastFrameTime = 0
    latestText = nil
    activeStream = nil
    lock.unlock()
    let picker = SCContentSharingPicker.shared
    let configuration = SCContentSharingPickerConfiguration()
    configuration.showsMicrophoneControl = false
    configuration.showsCameraControl = false
    picker.defaultConfiguration = configuration
    picker.add(self)
    picker.isActive = true
    transition("choosing")
    authorizationTimer?.invalidate()
    authorizationTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
      guard let self, self.authorize?() != true else { return }
      Task { @MainActor in try? await self.stop() }
    }
    picker.present()
    return true
  }

  func stop() async throws {
    clearActiveCapture()
    authorize = nil
    authorizationTimer?.invalidate()
    authorizationTimer = nil
    let previous = state()
    if previous == "stopping" { throw stopPendingError() }
    if previous == "choosing" {
      removePicker()
      transition("idle")
    } else if previous == "starting" {
      transition("stopping")
      throw stopPendingError()
    } else if let stream {
      transition("stopping")
      guard await stopStream(stream) else { throw stopPendingError() }
    } else {
      removePicker()
      transition("idle")
    }
  }

  private func stopPendingError() -> NSError {
    NSError(domain: "SydneyCompanion", code: 5,
      userInfo: [NSLocalizedDescriptionKey: "屏幕共享尚未确认停止，请检查 iPhone 系统共享指示并重试。"])
  }

  func takeText() -> String? {
    lock.lock()
    defer { lock.unlock() }
    guard phase == "capturing", ProcessInfo.processInfo.systemUptime - latestTextTime <= 10 else {
      latestText = nil
      return nil
    }
    let text = latestText
    latestText = nil
    return text
  }

  private func removePicker() {
    authorizationTimer?.invalidate()
    authorizationTimer = nil
    let picker = SCContentSharingPicker.shared
    picker.remove(self)
    picker.isActive = false
  }

  private func stopStream(_ current: SCStream) async -> Bool {
    do {
      try await current.stopCapture()
      if stream === current {
        stream = nil
        removePicker()
        transition("idle")
      }
      return true
    } catch {
      if stream === current {
        transition("failed")
        return false
      }
      return true
    }
  }

  func contentSharingPicker(_ picker: SCContentSharingPicker, didCancelFor stream: SCStream?) {
    DispatchQueue.main.async { [weak self] in
      guard let self, self.state() == "choosing" else { return }
      self.removePicker()
      self.authorize = nil
      self.transition("idle")
    }
  }

  func contentSharingPickerStartDidFailWithError(_ error: Error) {
    DispatchQueue.main.async { [weak self] in
      guard let self, self.state() == "choosing" else { return }
      self.removePicker()
      self.authorize = nil
      self.transition("failed")
    }
  }

  func contentSharingPicker(
    _ picker: SCContentSharingPicker, didUpdateWith filter: SCContentFilter, for stream: SCStream?
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self, self.state() == "choosing", self.authorize?() == true else {
        if let self { Task { @MainActor in try? await self.stop() } }
        return
      }
      let config = SCStreamConfiguration()
      config.capturesAudio = false
      config.captureMicrophone = false
      config.minimumFrameInterval = CMTime(seconds: 5, preferredTimescale: 600)
      config.queueDepth = 3
      let current = SCStream(filter: filter, configuration: config, delegate: self)
      do {
        try current.addStreamOutput(self, type: .screen, sampleHandlerQueue: self.frameQueue)
      } catch {
        self.removePicker()
        self.authorize = nil
        self.transition("failed")
        return
      }
      self.stream = current
      self.transition("starting")
      current.startCapture { [weak self, weak current] error in
        DispatchQueue.main.async {
          guard let self, let current, self.stream === current else { return }
          if error != nil {
            self.stream = nil
            self.removePicker()
            self.authorize = nil
            self.transition(self.state() == "stopping" ? "idle" : "failed")
          } else if self.state() == "stopping" || self.authorize?() != true {
            self.transition("stopping")
            Task { @MainActor in _ = await self.stopStream(current) }
          } else {
            self.lock.lock()
            self.activeStream = ObjectIdentifier(current)
            self.lock.unlock()
            self.transition("capturing")
          }
        }
      }
    }
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    DispatchQueue.main.async { [weak self, weak stream] in
      guard let self, let stream, self.stream === stream else { return }
      self.lock.lock()
      self.generation += 1
      self.latestText = nil
      self.activeStream = nil
      self.lock.unlock()
      self.stream = nil
      self.authorize = nil
      self.removePicker()
      self.transition("failed")
    }
  }

  func streamDidBecomeInactive(_ stream: SCStream) {
    lock.lock()
    let inactive = activeStream == ObjectIdentifier(stream) && phase == "capturing"
    if inactive {
      generation += 1
      latestText = nil
      phase = "paused"
    }
    lock.unlock()
    if inactive {
      DispatchQueue.main.async { [weak self, weak stream] in
        guard let self, let stream, self.stream === stream, self.state() == "paused" else { return }
        self.onState?("paused")
      }
    }
  }

  func streamDidBecomeActive(_ stream: SCStream) {
    DispatchQueue.main.async { [weak self, weak stream] in
      guard let self, let stream, self.stream === stream, self.state() == "paused" else { return }
      guard self.authorize?() == true else {
        Task { @MainActor in try? await self.stop() }
        return
      }
      self.lock.lock()
      self.lastFrameTime = 0
      self.lock.unlock()
      self.transition("capturing")
    }
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .screen, let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    lock.lock()
    let now = ProcessInfo.processInfo.systemUptime
    guard phase == "capturing", activeStream == ObjectIdentifier(stream), now - lastFrameTime >= 5 else {
      lock.unlock()
      return
    }
    lastFrameTime = now
    let currentGeneration = generation
    lock.unlock()
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .fast
    request.usesLanguageCorrection = false
    do {
      try VNImageRequestHandler(cvPixelBuffer: pixelBuffer).perform([request])
      let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: "\n")
      lock.lock()
      if phase == "capturing", generation == currentGeneration, activeStream == ObjectIdentifier(stream) {
        latestText = text.isEmpty ? nil : String(text.prefix(2000))
        latestTextTime = ProcessInfo.processInfo.systemUptime
        let capturedAt = latestTextTime
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
          guard let self else { return }
          self.lock.lock()
          if self.generation == currentGeneration, self.latestTextTime == capturedAt {
            self.latestText = nil
          }
          self.lock.unlock()
        }
      }
      lock.unlock()
    } catch {
      lock.lock()
      if generation == currentGeneration { latestText = nil }
      lock.unlock()
    }
  }
}
#endif
