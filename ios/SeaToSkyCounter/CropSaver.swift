import Photos
import UIKit

class CropSaver: ObservableObject {

    private var authorized = false

    init() {
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        switch status {
        case .authorized, .limited:
            authorized = true
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
                self?.authorized = (status == .authorized || status == .limited)
            }
        default:
            print("[CropSaver] Photos access denied — crops will not be saved")
        }
    }

    /// Crop `frame` to the normalized bounding box rect and save to Photos.
    /// Called from the main thread; crop + write dispatched to background.
    func save(frame: UIImage, rect: CGRect, stationID: Int, className: String, confidence: Float) {
        guard authorized else { return }
        let filename = makeFilename(stationID: stationID, className: className, confidence: confidence)

        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self,
                  let cropped = self.crop(frame, to: rect),
                  let data = cropped.jpegData(compressionQuality: 0.85) else { return }

            PHPhotoLibrary.shared().performChanges {
                let req = PHAssetCreationRequest.forAsset()
                let opts = PHAssetResourceCreationOptions()
                opts.originalFilename = filename
                req.addResource(with: .photo, data: data, options: opts)
            } completionHandler: { _, error in
                if let error {
                    print("[CropSaver] Save failed: \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - Private

    private func crop(_ image: UIImage, to normalizedRect: CGRect) -> UIImage? {
        guard let cg = image.cgImage else { return nil }
        let w = CGFloat(cg.width)
        let h = CGFloat(cg.height)
        let pixel = CGRect(
            x:      normalizedRect.minX  * w,
            y:      normalizedRect.minY  * h,
            width:  normalizedRect.width  * w,
            height: normalizedRect.height * h
        ).intersection(CGRect(x: 0, y: 0, width: w, height: h))
        guard pixel.width > 0, pixel.height > 0,
              let cropped = cg.cropping(to: pixel) else { return nil }
        return UIImage(cgImage: cropped, scale: image.scale, orientation: image.imageOrientation)
    }

    private func makeFilename(stationID: Int, className: String, confidence: Float) -> String {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withYear, .withMonth, .withDay,
                             .withTime, .withTimeZone, .withDashSeparatorInDate,
                             .withColonSeparatorInTime]
        let ts = fmt.string(from: Date())
            .replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: ":", with: "")
        let pct = Int(confidence * 100)
        return "STS_\(stationID)_\(ts)_\(className)_\(pct).jpg"
    }
}
