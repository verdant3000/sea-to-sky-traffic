import CoreGraphics

// Non-maximum suppression. Returns indices of kept boxes, sorted by score descending.
func nonMaxSuppression(boxes: [CGRect], scores: [Float], iouThreshold: Float) -> [Int] {
    guard !boxes.isEmpty else { return [] }

    let order = scores.indices.sorted { scores[$0] > scores[$1] }
    var suppressed = [Bool](repeating: false, count: boxes.count)
    var kept: [Int] = []

    for i in order {
        guard !suppressed[i] else { continue }
        kept.append(i)
        for j in order where !suppressed[j] && j != i {
            if iou(boxes[i], boxes[j]) > iouThreshold {
                suppressed[j] = true
            }
        }
    }
    return kept
}

private func iou(_ a: CGRect, _ b: CGRect) -> Float {
    let inter = a.intersection(b)
    guard !inter.isNull else { return 0 }
    let interArea = Float(inter.width * inter.height)
    let unionArea = Float(a.width * a.height + b.width * b.height) - interArea
    return unionArea > 0 ? interArea / unionArea : 0
}
