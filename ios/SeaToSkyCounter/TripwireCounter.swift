import Combine
import CoreGraphics
import Foundation

// Motor vehicles — heavier traffic (v1 custom model classes)
let motorVehicleClasses: Set<String> = [
    "car", "bus", "motorcycle",
    "box_truck", "flatbed_truck", "dumptruck", "tanker_truck",
    "delivery_van", "utility_van",
    "pickup_truck", "suv", "rv",
    "cybertruck", "overland_rig", "emergency_vehicle",
]
// Active modes — cyclists and pedestrians
let activeModeClasses:   Set<String> = ["bicycle", "person"]
// All classes that participate in tracking and counting
let trackedClasses:      Set<String> = motorVehicleClasses.union(activeModeClasses)

class TripwireCounter: ObservableObject {

    @Published var vehicleNB: Int = 0
    @Published var vehicleSB: Int = 0
    @Published var activeNB:  Int = 0
    @Published var activeSB:  Int = 0

    @Published var isCounting: Bool = true

    @Published var wireX: Double =
        UserDefaults.standard.object(forKey: "wireX") as? Double ?? 0.5 {
        didSet { UserDefaults.standard.set(wireX, forKey: "wireX") }
    }

    @Published var wireAngle: Double =
        UserDefaults.standard.object(forKey: "wireAngle") as? Double ?? 0.0 {
        didSet { UserDefaults.standard.set(wireAngle, forKey: "wireAngle") }
    }

    /// Called on main thread whenever a vehicle crosses the wire.
    /// Arguments: direction ("northbound"/"southbound"), vehicleType, confidence, boundingBox.
    var onCrossing: ((String, String, Float, BoundingBox) -> Void)?

    // MARK: - Private tracking state

    private struct Track {
        var center:       CGPoint
        var className:    String
        var confidence:   Float
        var frameSeen:    Int
        var frameCreated: Int
        var frameCrossed: Int
    }

    private var tracks:     [Track] = []
    private var frameIndex: Int     = 0

    private let matchDistance:   CGFloat = 0.12
    private let minTrackAge:     Int     = 3
    private let maxMissedFrames: Int     = 6
    private let debounceFrames:  Int     = 15

    // MARK: - Public API

    func update(detections: [BoundingBox]) {
        frameIndex += 1

        let vehicles = detections.filter { trackedClasses.contains($0.className) }

        tracks = tracks.filter { frameIndex - $0.frameSeen <= maxMissedFrames }

        var matched = Set<Int>()

        for box in vehicles {
            let cx = box.rect.midX
            let cy = box.rect.midY

            var bestIdx:  Int?     = nil
            var bestDist: CGFloat  = matchDistance
            for (i, track) in tracks.enumerated() {
                guard !matched.contains(i) else { continue }
                let dx   = track.center.x - cx
                let dy   = track.center.y - cy
                let dist = (dx*dx + dy*dy).squareRoot()
                if dist < bestDist { bestDist = dist; bestIdx = i }
            }

            if let idx = bestIdx {
                let prevX = tracks[idx].center.x
                let prevY = tracks[idx].center.y
                matched.insert(idx)

                let age          = frameIndex - tracks[idx].frameCreated
                let sinceLastHit = frameIndex - tracks[idx].frameCrossed

                if isCounting && age >= minTrackAge && sinceLastHit > debounceFrames {
                    let prevD = signedDist(x: Double(prevX), y: Double(prevY))
                    let currD = signedDist(x: Double(cx),   y: Double(cy))
                    if (prevD < 0) != (currD < 0) {
                        let isMotor = motorVehicleClasses.contains(tracks[idx].className)
                        let goingNB = prevD < 0
                        let direction = goingNB ? Config.directionA : Config.directionB
                        if isMotor {
                            if goingNB { vehicleNB += 1 } else { vehicleSB += 1 }
                        } else {
                            if goingNB { activeNB  += 1 } else { activeSB  += 1 }
                        }
                        tracks[idx].frameCrossed = frameIndex
                        onCrossing?(direction, tracks[idx].className, tracks[idx].confidence, box)
                    }
                }

                tracks[idx].center     = CGPoint(x: cx, y: cy)
                tracks[idx].className  = box.className
                tracks[idx].confidence = box.confidence
                tracks[idx].frameSeen  = frameIndex
            } else {
                tracks.append(Track(
                    center:       CGPoint(x: cx, y: cy),
                    className:    box.className,
                    confidence:   box.confidence,
                    frameSeen:    frameIndex,
                    frameCreated: frameIndex,
                    frameCrossed: -100
                ))
            }
        }
    }

    func reset() {
        vehicleNB = 0; vehicleSB = 0
        activeNB  = 0; activeSB  = 0
        tracks = []
    }

    func toggleCounting() { isCounting.toggle() }

    // MARK: - Geometry

    // Signed perpendicular distance from (x,y) to the angled wire.
    // Wire passes through (wireX, 0.5) with normal (cos θ, sin θ).
    private func signedDist(x: Double, y: Double) -> Double {
        let θ = wireAngle * .pi / 180.0
        return (x - wireX) * cos(θ) + (y - 0.5) * sin(θ)
    }
}
