import AVFoundation
import UIKit

// UIViewController that owns AVCaptureVideoPreviewLayer.
// Wrapped by CameraPreviewView (UIViewControllerRepresentable) in ContentView.
final class CameraPreviewViewController: UIViewController {

    private let previewLayer: AVCaptureVideoPreviewLayer

    init(session: AVCaptureSession) {
        self.previewLayer = AVCaptureVideoPreviewLayer(session: session)
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        previewLayer.videoGravity = .resizeAspectFill
        previewLayer.frame = view.bounds
        view.layer.addSublayer(previewLayer)
        applyRotation()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = view.bounds
    }

    // Called from updateUIViewController whenever vm.isMirrored changes.
    func setMirrored(_ mirrored: Bool) {
        guard let conn = previewLayer.connection,
              conn.isVideoMirroringSupported else { return }
        conn.automaticallyAdjustsVideoMirroring = false
        conn.isVideoMirrored = mirrored
    }

    // MARK: - Private

    private func applyRotation() {
        guard let conn = previewLayer.connection else { return }
        if #available(iOS 17, *) {
            // 0° = no rotation from sensor native = landscape-right on all iPhones/iPads.
            if conn.isVideoRotationAngleSupported(0) {
                conn.videoRotationAngle = 0
            }
        } else {
            conn.videoOrientation = .landscapeRight
        }
    }
}
