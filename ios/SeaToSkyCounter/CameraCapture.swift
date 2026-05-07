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

            // Portrait orientation — phone mounted portrait on gorilla pod.
            if let conn = self.videoOutput.connection(with: .video) {
                conn.videoOrientation = .portrait
            }

            DispatchQueue.main.async { completion(.success(())) }
        }
    }

    func makePreviewLayer() -> AVCaptureVideoPreviewLayer {
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        return layer
    }

    func start() { sessionQueue.async { self.session.startRunning() } }
    func stop()  { sessionQueue.async { self.session.stopRunning()  } }
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
    var errorDescription: String? { "Back camera is unavailable." }
}
