import Foundation

// Edit these before deploying each phone.
enum Config {

    // --- Station identity -------------------------------------------
    static let stationID    = 1
    static let directionA   = "northbound"   // increasing X (left → right in landscape)
    static let directionB   = "southbound"   // decreasing X (right → left in landscape)

    // --- API -----------------------------------------------------------
    static let apiBaseURL   = "https://sea-to-sky-traffic-production.up.railway.app"
    static let apiKey       = "38ea07ed71f949de55bb43b442c088bdf14e23b48ffc7de5cbdb3cc8a3adb95b"

    // --- Tripwire ------------------------------------------------------
    // Normalized X position of the counting line in landscape. 0.0 = left, 1.0 = right.
    // 0.5 = centre of frame. Adjust via Config before deploying each location.
    static let tripwireX: Double = 0.50

    // --- Detection thresholds -----------------------------------------
    static let confidenceThreshold: Float = 0.15   // lowered for debugging; raise to 0.40 in production
    static let iouThreshold:        Float = 0.45

    // Run inference every N camera frames (~30fps ÷ 3 = ~10fps inference).
    // Reduces thermal load without missing vehicles at highway speed.
    static let inferenceFrameSkip = 3

    // --- Sync ----------------------------------------------------------
    static let syncInterval: TimeInterval = 60  // seconds between API POSTs

    // --- COCO vehicle classes (yolov8n standard weights) ---------------
    // class index → API label
    static let vehicleClasses: [Int: String] = [
        1: "bicycle",
        2: "car",
        3: "motorcycle",
        5: "bus",
        7: "truck",
    ]

    // --- Tracker -------------------------------------------------------
    // A detection must be tracked this many frames before it can trigger a count.
    static let minTrackFrames = 3

    // Spatial tolerance for matching a detection to an existing track (normalized).
    static let trackingMaxDistance: Double = 0.12

    // Seconds to suppress re-counting after a crossing (debounce).
    static let crossingDebounceSec: Double = 2.0

    // Drop a track if unseen for this many inference frames.
    static let maxMissingFrames = 6
}
