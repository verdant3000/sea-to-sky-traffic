import Foundation
import Combine

class APIShipper: ObservableObject {

    // MARK: - Published state

    @Published var stations:          [Station] = []
    @Published var isLoadingStations: Bool      = false
    @Published var showStationPicker: Bool      = false
    @Published var lastSyncDate:      Date?     = nil
    @Published var lastSyncCount:     Int       = 0
    @Published var pendingCount:      Int       = 0

    @Published var selectedStationID: Int =
        UserDefaults.standard.object(forKey: "selectedStationID") as? Int ?? Config.stationID {
        didSet { UserDefaults.standard.set(selectedStationID, forKey: "selectedStationID") }
    }

    var selectedStationName: String {
        stations.first(where: { $0.id == selectedStationID })?.name
            ?? "Station \(selectedStationID)"
    }

    // MARK: - Private

    private var buffer:   [Detection] = []
    private let bufferKey = "detectionBuffer"
    private var syncTask: Task<Void, Never>?

    init() {
        // Restore any buffered detections that didn't post before last launch
        if let data    = UserDefaults.standard.data(forKey: bufferKey),
           let saved   = try? JSONDecoder().decode([Detection].self, from: data) {
            buffer       = saved
            pendingCount = saved.count
            print("[Sync] Restored \(saved.count) buffered detection(s)")
        }
    }

    // MARK: - Lifecycle

    func start() {
        print("[Sync] start() called")
        fetchStations()
        startSyncLoop()
    }

    func stop() { syncTask?.cancel() }

    // MARK: - Detection recording

    func record(_ detection: Detection) {
        buffer.append(detection)
        pendingCount = buffer.count
        persistBuffer()
    }

    // MARK: - Sync

    func syncNow() { Task { await sync() } }

    // MARK: - Stations

    func fetchStations() {
        guard let url = URL(string: "\(Config.apiBaseURL)/api/stations") else { return }
        isLoadingStations = true

        var req = URLRequest(url: url, timeoutInterval: 15)
        if !Config.apiKey.isEmpty { req.setValue(Config.apiKey, forHTTPHeaderField: "X-Api-Key") }
        print("[Stations] GET \(url.absoluteString)")

        URLSession.shared.dataTask(with: req) { [weak self] data, response, error in
            if let error { print("[Stations] Error: \(error.localizedDescription)  code=\((error as NSError).code)") }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            print("[Stations] HTTP \(status)")

            var decoded: [Station] = []
            if let data, status == 200 {
                decoded = (try? JSONDecoder().decode([Station].self, from: data)) ?? []
                print("[Stations] Loaded \(decoded.count) station(s)")
                if decoded.isEmpty {
                    print("[Stations] Raw response: \(String(data: data, encoding: .utf8) ?? "nil")")
                }
            }
            DispatchQueue.main.async {
                self?.stations          = decoded
                self?.isLoadingStations = false
            }
        }.resume()
    }

    func selectStation(_ station: Station) {
        selectedStationID = station.id
    }

    // MARK: - Private helpers

    private func startSyncLoop() {
        syncTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(Config.syncInterval * 1_000_000_000))
                print("[Sync] Loop tick  buffer=\(buffer.count)")
                await sync()
            }
        }
    }

    // Matches exactly what POST /api/detections expects
    private struct DetectionBatch: Encodable {
        let station_id: Int
        let detections: [Item]
        struct Item: Encodable {
            let timestamp:     Date
            let vehicle_class: String
            let direction:     String
            let confidence:    Float
        }
    }

    @MainActor
    private func sync() async {
        guard !buffer.isEmpty else { return }

        let batch = buffer
        print("[Sync] Attempting to post \(batch.count) detection(s)  key=\(String(Config.apiKey.prefix(8)))...")
        guard let url = URL(string: "\(Config.apiBaseURL)/api/detections") else { return }

        let payload = DetectionBatch(
            station_id: batch.first?.stationID ?? selectedStationID,
            detections: batch.map { d in
                DetectionBatch.Item(
                    timestamp:     d.timestamp,
                    vehicle_class: d.vehicleType,
                    direction:     d.direction,
                    confidence:    d.confidence
                )
            }
        )

        var req = URLRequest(url: url, timeoutInterval: 30)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !Config.apiKey.isEmpty { req.setValue(Config.apiKey, forHTTPHeaderField: "X-Api-Key") }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let body = try? encoder.encode(payload) else { return }
        print("[Sync] Payload: \(String(data: body, encoding: .utf8) ?? "nil")")
        req.httpBody = body

        do {
            let (_, response) = try await URLSession.shared.data(for: req)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status < 300 {
                buffer.removeFirst(batch.count)
                pendingCount  = buffer.count
                lastSyncDate  = Date()
                lastSyncCount = batch.count
                persistBuffer()
                print("[Sync] ✓ Posted \(batch.count)  pending=\(buffer.count)")
            } else {
                print("[Sync] ✗ HTTP \(status)")
            }
        } catch {
            print("[Sync] ✗ \(error.localizedDescription)")
        }
    }

    private func persistBuffer() {
        guard let data = try? JSONEncoder().encode(buffer) else { return }
        UserDefaults.standard.set(data, forKey: bufferKey)
    }
}
