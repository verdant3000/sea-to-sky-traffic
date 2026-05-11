import Foundation

struct Station: Codable, Identifiable {
    let id:       Int
    let name:     String
    let location: String?

    enum CodingKeys: String, CodingKey {
        case id = "station_id"
        case name
        case location
    }
}

struct Detection: Codable {
    let stationID:   Int
    let direction:   String
    let vehicleType: String
    let confidence:  Float
    let timestamp:   Date

    enum CodingKeys: String, CodingKey {
        case stationID   = "station_id"
        case direction
        case vehicleType = "vehicle_type"
        case confidence
        case timestamp
    }
}
