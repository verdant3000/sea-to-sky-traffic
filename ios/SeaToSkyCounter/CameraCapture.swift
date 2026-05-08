import AVFoundation
import UIKit

protocol CameraCaptureDelegate: AnyObject {
    func cameraCapture(_ capture: CameraCapture, didOutput pixelBuffer: CVPixelBuffer)
}

class CameraCapture: NSObject {
    weak var delegate: CameraCaptureDelegate?

    private let session      = AVCaptureSession()
    private let videoOutput  = AVCaptureVideoDataOutput()
    private let sessionQueue = DispatchQueue(label: "com.seatosky.camera.session")
    private let outputQueue  = DispatchQueue(label: "com.seatosky.camera.output",
                                             qos: .userInteractive)

    private var currentInput:    AVCaptureDeviceInput?
    private var currentPosition: AVCaptureDevice.Position = .back
    private weak var previewLayer: AVCaptureVideoPreviewLayer?

    // MARK: - Setup

    func configure(completion: @escaping (Result<Void, Error>) -> Void) {
        sessionQueue.async { [weak self] in
            guard let self else { return }

            self.session.beginConfiguration()
            defer { self.session.commitConfiguration() }

            self.session.sessionPreset = .hd1280x720

            guard
                let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                let input  = try? AVCaptureDeviceInput(device: device),
                self.session.canAddInput(input)
            else {
                DispatchQueue.main.async {
                    completion(.failure(CameraError.deviceUnavailable))
                }
                return
            }
            self.session.addInput(input)
            self.currentInput    = input
            self.currentPosition = .back

            // Continuous auto-exposure; lock WB for consistent detection.
            try? device.lockForConfiguration()
            if device.isExposureModeSupported(.continuousAutoExposure) {
                device.exposureMode = .continuousAutoExposure
            }
            if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
                device.whiteBalanceMode = .continuousAutoWhiteBalance
            }
            device.unlockForConfiguration()

            self.videoOutput.setSampleBufferDelegate(self, queue: self.outputQueue)
            self.videoOutput.alwaysDiscardsLateVideoFrames = true
            self.videoOutput.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
            ]

            if self.session.canAddOutput(self.videoOutput) {
                self.session.addOutput(self.videoOutput)
            }

            self.applyOrientation()

            DispatchQueue.main.async { completion(.success(())) }
        }
    }

    func makePreviewLayer() -> AVCaptureVideoPreviewLayer {
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        previewLayer = layer
        return layer
    }

    func start() { sessionQueue.async { self.session.startRunning() } }
    func stop()  { sessionQueue.async { self.session.stopRunning()  } }

    // MARK: - Camera controls

    func flipCamera(completion: @escaping (Result<Void, Error>) -> Void) {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            let newPos: AVCaptureDevice.Position = self.currentPosition == .back ? .front : .back

            self.session.beginConfiguration()
            if let old = self.currentInput { self.session.removeInput(old) }

            guard
                let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: newPos),
                let input  = try? AVCaptureDeviceInput(device: device),
                self.session.canAddInput(input)
            else {
                self.session.commitConfiguration()
                DispatchQueue.main.async { completion(.failure(CameraError.deviceUnavailable)) }
                return
            }
            self.session.addInput(input)
            self.currentInput    = input
            self.currentPosition = newPos
            self.applyOrientation()
            self.session.commitConfiguration()
            DispatchQueue.main.async { completion(.success(())) }
        }
    }

    // Mirrors the pixel buffer fed to YOLO *and* the preview layer so
    // bounding boxes, tripwire, and the visible image stay in sync.
    func setMirrored(_ mirrored: Bool) {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if let conn = self.videoOutput.connection(with: .video),
               conn.isVideoMirroringSupported {
                conn.automaticallyAdjustsVideoMirroring = false
                conn.isVideoMirrored = mirrored
            }
            DispatchQueue.main.async { [weak self] in
                if let conn = self?.previewLayer?.connection,
                   conn.isVideoMirroringSupported {
                    conn.automaticallyAdjustsVideoMirroring = false
                    conn.isVideoMirrored = mirrored
                }
            }
        }
    }

    // MARK: - Private

    private func applyOrientation() {
        // Both iPhone and iPad: try .landscapeRight first.
        // If still wrong on iPad, the user can flip via the mirror button in-app.
        let orientation: AVCaptureVideoOrientation = .landscapeRight
        if let conn = videoOutput.connection(with: .video) {
            conn.videoOrientation = orientation
        }
    }
}

// MARK: - Sample buffer delegate

extension CameraCapture: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        delegate?.cameraCapture(self, didOutput: pb)
    }
}

// MARK: -

enum CameraError: LocalizedError {
    case deviceUnavailable
    var errorDescription: String? { "Camera is unavailable." }
}
