import AVFoundation
import UIKit

class CameraPreviewViewController: UIViewController {

    private let previewLayer: AVCaptureVideoPreviewLayer

    init(session: AVCaptureSession) {
        previewLayer = AVCaptureVideoPreviewLayer(session: session)
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)

        // Try now; also re-apply when the session actually starts running
        // (connection may not exist until the session has inputs).
        applyOrientation()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(sessionStarted),
            name: .AVCaptureSessionDidStartRunning,
            object: nil
        )
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = view.bounds
    }

    @objc private func sessionStarted() {
        DispatchQueue.main.async { self.applyOrientation() }
    }

    private func applyOrientation() {
        guard let conn = previewLayer.connection else { return }
        if #available(iOS 17, *) {
            if conn.isVideoRotationAngleSupported(0) {
                conn.videoRotationAngle = 0   // sensor natural angle = landscape-right
            }
        } else {
            if conn.isVideoOrientationSupported {
                conn.videoOrientation = .landscapeRight
            }
        }
    }
}
