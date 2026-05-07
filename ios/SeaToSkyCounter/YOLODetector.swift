import Vision
import CoreML
import CoreGraphics

struct BoundingBox {
    let classIndex: Int
    let className:  String
    let confidence: Float
    let rect:       CGRect   // normalized 0-1, origin top-left
}

class YOLODetector {
    private var request: VNCoreMLRequest?
    private(set) var isReady = false

    init() {
        loadModel()
    }

    private func loadModel() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            do {
                // Xcode compiles yolov8n.mlpackage → yolov8n.mlmodelc in the bundle.
                guard let url = Bundle.main.url(forResource: "yolov8n", withExtension: "mlmodelc") else {
                    print("[YOLO] yolov8n.mlmodelc not found in bundle — did you add the .mlpackage to Xcode?")
                    return
                }
                let cfg = MLModelConfiguration()
                cfg.computeUnits = .cpuAndNeuralEngine   // GPU fallback removed; Neural Engine preferred
                let mlModel  = try MLModel(contentsOf: url, configuration: cfg)
                let vnModel  = try VNCoreMLModel(for: mlModel)
                let req      = VNCoreMLRequest(model: vnModel)
                req.imageCropAndScaleOption = .scaleFill  // matches resizeAspectFill display
                self.request = req
                self.isReady = true
                print("[YOLO] Model ready")
            } catch {
                print("[YOLO] Load failed: \(error)")
            }
        }
    }

    // Called on a background queue. Returns synchronously.
    func detect(pixelBuffer: CVPixelBuffer) -> [BoundingBox] {
        guard let request else { return [] }
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
        do {
            try handler.perform([request])
        } catch {
            print("[YOLO] Inference error: \(error)")
            return []
        }
        guard let obs = request.results?.first as? VNCoreMLFeatureValueObservation,
              let arr = obs.featureValue.multiArrayValue else { return [] }
        return parseOutput(arr)
    }

    // yolov8n output: [1, 84, 8400] or [84, 8400]
    //   rows 0-3: cx, cy, w, h (normalized 0-1)
    //   rows 4-83: class confidence scores
    private func parseOutput(_ arr: MLMultiArray) -> [BoundingBox] {
        let rank = arr.shape.count
        let numAttrs = arr.shape[rank - 2].intValue   // 84
        let numBoxes = arr.shape[rank - 1].intValue   // 8400
        let numClasses = numAttrs - 4                  // 80

        // Use strides for correct layout regardless of batch dimension.
        let attrStride = arr.strides[rank - 2].intValue
        let boxStride  = arr.strides[rank - 1].intValue

        let ptr = arr.dataPointer.bindMemory(to: Float32.self, capacity: arr.count)

        var rects:   [CGRect] = []
        var scores:  [Float]  = []
        var classes: [Int]    = []

        for col in 0..<numBoxes {
            var bestScore: Float = 0
            var bestClass = -1

            for c in 0..<numClasses {
                let score = ptr[(4 + c) * attrStride + col * boxStride]
                if score > bestScore { bestScore = score; bestClass = c }
            }

            guard bestScore >= Config.confidenceThreshold else { continue }
            guard Config.vehicleClasses[bestClass] != nil  else { continue }

            let cx = CGFloat(ptr[0 * attrStride + col * boxStride])
            let cy = CGFloat(ptr[1 * attrStride + col * boxStride])
            let bw = CGFloat(ptr[2 * attrStride + col * boxStride])
            let bh = CGFloat(ptr[3 * attrStride + col * boxStride])

            rects.append(CGRect(x: cx - bw/2, y: cy - bh/2, width: bw, height: bh))
            scores.append(bestScore)
            classes.append(bestClass)
        }

        let kept = nonMaxSuppression(boxes: rects, scores: scores, iouThreshold: Config.iouThreshold)

        return kept.compactMap { i -> BoundingBox? in
            guard let name = Config.vehicleClasses[classes[i]] else { return nil }
            return BoundingBox(classIndex: classes[i], className: name,
                               confidence: scores[i], rect: rects[i])
        }
    }
}
