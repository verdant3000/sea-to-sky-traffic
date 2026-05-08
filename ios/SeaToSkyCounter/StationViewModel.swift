import AVFoundation
import Combine
import SwiftUI

// Not @MainActor at class level — camera delegate fires on outputQueue (background).
// All @Published mutations are explicitly dispatched to main queue below.
class StationViewModel: NSObject, ObservableObject {

    // UI state — read by SwiftUI, mutated only on main thread
    @Published var countA:          Int    = 0    // directionA (northbound)
    @Published var countB:          Int    = 0    // directionB (southbound)
    @Published var pending:         Int    = 0
    @Published var lastSyncDate:    Date?  = nil
    @Published var lastSyncCount:   Int    = 0
    @Published var isDetectorReady: Bool   = false
    @Published var visibleBoxes:    [BoundingBox] = []
    @Published var errorMessage:    String? = nil
    @Published var isFrontCamera:   Bool    = false
    @Published var isMirrored:      Bool    = UserDefaults.standard.bool(forKey: "isMirrored")
    @Published var previewRotation: Double  = UserDefaults.standard.object(forKey: "previewRotation") as? Double ?? 0
    // currentZoom published so ContentView can sync pinchBaseZoom on reset.
    @Published var currentZoom:     CGFloat = 1.0

    // Tripwire position (0.0 left … 1.0 right). Persisted in UserDefaults.
    @Published var tripwireX: Double = UserDefaults.standard.object(forKey: "tripwireX") as? Double ?? Config.tripwireX {
        didSet {
            counter.wireX = tripwireX
            UserDefaults.standard.set(tripwireX, forKey: "tripwireX")
        }
    }

    // Tripwire angle in degrees from vertical (-45 … +45). Persisted in UserDefaults.
    @Published var wireAngle: Double = UserDefaults.standard.object(forKey: "wireAngle") as? Double ?? 0.0 {
        didSet {
            counter.wireAngle = wireAngle
            UserDefaults.standard.set(wireAngle, forKey: "wireAngle")
        }
    }

    // Processing state — accessed only from outputQueue (single serial queue)
    private var frameIndex = 0
    private let detector   = YOLODetector()
    private let counter    = TripwireCounter()
    private let buffer     = DetectionBuffer()
    private let camera     = CameraCapture()
    private lazy var shipper = APIShipper(buffer: buffer)

    // MARK: - Lifecycle

    func setZoom(_ factor: CGFloat) {
        camera.setZoom(factor)
        currentZoom = factor
    }

    func resetZoom() {
        camera.resetZoom()
        currentZoom = 1.0
    }

    func rotatePreviewCW() {
        let next = (previewRotation + 90).truncatingRemainder(dividingBy: 360)
        previewRotation = next
        UserDefaults.standard.set(next, forKey: "previewRotation")
    }

    func rotatePreviewCCW() {
        let next = (previewRotation - 90 + 360).truncatingRemainder(dividingBy: 360)
        previewRotation = next
        UserDefaults.standard.set(next, forKey: "previewRotation")
    }

    func start() {
        UIApplication.shared.isIdleTimerDisabled = true
        // Confirm device type on launch so we can verify iPad detection in the console.
        let idiom = UIDevice.current.userInterfaceIdiom
        print("[SeaToSky] Device: \(idiom == .pad ? "iPad" : "iPhone")  (userInterfaceIdiom=\(idiom.rawValue))")
        counter.wireX     = tripwireX    // apply persisted values before first frame
        counter.wireAngle = wireAngle

        counter.onCrossing = { [weak self] detection in
            guard let self else { return }
            self.buffer.append(detection)
            DispatchQueue.main.async {
                if detection.direction == Config.directionA {
                    self.countA += 1
                } else {
                    self.countB += 1
                }
                self.pending = self.buffer.count
            }
        }

        shipper.onSync = { [weak self] success, count in
            guard let self else { return }
            // onSync is already called on main (see APIShipper)
            if success {
                self.lastSyncDate  = self.shipper.lastSyncDate
                self.lastSyncCount = count
            }
            self.pending = self.buffer.count
        }

        camera.delegate = self
        // configure completion is dispatched to main by CameraCapture
        camera.configure { [weak self] result in
            guard let self else { return }
            switch result {
            case .success:
                self.isDetectorReady = self.detector.isReady
                if !self.detector.isReady { self.waitForDetector() }
                if self.isMirrored { self.camera.setOutputMirrored(true) }
                self.camera.start()
                self.shipper.start()   // Timer.scheduledTimer — must be on main ✓
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

    func syncNow() { shipper.syncNow() }

    func flipCamera() {
        camera.flipCamera { [weak self] result in
            guard let self else { return }
            switch result {
            case .success:
                self.isFrontCamera.toggle()
            case .failure(let err):
                self.errorMessage = err.localizedDescription
            }
        }
    }

    func toggleMirror() {
        let next = !isMirrored
        camera.setOutputMirrored(next)
        isMirrored = next
        UserDefaults.standard.set(next, forKey: "isMirrored")
    }

    func resetCounts() {
        counter.reset()
        DispatchQueue.main.async {
            self.countA = 0
            self.countB = 0
        }
    }

    // MARK: - Private

    private func waitForDetector() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self else { return }
            if self.detector.isReady {
                self.isDetectorReady = true
            } else {
                self.waitForDetector()
            }
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
        DispatchQueue.main.async { [weak self] in
            self?.visibleBoxes = snap
        }
    }
}
