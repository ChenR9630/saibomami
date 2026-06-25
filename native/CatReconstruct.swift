import Foundation
import RealityKit

@main
struct CatReconstruct {
    static func main() async {
        guard CommandLine.arguments.count >= 3 else {
            fputs("Usage: CatReconstruct <images-directory> <output.usdz>\n", stderr)
            exit(2)
        }

        let inputURL = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])

        do {
            let configuration = PhotogrammetrySession.Configuration()
            let session = try PhotogrammetrySession(
                input: inputURL,
                configuration: configuration
            )
            let request = PhotogrammetrySession.Request.modelFile(
                url: outputURL,
                detail: .medium
            )

            try session.process(requests: [request])

            for try await output in session.outputs {
                switch output {
                case .processingComplete:
                    printJSON(["type": "complete", "output": outputURL.path])
                    return
                case .requestProgress(_, let fractionComplete):
                    printJSON([
                        "type": "progress",
                        "progress": fractionComplete
                    ])
                case .requestProgressInfo:
                    break
                case .requestError(_, let error):
                    printJSON([
                        "type": "error",
                        "message": error.localizedDescription
                    ])
                    exit(1)
                case .requestComplete:
                    printJSON(["type": "request-complete"])
                case .inputComplete:
                    printJSON(["type": "input-complete"])
                case .invalidSample(_, let reason):
                    printJSON([
                        "type": "invalid-sample",
                        "message": reason.description
                    ])
                case .skippedSample:
                    break
                case .automaticDownsampling:
                    printJSON(["type": "downsampling"])
                case .processingCancelled:
                    printJSON(["type": "cancelled"])
                    exit(1)
                case .stitchingIncomplete:
                    printJSON(["type": "stitching-incomplete"])
                @unknown default:
                    break
                }
            }
        } catch {
            printJSON([
                "type": "error",
                "message": error.localizedDescription
            ])
            exit(1)
        }
    }

    static func printJSON(_ value: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: value),
              let text = String(data: data, encoding: .utf8) else {
            return
        }
        print(text)
        fflush(stdout)
    }
}
