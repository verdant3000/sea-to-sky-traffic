import AVFoundation
import SwiftUI

struct LensOption: Identifiable {
    let id = UUID()
    let zoomFactor: CGFloat
    let label: String
}

class CameraSession: ObservableObject {

    let session = AVCaptureSession()

    @Published var lensOptions:      [LensOption] = []
    @Published var currentZoom:      CGFloat      = 1.0
    @Published var activeLensZoom:   CGFloat      = 1.0  // base zoom of selected lens, for button highlight

    private var device:       AVCaptureDevice?
    private let sessionQueue = DispatchQueue(label: "com.seatosky.camera.session")

    // MARK: - Lifecycle

    func start() {
        sessionQueue.async { self.configure() }
    }

    func stop() {
        sessionQueue.async { self.session.stopRunning() }
    }

    // MARK: - Zoom

    func setZoom(_ factor: CGFloat) {
        sessionQueue.async { [weak self] in
            guard let self, let device = self.device else { return }
            let clamped = factor.clamped(to: device.minAvailableVideoZoomFactor...min(device.maxAvailableVideoZoomFactor, 15.0))
            try? device.lockForConfiguration()
            device.videoZoomFactor = clamped
            device.unlockForConfiguration()
            DispatchQueue.main.async { self.currentZoom = clamped }
        }
    }

    func switchLens(to option: LensOption) {
        sessionQueue.async { [weak self] in
            guard let self, let device = self.device else { return }
            let factor = option.zoomFactor.clamped(to: device.minAvailableVideoZoomFactor...device.maxAvailableVideoZoomFactor)
            try? device.lockForConfiguration()
            device.videoZoomFactor = factor
            device.unlockForConfiguration()
            DispatchQueue.main.async {
                self.currentZoom    = factor
                self.activeLensZoom = option.zoomFactor  // use option value, not clamped, so highlight matches
            }
        }
    }

    // MARK: - Private

    private func configure() {
        session.beginConfiguration()
        session.sessionPreset = .hd1920x1080

        // Use DiscoverySession to enumerate every back camera the OS will expose.
        // AVCaptureDevice.default(_:for:position:) can silently return nil for types
        // the device has but hasn't granted access to yet, or on iPad where virtual
        // devices aren't always enumerated the same way as iPhone.
        let discoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [
                .builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera,
                .builtInUltraWideCamera, .builtInWideAngleCamera, .builtInTelephotoCamera,
            ],
            mediaType: .video,
            position:  .back
        )
        print("[Camera] DiscoverySession found \(discoverySession.devices.count) device(s):")
        for d in discoverySession.devices {
            print("[Camera]   \(d.deviceType)  '\(d.localizedName)'  switchFactors=\(d.virtualDeviceSwitchOverVideoZoomFactors)")
        }

        // Prefer virtual multi-lens device — one device, all lenses via videoZoomFactor.
        let virtualPriority: [AVCaptureDevice.DeviceType] = [
            .builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera,
        ]
        var found: AVCaptureDevice? = discoverySession.devices.first(where: { virtualPriority.contains($0.deviceType) })
        if let d = found { print("[Camera] Using virtual device: \(d.deviceType)") }

        // Fall back to discrete ultra-wide, then wide-angle.
        if found == nil {
            found = discoverySession.devices.first(where: { $0.deviceType == .builtInUltraWideCamera })
            if let d = found { print("[Camera] Using discrete ultra-wide") }
        }
        if found == nil {
            found = discoverySession.devices.first(where: { $0.deviceType == .builtInWideAngleCamera })
            if let d = found { print("[Camera] Using wide-angle only — digital zoom fallback") }
        }

        guard let device = found,
              let input  = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input)
        else {
            print("[Camera] ❌ Could not add input")
            session.commitConfiguration()
            return
        }

        session.addInput(input)
        self.device = device

        // Log zoom topology
        let switches = device.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat($0.doubleValue) }
        print("[Camera] switchOverFactors: \(switches)  min=\(device.minAvailableVideoZoomFactor)  max=\(device.maxAvailableVideoZoomFactor)")

        // Build lens options
        let options = buildLensOptions(device: device, switchFactors: switches)

        // Start at ultra-wide (minimum zoom = widest lens)
        let startZoom = device.minAvailableVideoZoomFactor
        try? device.lockForConfiguration()
        device.videoZoomFactor = startZoom
        if device.isExposureModeSupported(.continuousAutoExposure) { device.exposureMode = .continuousAutoExposure }
        if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) { device.whiteBalanceMode = .continuousAutoWhiteBalance }
        device.unlockForConfiguration()

        session.commitConfiguration()
        session.startRunning()

        DispatchQueue.main.async {
            self.lensOptions    = options
            self.currentZoom    = startZoom
            self.activeLensZoom = options.first?.zoomFactor ?? startZoom
        }

        print("[Camera] ✓ Running  lenses: \(options.map(\.label).joined(separator: ", "))")
    }

    private func buildLensOptions(device: AVCaptureDevice, switchFactors: [CGFloat]) -> [LensOption] {
        let minZoom = device.minAvailableVideoZoomFactor

        if switchFactors.isEmpty {
            // Single physical lens — offer digital zoom presets so there's always something to tap
            return [
                LensOption(zoomFactor: 1.0, label: "1×"),
                LensOption(zoomFactor: 2.0, label: "2×"),
                LensOption(zoomFactor: 5.0, label: "5×"),
            ]
        }

        // switchFactors[0] = zoom where ultra-wide → wide transition happens
        // switchFactors[1] = zoom where wide → tele transition happens (if present)
        var opts: [LensOption] = [
            LensOption(zoomFactor: minZoom,           label: "0.5×"),
            LensOption(zoomFactor: switchFactors[0],  label: "1×"),
        ]
        if switchFactors.count >= 2 {
            let f = switchFactors[1]
            let label = f.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(f))×" : String(format: "%.1f×", f)
            opts.append(LensOption(zoomFactor: f, label: label))
        }
        return opts
    }
}

// MARK: -

private extension CGFloat {
    func clamped(to range: ClosedRange<CGFloat>) -> CGFloat {
        Swift.min(Swift.max(self, range.lowerBound), range.upperBound)
    }
}
