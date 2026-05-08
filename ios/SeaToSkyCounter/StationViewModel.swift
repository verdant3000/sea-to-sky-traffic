import AVFoundation
import Combine
import SwiftUI

struct Station: Codable, Identifiable {
    let id:       Int
    let name:     String
    let location: String?
}

// Not @MainActor at class level — camera delegate fires on outputQueue (background).
// All @Published mutations are explicitly dispatched to main queue below.
class StationViewModel: NSObject, ObservableObject {

    // MARK: - UI state (main thread only)

    @Published var countA:          Int     = 0
    @Published var countB:          Int     = 0
    @Published var pending:         Int     = 0
    @Published var lastSyncDate:    Date?   = nil
    @Published var lastSyncCount:   Int     = 0
    @Published var isDetectorReady: Bool    = false
    @Published var visibleBoxes:    [BoundingBox] = []
    @Published var errorMessage:    String? = nil
    @Published var isCounting:      Bool    = true
    @Published var isMirrored:      Bool    = UserDefaults.standard.bool(forKey: "isMirrored")
    @Published var previewRotation: Double  = UserDefaults.standard.object(forKey: "previewRotation") as? Double ?? 0
    @Published var currentZoom:     CGFloat = 1.0

    // Station selector
    @Published var stations:           [Station] = []
    @Published var isLoadingStations:  Bool      = false
    @Published var showStationPicker:  Bool      = false
    @Published var selectedStationID:  Int = UserDefaults.standard.object(forKey: "selectedStationID") as? Int ?? Config.stationID {
        didSet {
            shipper.stationID = selectedStationID
            UserDefaults.standard.set(selectedStationID, forKey: "selectedStationID")
        }
    }

    // Lens selector
    @Published var availableLenses: [CameraLens] = []
    @Published var currentLens:     CameraLens?  = nil

    // Tripwire position. Persisted in UserDefaults.
    @Published var tripwireX: Double = UserDefaults.standard.object(forKey: "tripwireX") as? Double ?? Config.tripwireX {
        didSet { counter.wireX = tripwireX; UserDefaults.standard.set(tripwireX, forKey: "tripwireX") }
    }

    // Tripwire angle (-60 … +60°). Persisted in UserDefaults.
    @Published var wireAngle: Double = UserDefaults.standard.object(forKey: "wireAngle") as? Double ?? 0.0 {
        didSet { counter.wireAngle = wireAngle; UserDefaults.standard.set(wireAngle, forKey: "wireAngle") }
    }

    // MARK: - Internal state

    private var frameIndex = 0
    private let detector   = YOLODetector()
    private let counter    = TripwireCounter()
    private let buffer     = DetectionBuffer()
    private let camera     = CameraCapture()
    private lazy var shipper = APIShipper(buffer: buffer)

    // MARK: - Lifecycle

    func start() {
        UIApplication.shared.isIdleTimerDisabled = true
        let idiom = UIDevice.current.userInterfaceIdiom
        print("[SeaToSky] Device: \(idiom == .pad ? "iPad" : "iPhone")  (userInterfaceIdiom=\(idiom.rawValue))")
        shipper.stationID = selectedStationID
        counter.wireX     = tripwireX
        counter.wireAngle = wireAngle

        counter.onCrossing = { [weak self] detection in
            guard let self, self.isCounting else { return }
            self.buffer.append(detection)
            DispatchQueue.main.async {
                if detection.direction == Config.directionA { self.countA += 1 }
                else                                        { self.countB += 1 }
                self.pending = self.buffer.count
            }
        }

        shipper.onSync = { [weak self] success, count in
            guard let self else { return }
            if success {
                self.lastSyncDate  = self.shipper.lastSyncDate
                self.lastSyncCount = count
            }
            self.pending = self.buffer.count
        }

        camera.delegate = self
        camera.configure { [weak self] result in
            guard let self else { return }
            switch result {
            case .success:
                self.availableLenses = self.camera.availableLenses
                self.currentLens     = self.camera.currentLens
                self.isDetectorReady = self.detector.isReady
                if !self.detector.isReady { self.waitForDetector() }
                if self.isMirrored { self.camera.setOutputMirrored(true) }
                self.camera.start()
                self.shipper.start()
            case .failure(let err):
                self.errorMessage = err.localizedDescription
            }
        }
    }

    func stop() {
        camera.stop()
        shipper.stop()
        UIApplication.shared.isIdleTimerDisabled = false
    }

    var captureSession: AVCaptureSession { camera.session }

    // MARK: - Controls

    func toggleCounting() { isCounting.toggle() }

    func syncNow() { shipper.syncNow() }

    func resetCounts() {
        counter.reset()
        DispatchQueue.main.async { self.countA = 0; self.countB = 0 }
    }

    func rotatePreviewCW() {
        let next = (previewRotation + 90).truncatingRemainder(dividingBy: 360)
        previewRotation = next; UserDefaults.standard.set(next, forKey: "previewRotation")
    }

    func rotatePreviewCCW() {
        let next = (previewRotation - 90 + 360).truncatingRemainder(dividingBy: 360)
        previewRotation = next; UserDefaults.standard.set(next, forKey: "previewRotation")
    }

    func toggleMirror() {
        let next = !isMirrored
        camera.setOutputMirrored(next)
        isMirrored = next
        UserDefaults.standard.set(next, forKey: "isMirrored")
    }

    func setZoom(_ factor: CGFloat) {
        camera.setZoom(factor)
        currentZoom = factor
    }

    func resetZoom() {
        camera.resetZoom()
        currentZoom = 1.0
    }

    func switchToLens(_ lens: CameraLens) {
        camera.switchToLens(lens) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success:
                self.currentLens = lens
                self.currentZoom = 1.0   // also resets pinchBaseZoom via onChange in ContentView
            case .failure(let err):
                self.errorMessage = err.localizedDescription
            }
        }
    }

    // MARK: - Station selection

    func fetchStations() {
        guard let url = URL(string: "\(Config.apiBaseURL)/api/stations") else { return }
        isLoadingStations = true
        var req = URLRequest(url: url, timeoutInterval: 15)
        if !Config.apiKey.isEmpty {
            req.setValue(Config.apiKey, forHTTPHeaderField: "x-api-key")
        }
        URLSession.shared.dataTask(with: req) { [weak self] data, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode
            if let error { print("[Stations] Error: \(error.localizedDescription)") }
            if let status { print("[Stations] HTTP \(status)") }

            let decoded: [Station]
            if let data, status == 200 {
                do {
                    decoded = try JSONDecoder().decode([Station].self, from: data)
                    print("[Stations] Loaded \(decoded.count) station(s)")
                } catch {
                    let body = String(data: data, encoding: .utf8) ?? "<binary>"
                    print("[Stations] Decode error: \(error)\nBody: \(body)")
                    decoded = []
                }
            } else {
                if let data, let body = String(data: data, encoding: .utf8) {
                    print("[Stations] Body: \(body)")
                }
                decoded = []
            }

            DispatchQueue.main.async {
                self?.stations = decoded
                self?.isLoadingStations = false
            }
        }.resume()
    }

    func selectStation(_ station: Station) {
        selectedStationID = station.id
    }

    // MARK: - Private

    private func waitForDetector() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self else { return }
            if self.detector.isReady { self.isDetectorReady = true }
            else                     { self.waitForDetector() }
        }
    }
}

// MARK: - Camera delegate (called on outputQueue — NOT main thread)

extension StationViewModel: CameraCaptureDelegate {
    func cameraCapture(_ capture: CameraCapture, didOutput pixelBuffer: CVPixelBuffer) {
        frameIndex += 1
        guard frameIndex % Config.inferenceFrameSkip == 0 else { return }
        guard detector.isReady else { return }

        let boxes = detector.detect(pixelBuffer: pixelBuffer)
        counter.update(detections: boxes)

        let snap = boxes
        DispatchQueue.main.async { [weak self] in self?.visibleBoxes = snap }
    }
}
