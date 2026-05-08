import AVFoundation

// Represents one physical back camera (ultra-wide, wide, telephoto).
struct CameraLens: Identifiable, Equatable {
    let id          = UUID()
    let deviceType: AVCaptureDevice.DeviceType
    let label:      String    // "0.5×", "1×", "2×", …
    let baseZoom:   CGFloat   // optical zoom relative to wide angle
}

protocol CameraCaptureDelegate: AnyObject {
    func cameraCapture(_ capture: CameraCapture, didOutput pixelBuffer: CVPixelBuffer)
}

class CameraCapture: NSObject {
    weak var delegate: CameraCaptureDelegate?

    let session      = AVCaptureSession()
    private let videoOutput  = AVCaptureVideoDataOutput()
    private let sessionQueue = DispatchQueue(label: "com.seatosky.camera.session")
    private let outputQueue  = DispatchQueue(label: "com.seatosky.camera.output",
                                             qos: .userInteractive)

    private var currentInput:      AVCaptureDeviceInput?
    private var currentDevice:     AVCaptureDevice?
    private(set) var currentLens:  CameraLens?
    private(set) var availableLenses: [CameraLens] = []

    // MARK: - Setup

    func configure(completion: @escaping (Result<Void, Error>) -> Void) {
        sessionQueue.async { [weak self] in
            guard let self else { return }

            self.availableLenses = Self.discoverLenses()

            self.session.beginConfiguration()
            defer { self.session.commitConfiguration() }

            self.session.sessionPreset = .hd1280x720

            // Prefer ultra-wide (widest highway coverage); fall back to wide angle.
            let preferredType: AVCaptureDevice.DeviceType =
                self.availableLenses.first?.deviceType ?? .builtInWideAngleCamera

            guard
                let device = AVCaptureDevice.default(preferredType, for: .video, position: .back),
                let input  = try? AVCaptureDeviceInput(device: device),
                self.session.canAddInput(input)
            else {
                DispatchQueue.main.async { completion(.failure(CameraError.deviceUnavailable)) }
                return
            }
            self.session.addInput(input)
            self.currentInput  = input
            self.currentDevice = device
            self.currentLens   = self.availableLenses.first(where: { $0.deviceType == preferredType })

            try? device.lockForConfiguration()
            device.videoZoomFactor = 1.0
            if device.isExposureModeSupported(.continuousAutoExposure) {
                device.exposureMode = .continuousAutoExposure
            }
            if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
                device.whiteBalanceMode = .continuousAutoWhiteBalance
            }
            device.unlockForConfiguration()

            print("[SeaToSky] Lenses: \(self.availableLenses.map(\.label).joined(separator: ", "))")
            print("[SeaToSky] Active: \(self.currentLens?.label ?? "?")  " +
                  "zoom=\(device.videoZoomFactor)  " +
                  "min=\(device.minAvailableVideoZoomFactor)  " +
                  "max=\(device.activeFormat.videoMaxZoomFactor.rounded())")

            self.videoOutput.setSampleBufferDelegate(self, queue: self.outputQueue)
            self.videoOutput.alwaysDiscardsLateVideoFrames = true
            self.videoOutput.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
            ]

            if self.session.canAddOutput(self.videoOutput) {
                self.session.addOutput(self.videoOutput)
            }

            self.applyOutputOrientation()

            DispatchQueue.main.async { completion(.success(())) }
        }
    }

    func start() { sessionQueue.async { self.session.startRunning() } }
    func stop()  { sessionQueue.async { self.session.stopRunning()  } }

    // MARK: - Lens switching

    func switchToLens(_ lens: CameraLens, completion: @escaping (Result<Void, Error>) -> Void) {
        sessionQueue.async { [weak self] in
            guard let self else { return }

            self.session.beginConfiguration()
            if let old = self.currentInput { self.session.removeInput(old) }

            guard
                let device = AVCaptureDevice.default(lens.deviceType, for: .video, position: .back),
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
            self.currentInput  = input
            self.currentDevice = device
            self.currentLens   = lens
            self.applyOutputOrientation()
            self.session.commitConfiguration()
            DispatchQueue.main.async { completion(.success(())) }
        }
    }

    // MARK: - Zoom

    func setZoom(_ factor: CGFloat) {
        sessionQueue.async { [weak self] in
            guard let device = self?.currentDevice else { return }
            let maxZoom = min(device.activeFormat.videoMaxZoomFactor, 10.0)
            let clamped = min(max(factor, device.minAvailableVideoZoomFactor), maxZoom)
            try? device.lockForConfiguration()
            device.videoZoomFactor = clamped
            device.unlockForConfiguration()
        }
    }

    func resetZoom() { setZoom(1.0) }

    // MARK: - Mirror

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
            if conn.isVideoRotationAngleSupported(0) { conn.videoRotationAngle = 0 }
        } else {
            conn.videoOrientation = .landscapeRight
        }
    }

    // Discover available back lenses, ordered widest → narrowest.
    private static func discoverLenses() -> [CameraLens] {
        var lenses: [CameraLens] = []
        if AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back) != nil {
            lenses.append(.init(deviceType: .builtInUltraWideCamera, label: "0.5×", baseZoom: 0.5))
        }
        if AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) != nil {
            lenses.append(.init(deviceType: .builtInWideAngleCamera, label: "1×", baseZoom: 1.0))
        }
        if AVCaptureDevice.default(.builtInTelephotoCamera, for: .video, position: .back) != nil {
            let factor = telephotoOpticalZoom()
            let label  = factor.truncatingRemainder(dividingBy: 1) == 0
                ? "\(Int(factor))×" : "\(factor)×"
            lenses.append(.init(deviceType: .builtInTelephotoCamera, label: label,
                                baseZoom: CGFloat(factor)))
        }
        return lenses
    }

    // Find the optical zoom of the telephoto lens relative to wide angle
    // by reading virtualDeviceSwitchOverVideoZoomFactors from a virtual device.
    private static func telephotoOpticalZoom() -> Double {
        for deviceType in [AVCaptureDevice.DeviceType.builtInTripleCamera,
                           .builtInDualCamera] {
            if let vd = AVCaptureDevice.default(deviceType, for: .video, position: .back),
               let factor = vd.virtualDeviceSwitchOverVideoZoomFactors.last {
                return factor.doubleValue
            }
        }
        return 2.0  // safe fallback for iPhone 7 Plus and similar
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
