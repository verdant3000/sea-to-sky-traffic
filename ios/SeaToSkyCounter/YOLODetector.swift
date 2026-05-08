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
    private var frameCount  = 0
    private var loggedResultType = false

    init() { loadModel() }

    private func loadModel() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            do {
                guard let url = Bundle.main.url(forResource: "yolov8n", withExtension: "mlmodelc") else {
                    print("[YOLO] ❌ yolov8n.mlmodelc not found in bundle")
                    return
                }
                let cfg       = MLModelConfiguration()
                cfg.computeUnits = .cpuAndNeuralEngine
                let mlModel   = try MLModel(contentsOf: url, configuration: cfg)
                let desc      = mlModel.modelDescription

                // Print model metadata so we can verify dimensions on device.
                let inputNames  = desc.inputDescriptionsByName.keys.sorted().joined(separator: ", ")
                let outputNames = desc.outputDescriptionsByName.keys.sorted().joined(separator: ", ")
                print("[YOLO] Inputs:  \(inputNames)")
                print("[YOLO] Outputs: \(outputNames)")
                if let imgConstraint = desc.inputDescriptionsByName.values.first?.imageConstraint {
                    print("[YOLO] Image:   \(imgConstraint.pixelsWide)×\(imgConstraint.pixelsHigh)")
                } else {
                    // Multi-array input — print shape
                    desc.inputDescriptionsByName.values.forEach { d in
                        if let c = d.multiArrayConstraint {
                            print("[YOLO] MultiArray input shape: \(c.shape)")
                        }
                    }
                }

                let vnModel = try VNCoreMLModel(for: mlModel)
                let req     = VNCoreMLRequest(model: vnModel)
                // scaleFit letterboxes the landscape frame to 640×640 without
                // distortion — matches how YOLOv8 was trained.
                req.imageCropAndScaleOption = .scaleFit
                self.request = req
                self.isReady = true
                print("[YOLO] ✓ Model ready")
            } catch {
                print("[YOLO] ❌ Load failed: \(error)")
            }
        }
    }

    func detect(pixelBuffer: CVPixelBuffer) -> [BoundingBox] {
        guard let request else { return [] }
        frameCount += 1

        if frameCount == 1 {
            let w = CVPixelBufferGetWidth(pixelBuffer)
            let h = CVPixelBufferGetHeight(pixelBuffer)
            print("[YOLO] First frame pixel buffer: \(w)×\(h)")
        }

        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
        do {
            try handler.perform([request])
        } catch {
            print("[YOLO] Inference error: \(error)")
            return []
        }

        // Log the result type once so we know what the model is outputting.
        if !loggedResultType {
            loggedResultType = true
            if let r = request.results?.first {
                print("[YOLO] Result type: \(type(of: r))")
            } else {
                print("[YOLO] Results: nil or empty")
            }
        }

        guard let obs = request.results?.first as? VNCoreMLFeatureValueObservation,
              let arr = obs.featureValue.multiArrayValue else {
            let nmsResults = request.results as? [VNRecognizedObjectObservation] ?? []
            if !nmsResults.isEmpty {
                print("[YOLO] Got VNRecognizedObjectObservation (\(nmsResults.count)) — model has NMS built in")
                return parseRecognizedObjects(nmsResults)
            }
            return []
        }
        return parseRawOutput(arr)
    }

    // MARK: - Raw tensor output (nms=False export)

    private func parseRawOutput(_ arr: MLMultiArray) -> [BoundingBox] {
        let rank      = arr.shape.count
        let numAttrs  = arr.shape[rank - 2].intValue   // 84
        let numBoxes  = arr.shape[rank - 1].intValue   // 8400
        let numClasses = numAttrs - 4                   // 80

        let attrStride = arr.strides[rank - 2].intValue
        let boxStride  = arr.strides[rank - 1].intValue
        let ptr        = arr.dataPointer.bindMemory(to: Float32.self, capacity: arr.count)

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
            // CLASS FILTER DISABLED for debugging — drawing all detections.
            // Restore when YOLO is confirmed working: guard Config.vehicleClasses[bestClass] != nil

            let cx = CGFloat(ptr[0 * attrStride + col * boxStride])
            let cy = CGFloat(ptr[1 * attrStride + col * boxStride])
            let bw = CGFloat(ptr[2 * attrStride + col * boxStride])
            let bh = CGFloat(ptr[3 * attrStride + col * boxStride])

            rects.append(CGRect(x: cx - bw/2, y: cy - bh/2, width: bw, height: bh))
            scores.append(bestScore)
            classes.append(bestClass)
        }

        let kept  = nonMaxSuppression(boxes: rects, scores: scores, iouThreshold: Config.iouThreshold)
        let boxes = kept.map { i -> BoundingBox in
            let name = Config.vehicleClasses[classes[i]] ?? "cls_\(classes[i])"
            return BoundingBox(classIndex: classes[i], className: name,
                               confidence: scores[i], rect: rects[i])
        }

        if frameCount % 30 == 0 {
            print("[YOLO] frame=\(frameCount)  raw_candidates=\(rects.count)  kept=\(boxes.count)")
        }

        return boxes
    }

    // MARK: - Built-in NMS output (fallback)

    private func parseRecognizedObjects(_ obs: [VNRecognizedObjectObservation]) -> [BoundingBox] {
        obs.compactMap { o in
            guard let top = o.labels.first, top.confidence >= Config.confidenceThreshold else { return nil }
            let r = o.boundingBox   // VN coords: origin bottom-left, y inverted
            let flipped = CGRect(x: r.minX, y: 1 - r.maxY, width: r.width, height: r.height)
            let name = top.identifier
            return BoundingBox(classIndex: 0, className: name,
                               confidence: top.confidence, rect: flipped)
        }
    }
}
