import Foundation

struct Detection: Codable {
    let timestamp:     Date
    let vehicleClass:  String
    let direction:     String
    let confidence:    Float
    let speedEstimate: Double?

    enum CodingKeys: String, CodingKey {
        case timestamp
        case vehicleClass  = "vehicle_class"
        case direction
        case confidence
        case speedEstimate = "speed_estimate"
    }
}

struct DetectionBatch: Encodable {
    let stationId:  Int
    let detections: [Detection]

    enum CodingKeys: String, CodingKey {
        case stationId  = "station_id"
        case detections
    }
}
