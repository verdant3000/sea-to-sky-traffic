import SwiftUI

// MARK: - Root view

struct ContentView: View {
    @StateObject private var vm = StationViewModel()
    @State private var pinchBaseZoom: CGFloat = 1.0

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black

                ZStack {
                    CameraPreviewView(vm: vm)
                    DetectionOverlay(boxes: vm.visibleBoxes,
                                     tripwireX: vm.tripwireX,
                                     wireAngle: vm.wireAngle)
                        .allowsHitTesting(false)
                }
                .rotationEffect(.degrees(vm.previewRotation))
                .scaleEffect(Int(vm.previewRotation) % 180 != 0
                    ? max(geo.size.width, geo.size.height) / min(geo.size.width, geo.size.height)
                    : 1.0)
                .gesture(
                    MagnificationGesture()
                        .onChanged { scale in vm.setZoom(pinchBaseZoom * scale) }
                        .onEnded   { scale in
                            pinchBaseZoom = min(max(pinchBaseZoom * scale, 1.0), 10.0)
                        }
                )

                // Zoom level indicator — top centre
                VStack {
                    Text(String(format: "%.1f×", vm.currentZoom))
                        .font(.system(size: 13, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.85))
                        .shadow(color: .black.opacity(0.6), radius: 2)
                        .padding(.top, 12)
                    Spacer()
                }

                // Lens selector + stats panel anchored to bottom
                VStack(spacing: 0) {
                    Spacer()
                    if vm.availableLenses.count > 1 {
                        LensSelector(vm: vm)
                    }
                    StatsPanel(vm: vm)
                }
            }
            .ignoresSafeArea()
        }
        .ignoresSafeArea()
        .onChange(of: vm.currentZoom) { newZoom in
            if newZoom == 1.0 { pinchBaseZoom = 1.0 }
        }
        .onAppear  { vm.start() }
        .onDisappear { vm.stop() }
        .sheet(isPresented: $vm.showStationPicker) {
            StationPickerSheet(vm: vm)
        }
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
    let wireAngle: Double

    var body: some View {
        Canvas { ctx, size in
            let θ  = wireAngle * .pi / 180.0
            let cx = size.width  * tripwireX
            let cy = size.height * 0.5
            let t  = max(size.width, size.height)
            var wirePath = Path()
            wirePath.move(to:    CGPoint(x: cx - sin(θ)*t, y: cy + cos(θ)*t))
            wirePath.addLine(to: CGPoint(x: cx + sin(θ)*t, y: cy - cos(θ)*t))
            ctx.stroke(wirePath, with: .color(.yellow.opacity(0.85)), lineWidth: 2)

            for box in boxes {
                let r = CGRect(x:      box.rect.minX * size.width,
                               y:      box.rect.minY * size.height,
                               width:  box.rect.width  * size.width,
                               height: box.rect.height * size.height)
                ctx.stroke(Path(r), with: .color(boxColor(box.className)), lineWidth: 2)
                let label = "\(box.className) \(Int(box.confidence * 100))%"
                ctx.draw(Text(label).font(.system(size: 11, weight: .semibold)).foregroundColor(.white),
                         at: CGPoint(x: r.minX + 4, y: r.minY + 2), anchor: .topLeading)
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

// MARK: - Lens selector

struct LensSelector: View {
    @ObservedObject var vm: StationViewModel

    var body: some View {
        HStack(spacing: 6) {
            ForEach(vm.availableLenses) { lens in
                let active = vm.currentLens?.deviceType == lens.deviceType
                Button(lens.label) { vm.switchToLens(lens) }
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(active ? Color.yellow : Color.black.opacity(0.5))
                    .foregroundColor(active ? .black : .white)
                    .clipShape(Capsule())
            }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
    }
}

// MARK: - Stats panel

struct StatsPanel: View {
    @ObservedObject var vm: StationViewModel
    @State private var showResetConfirm = false

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
            .background(Color.black.opacity(0.4))

            // Tripwire angle slider (-60…+60°)
            HStack(spacing: 10) {
                Image(systemName: "arrow.up.left.and.arrow.down.right")
                    .font(.system(size: 12))
                    .foregroundColor(.yellow.opacity(0.85))
                Slider(value: $vm.wireAngle, in: -60...60)
                    .tint(.yellow)
                Text("\(Int(vm.wireAngle))°")
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(.yellow.opacity(0.85))
                    .frame(width: 36, alignment: .trailing)
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 8)
            .background(Color.black.opacity(0.4))

            // Status bar
            HStack(spacing: 12) {

                // Counting toggle — tap to pause/resume
                Button { vm.toggleCounting() } label: {
                    HStack(spacing: 6) {
                        statusDot
                        Text(statusText)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.white.opacity(0.8))
                    }
                }
                .buttonStyle(.plain)
                .disabled(!vm.isDetectorReady)

                Spacer()

                // Station selector
                Button { vm.showStationPicker = true } label: {
                    Text("Station \(vm.selectedStationID)")
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundColor(.white.opacity(0.5))
                }
                .buttonStyle(.plain)

                // Preview rotate CCW
                Button { vm.rotatePreviewCCW() } label: {
                    Image(systemName: "rotate.left")
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.7))
                }
                .buttonStyle(.plain)

                // Preview rotate CW
                Button { vm.rotatePreviewCW() } label: {
                    Image(systemName: "rotate.right")
                        .font(.system(size: 14))
                        .foregroundColor(vm.previewRotation != 0 ? .yellow : .white.opacity(0.7))
                }
                .buttonStyle(.plain)

                // Mirror toggle
                Button { vm.toggleMirror() } label: {
                    Image(systemName: "arrow.left.and.right.righttriangle.left.righttriangle.right")
                        .font(.system(size: 14))
                        .foregroundColor(vm.isMirrored ? .yellow : .white.opacity(0.7))
                }
                .buttonStyle(.plain)

                // Zoom reset — "1×" text
                Button { vm.resetZoom() } label: {
                    Text("1×")
                        .font(.system(size: 13, weight: .semibold, design: .monospaced))
                        .foregroundColor(vm.currentZoom != 1.0 ? .yellow : .white.opacity(0.7))
                }
                .buttonStyle(.plain)

                // Manual sync
                Button { vm.syncNow() } label: {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.7))
                }
                .buttonStyle(.plain)

                // Reset counts — long-press only to avoid accidents
                Image(systemName: "arrow.counterclockwise")
                    .font(.system(size: 14))
                    .foregroundColor(.white.opacity(0.7))
                    .onLongPressGesture(minimumDuration: 0.6) {
                        showResetConfirm = true
                    }
                    .confirmationDialog("Reset Counts?", isPresented: $showResetConfirm) {
                        Button("Reset", role: .destructive) { vm.resetCounts() }
                        Button("Cancel", role: .cancel) { }
                    } message: {
                        Text("Clears northbound and southbound counts. Cannot be undone.")
                    }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.black.opacity(0.4))
        }
        .background(Color.black.opacity(0.4))
    }

    private var statusDot: some View {
        let color: Color = {
            if !vm.isDetectorReady { return .orange }
            if !vm.isCounting      { return .red }
            return .green
        }()
        return Circle().fill(color).frame(width: 8, height: 8)
    }

    private var statusText: String {
        if !vm.isDetectorReady { return "Loading model…" }
        if !vm.isCounting      { return "Paused" }
        if vm.pending > 0      { return "\(vm.pending) queued" }
        if let d = vm.lastSyncDate {
            let fmt = RelativeDateTimeFormatter()
            fmt.unitsStyle = .abbreviated
            return "Synced \(fmt.localizedString(for: d, relativeTo: Date())) · \(vm.lastSyncCount) sent"
        }
        return "Counting"
    }
}

// MARK: - Station picker sheet

struct StationPickerSheet: View {
    @ObservedObject var vm: StationViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            Group {
                if vm.isLoadingStations {
                    ProgressView("Loading stations…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.stations.isEmpty {
                    Text("No stations found.\nCheck your network connection.")
                        .multilineTextAlignment(.center)
                        .foregroundColor(.secondary)
                        .padding()
                } else {
                    List(vm.stations) { station in
                        Button {
                            vm.selectStation(station)
                            dismiss()
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(station.name)
                                        .font(.headline)
                                        .foregroundColor(.primary)
                                    if let loc = station.location {
                                        Text(loc)
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                }
                                Spacer()
                                if station.id == vm.selectedStationID {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.blue)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Select Station")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .onAppear { vm.fetchStations() }
    }
}

// MARK: - Count cell

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
        .background(Color.black.opacity(0.4))
    }
}
