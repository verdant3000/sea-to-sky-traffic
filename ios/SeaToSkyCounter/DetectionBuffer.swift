import Foundation

// Thread-safe in-memory buffer. Holds detections until the next API sync.
// If the phone is offline the buffer grows; it drains on next successful POST.
class DetectionBuffer {
    private var buffer: [Detection] = []
    private let lock = NSLock()
    private let cap  = 20_000   // ~14 days of data at 1 vehicle/min

    var count: Int {
        lock.withLock { buffer.count }
    }

    func append(_ detection: Detection) {
        lock.withLock {
            if buffer.count < cap { buffer.append(detection) }
        }
    }

    // Returns and clears the buffer atomically.
    func flush() -> [Detection] {
        lock.withLock {
            let batch = buffer
            buffer.removeAll()
            return batch
        }
    }

    // Put detections back when a POST fails, so they aren't lost.
    func prepend(_ detections: [Detection]) {
        lock.withLock {
            buffer.insert(contentsOf: detections, at: 0)
        }
    }
}
