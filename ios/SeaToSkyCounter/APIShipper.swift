import Foundation

class APIShipper {
    private let buffer: DetectionBuffer
    private var timer: Timer?

    private(set) var lastSyncDate:  Date?
    private(set) var lastSyncCount: Int = 0
    private(set) var isSyncing:     Bool = false

    var onSync: ((Bool, Int) -> Void)?   // (success, count)

    init(buffer: DetectionBuffer) {
        self.buffer = buffer
    }

    func start() {
        // Fire immediately, then every syncInterval seconds.
        sync()
        timer = Timer.scheduledTimer(withTimeInterval: Config.syncInterval, repeats: true) { [weak self] _ in
            self?.sync()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    func syncNow() { sync() }

    private func sync() {
        let detections = buffer.flush()
        guard !detections.isEmpty else { return }

        isSyncing = true
        let batch = DetectionBatch(stationId: Config.stationID, detections: detections)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        guard let url  = URL(string: "\(Config.apiBaseURL)/api/detections"),
              let body = try? encoder.encode(batch) else {
            buffer.prepend(detections)
            isSyncing = false
            return
        }

        var req = URLRequest(url: url, timeoutInterval: 20)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !Config.apiKey.isEmpty {
            req.setValue(Config.apiKey, forHTTPHeaderField: "x-api-key")
        }
        req.httpBody = body

        URLSession.shared.dataTask(with: req) { [weak self] _, response, error in
            guard let self else { return }
            let success = (response as? HTTPURLResponse)?.statusCode == 200

            if !success {
                self.buffer.prepend(detections)
                print("[API] Sync failed — \(detections.count) detections re-queued. Error: \(error?.localizedDescription ?? "unknown")")
            }

            DispatchQueue.main.async {
                if success {
                    self.lastSyncDate  = Date()
                    self.lastSyncCount = detections.count
                }
                self.isSyncing = false
                self.onSync?(success, detections.count)
            }
        }.resume()
    }
}
