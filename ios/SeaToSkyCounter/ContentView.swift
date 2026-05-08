import SwiftUI

// MARK: - Root view

struct ContentView: View {
    @StateObject private var vm = StationViewModel()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            CameraPreviewView(vm: vm)
                .ignoresSafeArea()

            // Bounding-box + tripwire overlay
            DetectionOverlay(boxes: vm.visibleBoxes, tripwireX: vm.tripwireX, wireAngle: vm.wireAngle)
                .ignoresSafeArea()
                .allowsHitTesting(false)

            // Stats panel anchored to bottom
            VStack {
                Spacer()
                StatsPanel(vm: vm)
            }
        }
        .onAppear  { vm.start() }
        .onDisappear { vm.stop() }
        .alert("Camera Error", isPresented: .constant(vm.errorMessage != nil)) {
            Button("OK") { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
    }
}

// MARK: - Camera preview (UIViewControllerRepresentable)

struct CameraPreviewView: UIViewControllerRepresentable {
    @ObservedObject var vm: StationViewModel

    func makeUIViewController(context: Context) -> CameraPreviewViewController {
        CameraPreviewViewController(session: vm.captureSession)
    }

    func updateUIViewController(_ vc: CameraPreviewViewController, context: Context) {
        vc.setMirrored(vm.isMirrored)
    }
}

// MARK: - Detection overlay (bounding boxes + tripwire)

struct DetectionOverlay: View {
    let boxes:     [BoundingBox]
    let tripwireX: Double
    let wireAngle: Double   // degrees from vertical

    var body: some View {
        Canvas { ctx, size in
            // Tripwire line — rotated around its center point.
            // Direction vector along the line: (sin θ, -cos θ) in screen coords.
            let θ  = wireAngle * .pi / 180.0
            let cx = size.width  * tripwireX
            let cy = size.height * 0.5
            let t  = max(size.width, size.height)
            let dx = sin(θ) * t
            let dy = cos(θ) * t
            var wirePath = Path()
            wirePath.move(to:    CGPoint(x: cx - dx, y: cy + dy))
            wirePath.addLine(to: CGPoint(x: cx + dx, y: cy - dy))
            ctx.stroke(wirePath, with: .color(.yellow.opacity(0.85)), lineWidth: 2)

            // Bounding boxes
            for box in boxes {
                let r = CGRect(
                    x:      box.rect.minX * size.width,
                    y:      box.rect.minY * size.height,
                    width:  box.rect.width  * size.width,
                    height: box.rect.height * size.height
                )
                ctx.stroke(Path(r), with: .color(boxColor(box.className)), lineWidth: 2)

                // Label
                let pct = Int(box.confidence * 100)
                let label = "\(box.className) \(pct)%"
                ctx.draw(
                    Text(label)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white),
                    at: CGPoint(x: r.minX + 4, y: r.minY + 2),
                    anchor: .topLeading
                )
            }
        }
    }

    private func boxColor(_ className: String) -> Color {
        switch className {
        case "car":        return .green
        case "truck":      return .orange
        case "bus":        return .red
        case "motorcycle": return .cyan
        case "bicycle":    return .mint
        default:           return .white
        }
    }
}

// MARK: - Stats panel

struct StatsPanel: View {
    @ObservedObject var vm: StationViewModel

    var body: some View {
        VStack(spacing: 0) {
            // Main counts
            HStack(spacing: 0) {
                CountCell(label: Config.directionA, count: vm.countA, color: .blue)
                Divider().frame(width: 1).background(Color.white.opacity(0.2))
                CountCell(label: Config.directionB, count: vm.countB, color: .orange)
            }
            .frame(height: 80)

            // Tripwire position slider
            HStack(spacing: 10) {
                Image(systemName: "line.vertical")
                    .font(.system(size: 12))
                    .foregroundColor(.yellow.opacity(0.85))
                Slider(value: $vm.tripwireX, in: 0...1)
                    .tint(.yellow)
                Text("\(Int(vm.tripwireX * 100))%")
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(.yellow.opacity(0.85))
                    .frame(width: 36, alignment: .trailing)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 4)
            .background(Color.black.opacity(0.72))

            // Tripwire angle slider
            HStack(spacing: 10) {
                Image(systemName: "arrow.up.left.and.arrow.down.right")
                    .font(.system(size: 12))
                    .foregroundColor(.yellow.opacity(0.85))
                Slider(value: $vm.wireAngle, in: -45...45)
                    .tint(.yellow)
                Text("\(Int(vm.wireAngle))°")
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(.yellow.opacity(0.85))
                    .frame(width: 36, alignment: .trailing)
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 8)
            .background(Color.black.opacity(0.72))

            // Status bar
            HStack(spacing: 12) {
                statusDot
                Text(statusText)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.8))
                Spacer()
                Text("Station \(Config.stationID)")
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(.white.opacity(0.5))

                Button {
                    vm.flipCamera()
                } label: {
                    Image(systemName: vm.isFrontCamera ? "camera.rotate.fill" : "camera.rotate")
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.7))
                }
                .buttonStyle(.plain)

                Button {
                    vm.toggleMirror()
                } label: {
                    Image(systemName: "arrow.left.and.right.righttriangle.left.righttriangle.right")
                        .font(.system(size: 14))
                        .foregroundColor(vm.isMirrored ? .yellow : .white.opacity(0.7))
                }
                .buttonStyle(.plain)

                Button {
                    vm.syncNow()
                } label: {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.7))
                }
                .buttonStyle(.plain)

                Button {
                    vm.resetCounts()
                } label: {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.7))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.black.opacity(0.7))
        }
        .background(Color.black.opacity(0.75))
    }

    private var statusDot: some View {
        Circle()
            .fill(vm.isDetectorReady ? Color.green : Color.orange)
            .frame(width: 8, height: 8)
    }

    private var statusText: String {
        if !vm.isDetectorReady { return "Loading model…" }
        if vm.pending > 0      { return "\(vm.pending) queued" }
        if let d = vm.lastSyncDate {
            let fmt = RelativeDateTimeFormatter()
            fmt.unitsStyle = .abbreviated
            return "Synced \(fmt.localizedString(for: d, relativeTo: Date())) · \(vm.lastSyncCount) sent"
        }
        return "Ready"
    }
}

struct CountCell: View {
    let label: String
    let count: Int
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text(label.prefix(2).uppercased())
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(color.opacity(0.8))
            Text("\(count)")
                .font(.system(size: 38, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Color.black.opacity(0.75))
    }
}
