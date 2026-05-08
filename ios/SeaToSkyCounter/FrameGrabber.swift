import AVFoundation
import CoreImage
import UIKit

class FrameGrabber: NSObject, ObservableObject, AVCaptureVideoDataOutputSampleBufferDelegate {

    @Published var detections: [BoundingBox] = []
    @Published var lastFrame:  UIImage?       = nil
    @Published var isDetectorReady: Bool      = false

    private let detector    = YOLODetector()
    private let videoOutput = AVCaptureVideoDataOutput()
    private let outputQueue = DispatchQueue(label: "com.seatosky.yolo.output", qos: .userInteractive)
    private var frameIndex  = 0
    private var attached    = false

    // Reused across frames — CIContext is expensive to create.
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

    // MARK: - Attach to running session

    func attach(to session: AVCaptureSession) {
        guard !attached else { return }
        attached = true

        videoOutput.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        videoOutput.alwaysDiscardsLateVideoFrames = true
        videoOutput.setSampleBufferDelegate(self, queue: outputQueue)

        session.beginConfiguration()
        if session.canAddOutput(videoOutput) {
            session.addOutput(videoOutput)
            if let conn = videoOutput.connection(with: .video) {
                if #available(iOS 17, *) {
                    if conn.isVideoRotationAngleSupported(0) { conn.videoRotationAngle = 0 }
                } else {
                    conn.videoOrientation = .landscapeRight
                }
            }
            print("[Grabber] Video output attached")
        } else {
            print("[Grabber] ❌ Could not add video output")
        }
        session.commitConfiguration()

        waitForDetector()
    }

    // MARK: - Sample buffer delegate (background thread)

    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        frameIndex += 1
        guard frameIndex % 3 == 0 else { return }   // ~10 fps inference
        guard detector.isReady else { return }
        guard let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let boxes = detector.detect(pixelBuffer: pb)
        // Render to UIImage now, while pb is still valid (framework reclaims it after this call).
        let ci    = CIImage(cvPixelBuffer: pb)
        let frame = ciContext.createCGImage(ci, from: ci.extent).map { UIImage(cgImage: $0) }
        DispatchQueue.main.async {
            self.detections = boxes
            self.lastFrame  = frame
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
