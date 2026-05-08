import AVFoundation

protocol CameraCaptureDelegate: AnyObject {
    func cameraCapture(_ capture: CameraCapture, didOutput pixelBuffer: CVPixelBuffer)
}

class CameraCapture: NSObject {
    weak var delegate: CameraCaptureDelegate?

    // Exposed so CameraPreviewViewController can attach its preview layer.
    let session      = AVCaptureSession()
    private let videoOutput  = AVCaptureVideoDataOutput()
    private let sessionQueue = DispatchQueue(label: "com.seatosky.camera.session")
    private let outputQueue  = DispatchQueue(label: "com.seatosky.camera.output",
                                             qos: .userInteractive)

    private var currentInput:    AVCaptureDeviceInput?
    private var currentPosition: AVCaptureDevice.Position = .back

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
                DispatchQueue.main.async { completion(.failure(CameraError.deviceUnavailable)) }
                return
            }
            self.session.addInput(input)
            self.currentInput    = input
            self.currentPosition = .back

            try? device.lockForConfiguration()
            device.videoZoomFactor = 1.0   // prevent any automatic digital zoom
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

            // Keep the pixel buffer in landscape orientation so YOLO
            // receives frames that match what the preview layer shows.
            self.applyOutputOrientation()

            DispatchQueue.main.async { completion(.success(())) }
        }
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
            try? device.lockForConfiguration()
            device.videoZoomFactor = 1.0
            device.unlockForConfiguration()
            self.currentInput    = input
            self.currentPosition = newPos
            self.applyOutputOrientation()
            self.session.commitConfiguration()
            DispatchQueue.main.async { completion(.success(())) }
        }
    }

    // Mirrors the pixel buffer fed to YOLO so it matches the preview layer.
    // The preview layer's own mirroring is handled by CameraPreviewViewController.
    func setOutputMirrored(_ mirrored: Bool) {
        sessionQueue.async { [weak self] in
            guard let self,
                  let conn = self.videoOutput.connection(with: .video),
                  conn.isVideoMirroringSupported else { return }
            conn.automaticallyAdjustsVideoMirroring = false
            conn.isVideoMirrored = mirrored
        }
    }

    // MARK: - Private

    private func applyOutputOrientation() {
        guard let conn = videoOutput.connection(with: .video) else { return }
        if #available(iOS 17, *) {
            // 0° = sensor-native landscape orientation (no rotation).
            // The preview layer uses the same angle so both are identical.
            if conn.isVideoRotationAngleSupported(0) {
                conn.videoRotationAngle = 0
            }
        } else {
            conn.videoOrientation = .landscapeRight
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
    var errorDescription: String? { "Back camera is unavailable." }
}
