import CoreGraphics

struct BoundingBox {
    let classIndex: Int
    let className:  String
    let confidence: Float
    let rect:       CGRect   // normalized 0–1, origin top-left
}
