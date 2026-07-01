import AppKit
import WebKit

final class PetWebView: WKWebView {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

final class PetPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var panel: PetPanel!
    private var webView: PetWebView!
    private var statusItem: NSStatusItem!
    private var serverProcess: Process?
    private var petMode = "premium"
    private let defaultBaseURL = "https://yutanggo.com"

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        ensureServer()
        createPanel()
        createStatusMenu()
        loadPet()
    }

    private func projectRoot() -> URL {
        let executable = URL(fileURLWithPath: CommandLine.arguments[0]).standardized
        return executable
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func baseURLString() -> String {
        let environmentValue = ProcessInfo.processInfo.environment["NEKO_SYNC_BASE_URL"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let value = environmentValue?.isEmpty == false ? environmentValue! : defaultBaseURL
        return value.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    private func usesLocalServer() -> Bool {
        guard let url = URL(string: baseURLString()) else { return false }
        return ["localhost", "127.0.0.1", "::1"].contains(url.host ?? "")
    }

    private func ensureServer() {
        guard usesLocalServer() else { return }
        let semaphore = DispatchSemaphore(value: 0)
        var isRunning = false
        var request = URLRequest(url: URL(string: "\(baseURLString())/api/info")!)
        request.timeoutInterval = 0.6
        URLSession.shared.dataTask(with: request) { _, response, _ in
            isRunning = (response as? HTTPURLResponse)?.statusCode == 200
            semaphore.signal()
        }.resume()
        _ = semaphore.wait(timeout: .now() + 0.8)

        guard !isRunning else { return }
        let process = Process()
        let localNode = "/usr/local/bin/node"
        if FileManager.default.isExecutableFile(atPath: localNode) {
            process.executableURL = URL(fileURLWithPath: localNode)
            process.arguments = ["server.js"]
        } else {
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = ["node", "server.js"]
        }
        process.currentDirectoryURL = projectRoot()
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try? process.run()
        serverProcess = process
    }

    private func createPanel() {
        panel = PetPanel(
            contentRect: NSRect(x: 120, y: 120, width: 360, height: 270),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = .floating
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [
            .canJoinAllSpaces,
            .fullScreenAuxiliary,
            .stationary
        ]

        let contentView = NSView(frame: panel.contentView!.bounds)
        contentView.wantsLayer = true
        contentView.layer?.backgroundColor = NSColor.clear.cgColor

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        webView = PetWebView(frame: contentView.bounds, configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .clear
        webView.layer?.backgroundColor = NSColor.clear.cgColor
        contentView.addSubview(webView)

        panel.contentView = contentView
        panel.orderFrontRegardless()

        // Mouse: drag from top 28pt, pass clicks on cat through + activate for keyboard
        NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak self] event in
            guard let self, event.window === self.panel else { return event }
            let location = self.panel.mouseLocationOutsideOfEventStream
            if location.y < self.panel.frame.height - 28 {
                self.panel.makeKey()
                self.panel.makeFirstResponder(self.webView)
                return event
            }
            self.panel.performDrag(with: event)
            return nil
        }

        // Forward keyboard events to WebView – necessary because nonactivatingPanel
        // prevents the panel from naturally receiving keyboard events through NSApp.
        NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, self.panel.isVisible else { return event }
            self.webView.keyDown(with: event)
            return nil
        }
    }

    private func createStatusMenu() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "NEKO"
        let menu = NSMenu()
        menu.addItem(withTitle: "显示桌面宠物", action: #selector(showPet), keyEquivalent: "")
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "真实数字分身（调试）", action: #selector(showPremiumPet), keyEquivalent: "")
        menu.addItem(withTitle: "免费赛博猫预览", action: #selector(showFreePet), keyEquivalent: "")
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "小号", action: #selector(sizeSmall), keyEquivalent: "")
        menu.addItem(withTitle: "中号", action: #selector(sizeMedium), keyEquivalent: "")
        menu.addItem(withTitle: "大号", action: #selector(sizeLarge), keyEquivalent: "")
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "放大数字分身", action: #selector(scaleUp), keyEquivalent: "+")
        menu.addItem(withTitle: "缩小数字分身", action: #selector(scaleDown), keyEquivalent: "-")
        menu.addItem(withTitle: "恢复默认缩放", action: #selector(resetScale), keyEquivalent: "0")
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "打开控制台", action: #selector(openConsole), keyEquivalent: "")
        menu.addItem(withTitle: "退出", action: #selector(quit), keyEquivalent: "q")
        statusItem.menu = menu
    }

    private func loadPet() {
        loadPetWhenServerIsReady()
    }

    private func loadPetWhenServerIsReady() {
        var request = URLRequest(url: URL(string: "\(baseURLString())/api/info")!)
        request.timeoutInterval = 0.5
        URLSession.shared.dataTask(with: request) { [weak self] _, response, _ in
            guard let self else { return }
            if (response as? HTTPURLResponse)?.statusCode == 200 {
                DispatchQueue.main.async {
                    self.loadCurrentPetMode()
                }
                return
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self.ensureServer()
                self.loadPetWhenServerIsReady()
            }
        }.resume()
    }

    private func loadCurrentPetMode() {
        let cacheBust = Int(Date().timeIntervalSince1970)
        let petURL = URL(
            string: "\(baseURLString())/desktop-pet.html?mode=\(petMode)&v=\(cacheBust)"
        )!
        let request = URLRequest(
            url: petURL,
            cachePolicy: .reloadIgnoringLocalCacheData,
            timeoutInterval: 15
        )
        webView.load(request)
    }

    private func resize(width: CGFloat, height: CGFloat) {
        var frame = panel.frame
        frame.origin.y += frame.height - height
        frame.size = NSSize(width: width, height: height)
        panel.setFrame(frame, display: true, animate: true)
    }

    @objc private func showPet() { panel.orderFrontRegardless() }
    @objc private func showPremiumPet() {
        petMode = "premium"
        loadCurrentPetMode()
        panel.orderFrontRegardless()
    }
    @objc private func showFreePet() {
        petMode = "free"
        loadCurrentPetMode()
        panel.orderFrontRegardless()
    }
    @objc private func sizeSmall() { resize(width: 288, height: 216) }
    @objc private func sizeMedium() { resize(width: 360, height: 270) }
    @objc private func sizeLarge() { resize(width: 468, height: 351) }
    @objc private func scaleUp() {
        webView.evaluateJavaScript("window.desktopPet?.adjustScale(0.1)")
    }
    @objc private func scaleDown() {
        webView.evaluateJavaScript("window.desktopPet?.adjustScale(-0.1)")
    }
    @objc private func resetScale() {
        webView.evaluateJavaScript("window.desktopPet?.resetScale()")
    }
    @objc private func openConsole() {
        NSWorkspace.shared.open(URL(string: baseURLString())!)
    }
    @objc private func quit() { NSApp.terminate(nil) }

    func applicationWillTerminate(_ notification: Notification) {
        if serverProcess?.isRunning == true {
            serverProcess?.terminate()
        }
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.run()
