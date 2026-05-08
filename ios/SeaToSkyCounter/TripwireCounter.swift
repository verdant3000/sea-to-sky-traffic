import CoreGraphics
import Foundation

// One tracked object across inference frames.
private struct Track {
    let id:            UUID
    var className:     String
    var confidence:    Float
    var centX:         Double   // normalized — used for wire crossing
    var centY:         Double   // normalized — used for track matching + debounce
    var prevCentX:     Double   // previous X for crossing detection
    var framesTracked: Int
    var hasCrossed:    Bool
    var lastSeenFrame: Int
}

class TripwireCounter {

    private(set) var countA = 0   // directionA (northbound — left → right)
    private(set) var countB = 0   // directionB (southbound — right → left)

    var wireX: Double             // vertical tripwire X position (landscape) — mutable for live slider
    private var tracks: [UUID: Track] = [:]
    private var frame = 0

    // Debounce: record crossing centY positions + times (lane position in landscape).
    private var recentCrossings: [(centY: Double, time: Date)] = []

    // Called on a background queue; caller serialises all calls.
    var onCrossing: ((Detection) -> Void)?

    init(wireX: Double = Config.tripwireX) {
        self.wireX = wireX
    }

    func reset() {
        countA = 0; countB = 0
        tracks.removeAll(); recentCrossings.removeAll(); frame = 0
    }

    func update(detections: [BoundingBox]) {
        frame += 1
        var unmatched = detections

        // Update existing tracks.
        for (id, var track) in tracks {
            if let (idx, _) = bestMatch(for: track, in: unmatched) {
                let det = unmatched[idx]
                track.prevCentX     = track.centX
                track.centX         = Double(det.rect.midX)
                track.centY         = Double(det.rect.midY)
                track.className     = det.className
                track.confidence    = det.confidence
                track.framesTracked += 1
                track.lastSeenFrame = frame
                tracks[id]          = track
                unmatched.remove(at: idx)
                checkCrossing(&tracks[id]!)
            } else if frame - track.lastSeenFrame > Config.maxMissingFrames {
                tracks.removeValue(forKey: id)
            }
        }

        // Spawn new tracks for unmatched detections.
        for det in unmatched {
            let cx = Double(det.rect.midX)
            let id = UUID()
            tracks[id] = Track(
                id: id, className: det.className, confidence: det.confidence,
                centX: cx, centY: Double(det.rect.midY), prevCentX: cx,
                framesTracked: 1, hasCrossed: false, lastSeenFrame: frame
            )
        }

        // Prune stale debounce entries.
        let cutoff = Date().addingTimeInterval(-Config.crossingDebounceSec * 5)
        recentCrossings.removeAll { $0.time < cutoff }
    }

    private func checkCrossing(_ track: inout Track) {
        guard track.framesTracked >= Config.minTrackFrames else { return }
        guard !track.hasCrossed else { return }

        let prev = track.prevCentX
        let curr = track.centX

        let crossedRight = prev < wireX && curr >= wireX   // left → right → directionA
        let crossedLeft  = prev > wireX && curr <= wireX   // right → left → directionB
        guard crossedRight || crossedLeft else { return }

        // Debounce: skip if another vehicle crossed in the same lane (centY) recently.
        let now = Date()
        if recentCrossings.contains(where: {
            abs($0.centY - track.centY) < 0.15 &&
            now.timeIntervalSince($0.time) < Config.crossingDebounceSec
        }) { return }

        recentCrossings.append((centY: track.centY, time: now))
        track.hasCrossed = true

        let direction = crossedRight ? Config.directionA : Config.directionB
        if crossedRight { countA += 1 } else { countB += 1 }

        onCrossing?(Detection(
            timestamp:     now,
            vehicleClass:  track.className,
            direction:     direction,
            confidence:    track.confidence,
            speedEstimate: nil
        ))
    }

    // Simple centroid-distance match. Returns (index into `pool`, score).
    private func bestMatch(for track: Track, in pool: [BoundingBox]) -> (Int, Double)? {
        var bestIdx: Int?
        var bestDist = Config.trackingMaxDistance

        for (i, det) in pool.enumerated() {
            guard det.className == track.className else { continue }
            let dx = Double(det.rect.midX) - track.centX
            let dy = Double(det.rect.midY) - track.centY
            let d  = (dx*dx + dy*dy).squareRoot()
            if d < bestDist { bestDist = d; bestIdx = i }
        }

        guard let idx = bestIdx else { return nil }
        return (idx, bestDist)
    }
}
