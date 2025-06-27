//
//  AmbianceAudioEngine.swift
//  《静界》iOS 原生音频引擎
//
//  使用 AVAudioEngine 实现高性能多音轨混音
//

import Foundation
import AVFoundation
import React

@objc(AmbianceAudioEngine)
class AmbianceAudioEngine: NSObject {
    
    // MARK: - 核心音频组件
    
    private var audioEngine = AVAudioEngine()
    private var mixerNode = AVAudioMixerNode()
    private var players: [String: AVAudioPlayerNode] = [:]
    private var audioFiles: [String: AVAudioFile] = [:]
    private var trackConfigs: [String: TrackConfig] = [:]
    
    // MARK: - 状态管理
    
    private var isInitialized = false
    private var isPlaying = false
    private var masterVolume: Float = 1.0
    
    // MARK: - 定时器
    
    private var playbackTimer: Timer?
    private var timerConfig: TimerConfig?
    private var timerStartTime: Date?
    
    // MARK: - 数据结构
    
    struct TrackConfig {
        let id: String
        let name: String
        let audioFile: String
        var volume: Float = 0.5
        var pan: Float = 0.0
        var isPlaying: Bool = false
    }
    
    struct TimerConfig {
        let duration: TimeInterval  // 秒
        let fadeOut: Bool
        let fadeOutDuration: TimeInterval
    }
    
    // MARK: - 初始化
    
    override init() {
        super.init()
        setupAudioSession()
    }
    
    // MARK: - React Native 桥接方法
    
    @objc
    func initialize(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            do {
                try self.initializeAudioEngine()
                self.isInitialized = true
                resolve(true)
            } catch {
                reject("INIT_FAILED", "Failed to initialize audio engine: \(error.localizedDescription)", error)
            }
        }
    }
    
    @objc
    func addTrack(_ trackId: String, audioFile: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        guard isInitialized else {
            reject("ENGINE_NOT_INITIALIZED", "Audio engine not initialized", nil)
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                // 加载音频文件
                guard let audioFileURL = Bundle.main.url(forResource: audioFile, withExtension: nil) else {
                    DispatchQueue.main.async {
                        reject("AUDIO_FILE_NOT_FOUND", "Audio file not found: \(audioFile)", nil)
                    }
                    return
                }
                
                let file = try AVAudioFile(forReading: audioFileURL)
                
                // 创建播放器节点
                let player = AVAudioPlayerNode()
                
                DispatchQueue.main.async {
                    // 添加到音频引擎
                    self.audioEngine.attach(player)
                    self.audioEngine.connect(player, to: self.mixerNode, format: file.processingFormat)
                    
                    // 保存引用
                    self.players[trackId] = player
                    self.audioFiles[trackId] = file
                    self.trackConfigs[trackId] = TrackConfig(
                        id: trackId,
                        name: audioFile,
                        audioFile: audioFile
                    )
                    
                    resolve(true)
                }
                
            } catch {
                DispatchQueue.main.async {
                    reject("TRACK_ADD_FAILED", "Failed to add track: \(error.localizedDescription)", error)
                }
            }
        }
    }
    
    @objc
    func setVolume(_ trackId: String, volume: Float, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        guard let player = players[trackId] else {
            reject("TRACK_NOT_FOUND", "Track not found: \(trackId)", nil)
            return
        }
        
        // 验证音量范围
        let clampedVolume = max(0.0, min(1.0, volume))
        
        // 设置音量
        player.volume = clampedVolume
        
        // 更新配置
        trackConfigs[trackId]?.volume = clampedVolume
        
        resolve(true)
    }
    
    @objc
    func setPanning(_ trackId: String, pan: Float, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        guard let player = players[trackId] else {
            reject("TRACK_NOT_FOUND", "Track not found: \(trackId)", nil)
            return
        }
        
        // 验证立体声平衡范围 (-1.0 到 1.0)
        let clampedPan = max(-1.0, min(1.0, pan))
        
        // 设置立体声平衡
        player.pan = clampedPan
        
        // 更新配置
        trackConfigs[trackId]?.pan = clampedPan
        
        resolve(true)
    }
    
    @objc
    func play(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        guard isInitialized else {
            reject("ENGINE_NOT_INITIALIZED", "Audio engine not initialized", nil)
            return
        }
        
        do {
            // 启动音频引擎（如果还没启动）
            if !audioEngine.isRunning {
                try audioEngine.start()
            }
            
            // 播放所有已配置的音轨
            for (trackId, player) in players {
                guard let audioFile = audioFiles[trackId],
                      let config = trackConfigs[trackId],
                      config.volume > 0 else { continue }
                
                // 设置循环播放
                scheduleLoopedPlayback(player: player, audioFile: audioFile)
                
                if !player.isPlaying {
                    player.play()
                    trackConfigs[trackId]?.isPlaying = true
                }
            }
            
            isPlaying = true
            resolve(true)
            
        } catch {
            reject("PLAYBACK_FAILED", "Failed to start playback: \(error.localizedDescription)", error)
        }
    }
    
    @objc
    func pause(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        // 暂停所有播放器
        for (trackId, player) in players {
            player.pause()
            trackConfigs[trackId]?.isPlaying = false
        }
        
        isPlaying = false
        resolve(true)
    }
    
    @objc
    func stop(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        // 停止所有播放器
        for (trackId, player) in players {
            player.stop()
            trackConfigs[trackId]?.isPlaying = false
        }
        
        // 停止音频引擎
        audioEngine.stop()
        
        // 取消定时器
        cancelTimer()
        
        isPlaying = false
        resolve(true)
    }
    
    @objc
    func setTimer(_ duration: Double, fadeOut: Bool, fadeOutDuration: Double, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        // 取消现有定时器
        cancelTimer()
        
        // 创建新的定时器配置
        timerConfig = TimerConfig(
            duration: duration * 60, // 转换为秒
            fadeOut: fadeOut,
            fadeOutDuration: fadeOutDuration * 60
        )
        
        timerStartTime = Date()
        
        // 启动定时器
        playbackTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] timer in
            self?.handleTimerTick()
        }
        
        resolve(true)
    }
    
    @objc
    func saveScene(_ sceneName: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        // 生成场景ID
        let sceneId = "scene_\(Int(Date().timeIntervalSince1970))_\(UUID().uuidString.prefix(8))"
        
        // 构建场景数据
        var sceneData: [String: Any] = [
            "id": sceneId,
            "name": sceneName,
            "createdAt": ISO8601DateFormatter().string(from: Date()),
            "tracks": []
        ]
        
        var tracksData: [[String: Any]] = []
        
        for (trackId, config) in trackConfigs {
            if config.volume > 0 {
                tracksData.append([
                    "id": trackId,
                    "audioFile": config.audioFile,
                    "volume": config.volume,
                    "pan": config.pan
                ])
            }
        }
        
        sceneData["tracks"] = tracksData
        
        // 保存到UserDefaults (简单实现，实际项目中应该使用更完善的存储方案)
        let key = "ambiance_scene_\(sceneId)"
        UserDefaults.standard.set(sceneData, forKey: key)
        
        resolve(sceneId)
    }
    
    // MARK: - 私有方法
    
    private func setupAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try audioSession.setActive(true)
        } catch {
            print("Failed to setup audio session: \(error)")
        }
    }
    
    private func initializeAudioEngine() throws {
        // 配置混音器节点
        audioEngine.attach(mixerNode)
        audioEngine.connect(mixerNode, to: audioEngine.outputNode, format: nil)
        
        // 准备音频引擎
        audioEngine.prepare()
    }
    
    private func scheduleLoopedPlayback(player: AVAudioPlayerNode, audioFile: AVAudioFile) {
        // 创建音频缓冲区
        let buffer = AVAudioPCMBuffer(pcmFormat: audioFile.processingFormat, frameCapacity: AVAudioFrameCount(audioFile.length))!
        
        do {
            try audioFile.read(into: buffer)
            
            // 无限循环播放
            player.scheduleBuffer(buffer, at: nil, options: .loops, completionHandler: nil)
            
        } catch {
            print("Failed to schedule buffer: \(error)")
        }
    }
    
    private func handleTimerTick() {
        guard let config = timerConfig,
              let startTime = timerStartTime else { return }
        
        let elapsedTime = Date().timeIntervalSince(startTime)
        let remainingTime = config.duration - elapsedTime
        
        if remainingTime <= 0 {
            // 定时器结束
            handleTimerExpired()
        } else if config.fadeOut && remainingTime <= config.fadeOutDuration {
            // 开始淡出
            let fadeProgress = 1.0 - (remainingTime / config.fadeOutDuration)
            let targetVolume = Float(1.0 - fadeProgress)
            
            // 应用淡出效果到所有音轨
            for (_, player) in players {
                player.volume = player.volume * targetVolume
            }
        }
    }
    
    private func handleTimerExpired() {
        cancelTimer()
        
        // 停止播放
        stop { _ in } rejecter: { _, _, _ in }
        
        // 发送事件到React Native
        // TODO: 实现事件发送机制
    }
    
    private func cancelTimer() {
        playbackTimer?.invalidate()
        playbackTimer = nil
        timerConfig = nil
        timerStartTime = nil
    }
}

// MARK: - React Native 桥接配置

@objc(AmbianceAudioEngineBridge)
class AmbianceAudioEngineBridge: RCTEventEmitter {
    
    @objc override static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    @objc override func supportedEvents() -> [String]! {
        return [
            "onInitialized",
            "onTrackAdded",
            "onPlaybackStarted",
            "onPlaybackPaused",
            "onPlaybackStopped",
            "onTimerExpired",
            "onError"
        ]
    }
} 