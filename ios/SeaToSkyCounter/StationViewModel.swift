import AVFoundation
import Combine
import SwiftUI

@MainActor
class StationViewModel: NSObject, ObservableObject {

    // UI state
    @Published var countA:        Int    = 0    // northbound
    @Published var countB:        Int    = 0    // southbound
    @Published var pending:       Int    = 0
    @Published var lastSyncDate:  Date?  = nil
    @Published var lastSyncCount: Int    = 0
    @Published var isDetectorReady = false
    @Published var visibleBoxes:  [BoundingBox] = []
    @Published var errorMessage:  String? = nil

    // Sub-systems
    private let camera   = CameraCapture()
    private let detector = YOLODetector()
    private let counter  = TripwireCounter()
    private let buffer   = DetectionBuffer()
    private lazy var shipper = APIShipper(buffer: buffer)

    // Frame-skip counter (runs on outputQueue, not main)
    private var frameIndex = 0

    // Prevent UI from flooding with box updates on every frame — throttle to main.
    private var pendingBoxes: [BoundingBox] = []

    // MARK: - Lifecycle

    func start() {
        UIApplication.shared.isIdleTimerDisabled = true   // keep screen on

        counter.onCrossing = { [weak self] detection in
            self?.buffer.append(detection)
            DispatchQueue.main.async {
                if detection.direction == Config.directionA {
                    self?.countA += 1
                } else {
                    self?.countB += 1
                }
                self?.pending = self?.buffer.count ?? 0
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
                self.isDetectorReady = self.detector.isReady
                // Poll until detector is ready (model loads asynchronously).
                if !self.detector.isReady {
                    self.waitForDetector()
                }
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

    func makeCameraPreviewLayer() -> AVCaptureVideoPreviewLayer {
        camera.makePreviewLayer()
    }

    func syncNow() { shipper.syncNow() }

    func resetCounts() {
        countA = 0; countB = 0
        counter.reset()
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

// MARK: - Camera delegate (called on outputQueue — not main thread)

extension StationViewModel: CameraCaptureDelegate {
    nonisolated func cameraCapture(_ capture: CameraCapture, didOutput pixelBuffer: CVPixelBuffer) {
        frameIndex += 1
        guard frameIndex % Config.inferenceFrameSkip == 0 else { return }
        guard detector.isReady else { return }

        let boxes = detector.detect(pixelBuffer: pixelBuffer)
        counter.update(detections: boxes)

        // Push box update to main thread for rendering.
        let snap = boxes
        DispatchQueue.main.async { [weak self] in
            self?.visibleBoxes = snap
        }
    }
}
