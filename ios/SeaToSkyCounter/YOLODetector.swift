import Vision
import CoreML
import CoreGraphics

class YOLODetector {
    private var request: VNCoreMLRequest?
    private(set) var isReady = false
    private var loggedResultType = false

    init() { loadModel() }

    private func loadModel() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            do {
                let cfg = MLModelConfiguration()
                cfg.computeUnits = .cpuOnly   // Neural Engine caused err=-12710 on this device

                // Try runtime compile from .mlpackage first — bypasses the on-device
                // optimization cache that causes "fopen failed / Invalidating cache"
                // on iPhone 12. Fall back to pre-compiled .mlmodelc if Xcode compiled
                // the package at build time instead of copying it raw.
                let mlModel: MLModel
                if let packageURL = Bundle.main.url(forResource: "yolov8n", withExtension: "mlpackage") {
                    print("[YOLO] Found .mlpackage — compiling at runtime…")
                    let compiledURL = try MLModel.compileModel(at: packageURL)
                    mlModel = try MLModel(contentsOf: compiledURL, configuration: cfg)
                } else if let compiledURL = Bundle.main.url(forResource: "yolov8n", withExtension: "mlmodelc") {
                    print("[YOLO] Found .mlmodelc — loading pre-compiled model…")
                    mlModel = try MLModel(contentsOf: compiledURL, configuration: cfg)
                } else {
                    print("[YOLO] ❌ Model not found in bundle (tried .mlpackage and .mlmodelc)")
                    return
                }
                let outputs = mlModel.modelDescription.outputDescriptionsByName.keys.sorted().joined(separator: ", ")
                print("[YOLO] Outputs: \(outputs)")

                let vnModel = try VNCoreMLModel(for: mlModel)
                let req     = VNCoreMLRequest(model: vnModel)
                req.imageCropAndScaleOption = .scaleFit   // letterbox to 640×640 — matches YOLO training
                self.request = req
                self.isReady = true
                print("[YOLO] ✓ Ready (cpuOnly)")
            } catch {
                print("[YOLO] ❌ Load failed: \(error)")
            }
        }
    }

    func detect(pixelBuffer: CVPixelBuffer) -> [BoundingBox] {
        guard let request else { return [] }

        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
        do {
            try handler.perform([request])
        } catch {
            print("[YOLO] Inference error: \(error)")
            return []
        }

        // Log result type once so we know what the NMS=True export is producing.
        if !loggedResultType {
            loggedResultType = true
            if let r = request.results?.first {
                print("[YOLO] Result type: \(type(of: r))  count=\(request.results?.count ?? 0)")
            } else {
                print("[YOLO] Results: nil or empty")
            }
        }

        // NMS=True export: Vision returns VNRecognizedObjectObservation with class labels.
        if let obs = request.results as? [VNRecognizedObjectObservation] {
            return obs.compactMap { o in
                guard let top = o.labels.first, top.confidence >= 0.15 else { return nil }
                let r = o.boundingBox                  // Vision: origin bottom-left
                let flipped = CGRect(x: r.minX, y: 1 - r.maxY, width: r.width, height: r.height)
                return BoundingBox(classIndex: 0, className: top.identifier,
                                   confidence: top.confidence, rect: flipped)
            }
        }

        // NMS=False fallback: raw [1, 84, 8400] tensor.
        if let obs = request.results?.first as? VNCoreMLFeatureValueObservation,
           let arr = obs.featureValue.multiArrayValue {
            return parseRawTensor(arr)
        }

        return []
    }

    // MARK: - Raw tensor (nms=False export)

    private func parseRawTensor(_ arr: MLMultiArray) -> [BoundingBox] {
        let rank     = arr.shape.count
        let numAttrs = arr.shape[rank - 2].intValue   // 84
        let numBoxes = arr.shape[rank - 1].intValue   // 8400
        let numCls   = numAttrs - 4

        let attrStride = arr.strides[rank - 2].intValue
        let boxStride  = arr.strides[rank - 1].intValue
        let ptr        = arr.dataPointer.bindMemory(to: Float32.self, capacity: arr.count)

        var rects:   [CGRect] = []
        var scores:  [Float]  = []
        var classes: [Int]    = []

        for col in 0..<numBoxes {
            var best: Float = 0; var bestCls = -1
            for c in 0..<numCls {
                let s = ptr[(4 + c) * attrStride + col * boxStride]
                if s > best { best = s; bestCls = c }
            }
            guard best >= 0.15 else { continue }

            let cx = CGFloat(ptr[0 * attrStride + col * boxStride])
            let cy = CGFloat(ptr[1 * attrStride + col * boxStride])
            let bw = CGFloat(ptr[2 * attrStride + col * boxStride])
            let bh = CGFloat(ptr[3 * attrStride + col * boxStride])
            rects.append(CGRect(x: cx - bw/2, y: cy - bh/2, width: bw, height: bh))
            scores.append(best)
            classes.append(bestCls)
        }

        let kept = nms(boxes: rects, scores: scores, iouThreshold: 0.45)
        return kept.map { i in
            let name = cocoName(classes[i])
            return BoundingBox(classIndex: classes[i], className: name,
                               confidence: scores[i], rect: rects[i])
        }
    }

    private func cocoName(_ idx: Int) -> String {
        let names = [
            1: "bicycle", 2: "car", 3: "motorcycle",
            5: "bus", 7: "truck",
        ]
        return names[idx] ?? "cls_\(idx)"
    }

    // Greedy NMS
    private func nms(boxes: [CGRect], scores: [Float], iouThreshold: Float) -> [Int] {
        let order = scores.indices.sorted { scores[$0] > scores[$1] }
        var kept: [Int] = []
        var suppressed = Set<Int>()
        for i in order {
            guard !suppressed.contains(i) else { continue }
            kept.append(i)
            for j in order where j != i && !suppressed.contains(j) {
                if iou(boxes[i], boxes[j]) > iouThreshold { suppressed.insert(j) }
            }
        }
        return kept
    }

    private func iou(_ a: CGRect, _ b: CGRect) -> Float {
        let inter = a.intersection(b)
        guard !inter.isNull else { return 0 }
        let interArea = Float(inter.width * inter.height)
        let union = Float(a.width * a.height) + Float(b.width * b.height) - interArea
        return union > 0 ? interArea / union : 0
    }
}
