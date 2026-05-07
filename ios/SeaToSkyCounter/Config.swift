import Foundation

// Edit these before deploying each phone.
enum Config {

    // --- Station identity -------------------------------------------
    static let stationID    = 36
    static let directionA   = "northbound"   // increasing Y (top → bottom)
    static let directionB   = "southbound"   // decreasing Y (bottom → top)

    // --- API -----------------------------------------------------------
    static let apiBaseURL   = "https://sea-to-sky-traffic-production.up.railway.app"
    static let apiKey       = ""             // set if API requires x-api-key header

    // --- Tripwire ------------------------------------------------------
    // Normalized Y position of the counting line. 0.0 = top, 1.0 = bottom.
    // Station 35 spec (optimal geometry): use ~0.55 for mid-frame placement.
    static let tripwireY: Double = 0.55

    // --- Detection thresholds -----------------------------------------
    static let confidenceThreshold: Float = 0.40
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
