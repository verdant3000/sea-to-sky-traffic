import SwiftUI
import AVFoundation

// trackedClasses, motorVehicleClasses, activeModeClasses defined in TripwireCounter.swift

// MARK: - Root view

struct ContentView: View {
    @StateObject private var cam       = CameraSession()
    @StateObject private var grabber   = FrameGrabber()
    @StateObject private var counter   = TripwireCounter()
    @StateObject private var shipper   = APIShipper()
    @StateObject private var cropSaver = CropSaver()

    @State private var pinchBaseZoom:    CGFloat = 1.0
    @State private var rotationDegrees: Double  = 0
    @State private var showResetConfirm: Bool   = false
    @State private var showControls:     Bool   = true
    @State private var controlsLocked:   Bool   = false
    @State private var lastTouchDate:    Date   = Date()

    private func touch() {
        withAnimation(.easeInOut(duration: 0.25)) { showControls = true }
        lastTouchDate = Date()
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black

                // Camera + overlays — share rotation transform
                ZStack {
                    CameraPreview(session: cam.session)
                    DetectionOverlay(
                        boxes:     grabber.detections.filter { trackedClasses.contains($0.className) },
                        wireX:     counter.wireX,
                        wireAngle: counter.wireAngle
                    )
                    .allowsHitTesting(false)
                }
                .rotationEffect(.degrees(rotationDegrees))
                .scaleEffect(scaleForRotation(rotationDegrees, size: geo.size))
                .gesture(
                    MagnificationGesture()
                        .onChanged { scale in cam.setZoom(pinchBaseZoom * scale); touch() }
                        .onEnded   { _     in pinchBaseZoom = cam.currentZoom }
                )

                // Top — zoom + model status (hideable)
                if showControls {
                    VStack(spacing: 4) {
                        Text(String(format: "%.1f×", cam.currentZoom))
                            .font(.system(size: 13, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white.opacity(0.85))
                            .shadow(color: .black.opacity(0.6), radius: 2)
                        Text(grabber.isDetectorReady ? "Model: ✓ (CPU)" : "Model: loading…")
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundColor(grabber.isDetectorReady ? .green : .yellow)
                            .shadow(color: .black.opacity(0.8), radius: 2)
                        Spacer()
                    }
                    .padding(.top, 12)
                    .transition(.opacity)
                }

                // Bottom panel
                VStack(spacing: 0) {
                    Spacer()

                    // ── Counts — ALWAYS VISIBLE ──────────────────────────────────
                    VStack(spacing: 0) {
                        HStack(spacing: 0) {
                            CountCell(label: "VEH NB", count: counter.vehicleNB, color: .blue)
                            Rectangle().frame(width: 1).foregroundColor(.white.opacity(0.2))
                            CountCell(label: "VEH SB", count: counter.vehicleSB, color: .orange)
                        }
                        Divider().background(Color.white.opacity(0.15))
                        HStack(spacing: 0) {
                            CountCell(label: "ACT NB", count: counter.activeNB, color: .cyan)
                            Rectangle().frame(width: 1).foregroundColor(.white.opacity(0.2))
                            CountCell(label: "ACT SB", count: counter.activeSB, color: .cyan)
                        }
                    }
                    .frame(height: 110)
                    .background(Color.black.opacity(0.45))

                    // ── Sliders + lens/rotate — HIDEABLE ────────────────────────
                    if showControls {
                        VStack(spacing: 0) {
                            // Tripwire X
                            HStack(spacing: 10) {
                                RoundedRectangle(cornerRadius: 1)
                                    .frame(width: 2, height: 16)
                                    .foregroundColor(.yellow.opacity(0.85))
                                Slider(value: $counter.wireX, in: 0...1)
                                    .tint(.yellow)
                                    .onChange(of: counter.wireX) { _ in touch() }
                                Text("\(Int(counter.wireX * 100))%")
                                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                                    .foregroundColor(.yellow.opacity(0.85))
                                    .frame(width: 36, alignment: .trailing)
                            }
                            .padding(.horizontal, 16)
                            .padding(.top, 8).padding(.bottom, 4)
                            .background(Color.black.opacity(0.4))

                            // Tripwire angle
                            HStack(spacing: 10) {
                                Image(systemName: "arrow.up.left.and.arrow.down.right")
                                    .font(.system(size: 12))
                                    .foregroundColor(.yellow.opacity(0.85))
                                Slider(value: $counter.wireAngle, in: -60...60)
                                    .tint(.yellow)
                                    .onChange(of: counter.wireAngle) { _ in touch() }
                                Text("\(Int(counter.wireAngle))°")
                                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                                    .foregroundColor(.yellow.opacity(0.85))
                                    .frame(width: 36, alignment: .trailing)
                            }
                            .padding(.horizontal, 16)
                            .padding(.top, 4).padding(.bottom, 8)
                            .background(Color.black.opacity(0.4))

                            // Lens picker + rotate
                            HStack(spacing: 8) {
                                ForEach(cam.lensOptions) { lens in
                                    let active = cam.activeLensZoom == lens.zoomFactor
                                    Button(lens.label) {
                                        cam.switchLens(to: lens)
                                        pinchBaseZoom = lens.zoomFactor
                                        touch()
                                    }
                                    .font(.system(size: 13, weight: .semibold))
                                    .padding(.horizontal, 10).padding(.vertical, 5)
                                    .background(active ? Color.yellow : Color.black.opacity(0.5))
                                    .foregroundColor(active ? .black : .white)
                                    .clipShape(Capsule())
                                }

                                Spacer()

                                Button { rotationDegrees = (rotationDegrees - 90 + 360).truncatingRemainder(dividingBy: 360); touch() } label: {
                                    Image(systemName: "rotate.left").font(.system(size: 14)).foregroundColor(.white.opacity(0.8))
                                }
                                .buttonStyle(.plain)

                                Button { rotationDegrees = (rotationDegrees + 90).truncatingRemainder(dividingBy: 360); touch() } label: {
                                    Image(systemName: "rotate.right").font(.system(size: 14))
                                        .foregroundColor(rotationDegrees != 0 ? .yellow : .white.opacity(0.8))
                                }
                                .buttonStyle(.plain)

                                // Reset (long press, in controls section)
                                Image(systemName: "arrow.counterclockwise")
                                    .font(.system(size: 14))
                                    .foregroundColor(.white.opacity(0.7))
                                    .onLongPressGesture(minimumDuration: 0.6) { showResetConfirm = true }
                                    .confirmationDialog("Reset Counts?", isPresented: $showResetConfirm) {
                                        Button("Reset", role: .destructive) { counter.reset() }
                                        Button("Cancel", role: .cancel) { }
                                    }
                            }
                            .padding(.horizontal, 16).padding(.vertical, 10)
                            .background(Color.black.opacity(0.4))
                        }
                        .transition(.opacity)
                    }

                    // ── Status bar — ALWAYS VISIBLE ──────────────────────────────
                    HStack(spacing: 12) {
                        // Counting toggle
                        Button { counter.toggleCounting(); touch() } label: {
                            HStack(spacing: 5) {
                                Circle()
                                    .fill(counter.isCounting ? Color.green : Color.red)
                                    .frame(width: 8, height: 8)
                                Text(counter.isCounting ? "Counting" : "Paused")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(.white.opacity(0.85))
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(!grabber.isDetectorReady)

                        Spacer()

                        // Sync status
                        Text(syncStatusText)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.white.opacity(0.5))

                        // Station name — tap to change
                        Button {
                            shipper.showStationPicker = true
                            touch()
                        } label: {
                            Text(shipper.selectedStationName)
                                .font(.system(size: 11, weight: .medium, design: .monospaced))
                                .foregroundColor(.white.opacity(0.5))
                        }
                        .buttonStyle(.plain)

                        // Lock — keeps controls permanently visible
                        Button { controlsLocked.toggle(); touch() } label: {
                            Image(systemName: controlsLocked ? "lock.fill" : "lock.open")
                                .font(.system(size: 13))
                                .foregroundColor(controlsLocked ? .yellow : .white.opacity(0.5))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(Color.black.opacity(0.45))
                }
            }
        }
        .ignoresSafeArea()
        // Auto-hide: reset 30-second countdown on any touch
        .simultaneousGesture(TapGesture().onEnded { touch() })
        // After 30 s of no interaction, hide controls (skipped when locked)
        .task(id: lastTouchDate) {
            guard !controlsLocked else { return }
            try? await Task.sleep(nanoseconds: 30_000_000_000)
            guard !controlsLocked else { return }
            withAnimation(.easeInOut(duration: 0.3)) { showControls = false }
        }
        .onAppear {
            cam.start()
            shipper.start()
            counter.onCrossing = { [weak grabber, weak cropSaver] direction, vehicleType, confidence, box in
                shipper.record(Detection(
                    stationID:   shipper.selectedStationID,
                    direction:   direction,
                    vehicleType: vehicleType,
                    confidence:  confidence,
                    timestamp:   Date()
                ))
                if let frame = grabber?.lastFrame {
                    cropSaver?.save(
                        frame:     frame,
                        rect:      box.rect,
                        stationID: shipper.selectedStationID,
                        className: vehicleType,
                        confidence: confidence
                    )
                }
            }
        }
        .onDisappear {
            cam.stop()
            shipper.stop()
        }
        .onReceive(
            NotificationCenter.default
                .publisher(for: .AVCaptureSessionDidStartRunning)
                .receive(on: DispatchQueue.main)
        ) { _ in
            grabber.attach(to: cam.session)
        }
        .onReceive(grabber.$detections) { boxes in
            counter.update(detections: boxes)
        }
        .sheet(isPresented: $shipper.showStationPicker) {
            StationPickerSheet(shipper: shipper)
        }
    }

    // MARK: - Helpers

    private func scaleForRotation(_ degrees: Double, size: CGSize) -> CGFloat {
        guard Int(degrees) % 180 != 0 else { return 1.0 }
        return max(size.width, size.height) / min(size.width, size.height)
    }

    private var syncStatusText: String {
        if shipper.pendingCount > 0 { return "\(shipper.pendingCount) queued" }
        guard let d = shipper.lastSyncDate else { return "not synced" }
        let fmt = RelativeDateTimeFormatter()
        fmt.unitsStyle = .abbreviated
        return "synced \(fmt.localizedString(for: d, relativeTo: Date()))"
    }
}

// MARK: - Detection + tripwire overlay

struct DetectionOverlay: View {
    let boxes:     [BoundingBox]
    let wireX:     Double
    let wireAngle: Double

    var body: some View {
        Canvas { ctx, size in
            // Angled tripwire
            let θ  = wireAngle * .pi / 180.0
            let cx = size.width  * wireX
            let cy = size.height * 0.5
            let t  = max(size.width, size.height)
            var wire = Path()
            wire.move(to:    CGPoint(x: cx - sin(θ) * t, y: cy + cos(θ) * t))
            wire.addLine(to: CGPoint(x: cx + sin(θ) * t, y: cy - cos(θ) * t))
            ctx.stroke(wire, with: .color(.yellow.opacity(0.85)), lineWidth: 2)

            // Bounding boxes
            for box in boxes {
                let r = CGRect(
                    x:      box.rect.minX * size.width,
                    y:      box.rect.minY * size.height,
                    width:  box.rect.width  * size.width,
                    height: box.rect.height * size.height
                )
                ctx.stroke(Path(r), with: .color(boxColor(box.className)), lineWidth: 2)
                ctx.draw(
                    Text("\(box.className) \(Int(box.confidence * 100))%")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white),
                    at: CGPoint(x: r.minX + 4, y: r.minY + 2),
                    anchor: .topLeading
                )
            }
        }
    }

    private func boxColor(_ name: String) -> Color {
        switch name {
        case "car":        return .green
        case "truck":      return .orange
        case "bus":        return .red
        case "motorcycle": return .purple
        case "bicycle":    return .mint
        case "person":     return .cyan
        default:           return .white
        }
    }
}

// MARK: - Station picker sheet

struct StationPickerSheet: View {
    @ObservedObject var shipper: APIShipper
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            Group {
                if shipper.isLoadingStations {
                    ProgressView("Loading stations…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if shipper.stations.isEmpty {
                    Text("No stations found.\nCheck your network connection.")
                        .multilineTextAlignment(.center)
                        .foregroundColor(.secondary)
                        .padding()
                } else {
                    List(shipper.stations) { station in
                        Button {
                            shipper.selectStation(station)
                            dismiss()
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(station.name).font(.headline).foregroundColor(.primary)
                                    if let loc = station.location {
                                        Text(loc).font(.caption).foregroundColor(.secondary)
                                    }
                                }
                                Spacer()
                                if station.id == shipper.selectedStationID {
                                    Image(systemName: "checkmark").foregroundColor(.blue)
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
        .onAppear { shipper.fetchStations() }
    }
}

// MARK: - Count cell

struct CountCell: View {
    let label: String
    let count: Int
    let color: Color

    var body: some View {
        VStack(spacing: 1) {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(color.opacity(0.8))
            Text("\(count)")
                .font(.system(size: 32, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
    }
}

// MARK: - Camera preview

struct CameraPreview: UIViewControllerRepresentable {
    let session: AVCaptureSession

    func makeUIViewController(context: Context) -> CameraPreviewViewController {
        CameraPreviewViewController(session: session)
    }

    func updateUIViewController(_ vc: CameraPreviewViewController, context: Context) {}
}
