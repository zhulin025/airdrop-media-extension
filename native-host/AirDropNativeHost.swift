import AppKit
import Foundation

private struct NativeRequest: Decodable {
    let path: String
}

private struct NativeResponse: Encodable {
    let ok: Bool
    let error: String?
}

private final class ShareDelegate: NSObject, NSSharingServiceDelegate {
    func sharingService(_ sharingService: NSSharingService, didShareItems items: [Any]) {
        writeNativeResponse(NativeResponse(ok: true, error: nil))
        NSApp.terminate(nil)
    }

    func sharingService(_ sharingService: NSSharingService, didFailToShareItems items: [Any], error: Error) {
        writeNativeResponse(NativeResponse(ok: false, error: error.localizedDescription))
        NSApp.terminate(nil)
    }
}

private var retainedDelegate: ShareDelegate?

private func readNativeMessage() throws -> NativeRequest {
    let input = FileHandle.standardInput
    let lengthData = input.readData(ofLength: 4)
    guard lengthData.count == 4 else {
        throw NSError(domain: "AirDropNativeHost", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "No native messaging payload received."
        ])
    }

    let length = lengthData.enumerated().reduce(UInt32(0)) { result, item in
        result | (UInt32(item.element) << UInt32(item.offset * 8))
    }

    let payload = input.readData(ofLength: Int(length))
    guard payload.count == Int(length) else {
        throw NSError(domain: "AirDropNativeHost", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "Incomplete native messaging payload."
        ])
    }

    return try JSONDecoder().decode(NativeRequest.self, from: payload)
}

private func writeNativeResponse(_ response: NativeResponse) {
    guard let payload = try? JSONEncoder().encode(response) else { return }
    var length = UInt32(payload.count).littleEndian
    let lengthData = Data(bytes: &length, count: 4)
    FileHandle.standardOutput.write(lengthData)
    FileHandle.standardOutput.write(payload)
}

private func openAirDrop(for path: String) throws {
    let url = URL(fileURLWithPath: path)
    guard FileManager.default.fileExists(atPath: url.path) else {
        throw NSError(domain: "AirDropNativeHost", code: 3, userInfo: [
            NSLocalizedDescriptionKey: "File does not exist: \(path)"
        ])
    }

    guard let service = NSSharingService(named: .sendViaAirDrop) else {
        throw NSError(domain: "AirDropNativeHost", code: 4, userInfo: [
            NSLocalizedDescriptionKey: "AirDrop sharing service is unavailable."
        ])
    }

    let delegate = ShareDelegate()
    retainedDelegate = delegate
    service.delegate = delegate
    service.perform(withItems: [url])
}

do {
    let request = try readNativeMessage()
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)

    DispatchQueue.main.async {
        do {
            try openAirDrop(for: request.path)
        } catch {
            writeNativeResponse(NativeResponse(ok: false, error: error.localizedDescription))
            NSApp.terminate(nil)
        }
    }

    Timer.scheduledTimer(withTimeInterval: 180, repeats: false) { _ in
        writeNativeResponse(NativeResponse(ok: false, error: "AirDrop timed out."))
        NSApp.terminate(nil)
    }

    app.run()
} catch {
    writeNativeResponse(NativeResponse(ok: false, error: error.localizedDescription))
}
