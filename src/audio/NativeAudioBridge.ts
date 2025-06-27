/**
 * NativeAudioBridge.ts
 * 《静界》原生音频引擎桥接层
 * 
 * 封装对iOS/Android原生音频模块的调用，提供统一的TypeScript接口
 */

import { NativeModules, NativeEventEmitter, DeviceEventEmitter, Platform } from 'react-native';
import { AmbianceAudioEngine, AudioTrack, AudioScene, TimerConfig, AudioEngineEvent, EventListener, AudioEngineError } from './AmbianceAudioEngine';

// 原生模块引用
const NativeAudioEngine = NativeModules.AmbianceAudioEngine;

/**
 * 原生音频引擎桥接实现类
 */
class NativeAudioBridge implements AmbianceAudioEngine {
  
  private eventEmitter: NativeEventEmitter;
  private eventListeners: Map<AudioEngineEvent, Set<EventListener>> = new Map();
  private isInitialized = false;
  
  constructor() {
    // iOS使用NativeEventEmitter，Android使用DeviceEventEmitter
    if (Platform.OS === 'ios') {
      this.eventEmitter = new NativeEventEmitter(NativeAudioEngine);
    }
    
    this.setupEventListeners();
  }
  
  // ==================== 初始化与生命周期 ====================
  
  async initialize(): Promise<boolean> {
    try {
      const result = await NativeAudioEngine.initialize();
      this.isInitialized = result;
      return result;
    } catch (error) {
      console.error('Failed to initialize audio engine:', error);
      this.emitEvent('error', { code: AudioEngineError.ENGINE_NOT_INITIALIZED, message: error.message });
      return false;
    }
  }
  
  async destroy(): Promise<void> {
    try {
      if (NativeAudioEngine.destroy) {
        await NativeAudioEngine.destroy();
      }
      
      // 清理事件监听器
      this.cleanupEventListeners();
      this.isInitialized = false;
      
    } catch (error) {
      console.error('Failed to destroy audio engine:', error);
    }
  }
  
  async getStatus(): Promise<{
    isInitialized: boolean;
    isPlaying: boolean;
    activeTracks: number;
    memoryUsage: number;
  }> {
    try {
      if (NativeAudioEngine.getStatus) {
        return await NativeAudioEngine.getStatus();
      }
      
      // 简化的状态信息
      return {
        isInitialized: this.isInitialized,
        isPlaying: false, // 需要从原生模块获取
        activeTracks: 0,  // 需要从原生模块获取
        memoryUsage: 0    // 需要从原生模块获取
      };
    } catch (error) {
      console.error('Failed to get engine status:', error);
      throw error;
    }
  }
  
  // ==================== 音轨管理 ====================
  
  async addTrack(trackId: string, audioFile: string): Promise<boolean> {
    this.validateInitialized();
    
    try {
      const result = await NativeAudioEngine.addTrack(trackId, audioFile);
      return result;
    } catch (error) {
      console.error(`Failed to add track ${trackId}:`, error);
      this.emitEvent('error', { 
        code: AudioEngineError.TRACK_NOT_FOUND, 
        message: error.message,
        trackId 
      });
      return false;
    }
  }
  
  async removeTrack(trackId: string): Promise<boolean> {
    try {
      if (NativeAudioEngine.removeTrack) {
        return await NativeAudioEngine.removeTrack(trackId);
      }
      
      // 如果原生模块没有提供removeTrack方法，使用setVolume(0)作为替代
      return await this.setVolume(trackId, 0);
    } catch (error) {
      console.error(`Failed to remove track ${trackId}:`, error);
      return false;
    }
  }
  
  async getTracks(): Promise<AudioTrack[]> {
    try {
      if (NativeAudioEngine.getTracks) {
        return await NativeAudioEngine.getTracks();
      }
      
      // 如果原生模块没有提供，返回空数组
      return [];
    } catch (error) {
      console.error('Failed to get tracks:', error);
      return [];
    }
  }
  
  async getTrack(trackId: string): Promise<AudioTrack | null> {
    try {
      if (NativeAudioEngine.getTrack) {
        return await NativeAudioEngine.getTrack(trackId);
      }
      
      return null;
    } catch (error) {
      console.error(`Failed to get track ${trackId}:`, error);
      return null;
    }
  }
  
  // ==================== 音频控制 ====================
  
  async setVolume(trackId: string, volume: number): Promise<boolean> {
    this.validateInitialized();
    this.validateVolume(volume);
    
    try {
      const result = await NativeAudioEngine.setVolume(trackId, volume);
      this.emitEvent('volumeChanged', { trackId, volume });
      return result;
    } catch (error) {
      console.error(`Failed to set volume for track ${trackId}:`, error);
      this.emitEvent('error', { 
        code: AudioEngineError.TRACK_NOT_FOUND, 
        message: error.message,
        trackId 
      });
      return false;
    }
  }
  
  async setPanning(trackId: string, pan: number): Promise<boolean> {
    this.validateInitialized();
    this.validatePan(pan);
    
    try {
      const result = await NativeAudioEngine.setPanning(trackId, pan);
      this.emitEvent('panningChanged', { trackId, pan });
      return result;
    } catch (error) {
      console.error(`Failed to set panning for track ${trackId}:`, error);
      this.emitEvent('error', { 
        code: AudioEngineError.TRACK_NOT_FOUND, 
        message: error.message,
        trackId 
      });
      return false;
    }
  }
  
  async setMasterVolume(volume: number): Promise<boolean> {
    this.validateInitialized();
    this.validateVolume(volume);
    
    try {
      if (NativeAudioEngine.setMasterVolume) {
        return await NativeAudioEngine.setMasterVolume(volume);
      }
      
      // 如果原生模块没有提供主音量控制，直接返回true
      return true;
    } catch (error) {
      console.error('Failed to set master volume:', error);
      return false;
    }
  }
  
  // ==================== 播放控制 ====================
  
  async play(): Promise<boolean> {
    this.validateInitialized();
    
    try {
      const result = await NativeAudioEngine.play();
      if (result) {
        this.emitEvent('playbackStarted', {});
      }
      return result;
    } catch (error) {
      console.error('Failed to start playback:', error);
      this.emitEvent('error', { 
        code: AudioEngineError.PLAYBACK_FAILED, 
        message: error.message 
      });
      return false;
    }
  }
  
  async pause(): Promise<boolean> {
    this.validateInitialized();
    
    try {
      const result = await NativeAudioEngine.pause();
      if (result) {
        this.emitEvent('playbackPaused', {});
      }
      return result;
    } catch (error) {
      console.error('Failed to pause playback:', error);
      return false;
    }
  }
  
  async stop(): Promise<boolean> {
    this.validateInitialized();
    
    try {
      const result = await NativeAudioEngine.stop();
      if (result) {
        this.emitEvent('playbackStopped', {});
      }
      return result;
    } catch (error) {
      console.error('Failed to stop playback:', error);
      return false;
    }
  }
  
  async playTrack(trackId: string): Promise<boolean> {
    try {
      if (NativeAudioEngine.playTrack) {
        return await NativeAudioEngine.playTrack(trackId);
      }
      
      // 如果原生模块没有提供单独播放功能，使用setVolume实现
      return await this.setVolume(trackId, 1.0);
    } catch (error) {
      console.error(`Failed to play track ${trackId}:`, error);
      return false;
    }
  }
  
  async pauseTrack(trackId: string): Promise<boolean> {
    try {
      if (NativeAudioEngine.pauseTrack) {
        return await NativeAudioEngine.pauseTrack(trackId);
      }
      
      // 如果原生模块没有提供单独暂停功能，使用setVolume(0)实现
      return await this.setVolume(trackId, 0);
    } catch (error) {
      console.error(`Failed to pause track ${trackId}:`, error);
      return false;
    }
  }
  
  // ==================== 定时器功能 ====================
  
  async setTimer(config: TimerConfig): Promise<boolean> {
    this.validateInitialized();
    
    try {
      const result = await NativeAudioEngine.setTimer(
        config.duration,
        config.fadeOut,
        config.fadeOutDuration
      );
      return result;
    } catch (error) {
      console.error('Failed to set timer:', error);
      return false;
    }
  }
  
  async cancelTimer(): Promise<boolean> {
    try {
      if (NativeAudioEngine.cancelTimer) {
        return await NativeAudioEngine.cancelTimer();
      }
      
      return true;
    } catch (error) {
      console.error('Failed to cancel timer:', error);
      return false;
    }
  }
  
  async getRemainingTime(): Promise<number> {
    try {
      if (NativeAudioEngine.getRemainingTime) {
        return await NativeAudioEngine.getRemainingTime();
      }
      
      return 0;
    } catch (error) {
      console.error('Failed to get remaining time:', error);
      return 0;
    }
  }
  
  // ==================== 场景管理 ====================
  
  async saveScene(sceneName: string): Promise<string> {
    this.validateInitialized();
    
    try {
      const sceneId = await NativeAudioEngine.saveScene(sceneName);
      return sceneId;
    } catch (error) {
      console.error('Failed to save scene:', error);
      throw error;
    }
  }
  
  async loadScene(sceneId: string | AudioScene): Promise<boolean> {
    this.validateInitialized();
    
    try {
      if (typeof sceneId === 'string') {
        if (NativeAudioEngine.loadScene) {
          const result = await NativeAudioEngine.loadScene(sceneId);
          if (result) {
            this.emitEvent('sceneLoaded', { sceneId });
          }
          return result;
        }
        return false;
      } else {
        // 处理场景对象
        return await this.loadSceneFromObject(sceneId);
      }
    } catch (error) {
      console.error('Failed to load scene:', error);
      return false;
    }
  }
  
  async getCurrentScene(): Promise<AudioScene | null> {
    try {
      if (NativeAudioEngine.getCurrentScene) {
        return await NativeAudioEngine.getCurrentScene();
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get current scene:', error);
      return null;
    }
  }
  
  // ==================== 事件监听 ====================
  
  addEventListener(event: AudioEngineEvent, listener: EventListener): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    
    this.eventListeners.get(event)!.add(listener);
  }
  
  removeEventListener(event: AudioEngineEvent, listener: EventListener): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
      
      if (listeners.size === 0) {
        this.eventListeners.delete(event);
      }
    }
  }
  
  // ==================== 私有方法 ====================
  
  private validateInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(AudioEngineError.ENGINE_NOT_INITIALIZED);
    }
  }
  
  private validateVolume(volume: number): void {
    if (volume < 0 || volume > 1) {
      throw new Error(AudioEngineError.INVALID_PARAMETER + ': Volume must be between 0 and 1');
    }
  }
  
  private validatePan(pan: number): void {
    if (pan < -1 || pan > 1) {
      throw new Error(AudioEngineError.INVALID_PARAMETER + ': Pan must be between -1 and 1');
    }
  }
  
  private setupEventListeners(): void {
    const eventHandler = (eventName: string) => (data: any) => {
      this.emitEvent(eventName as AudioEngineEvent, data);
    };
    
    const events = [
      'onInitialized',
      'onTrackAdded',
      'onPlaybackStarted',
      'onPlaybackPaused',
      'onPlaybackStopped',
      'onTimerExpired',
      'onError'
    ];
    
    events.forEach(eventName => {
      if (Platform.OS === 'ios') {
        this.eventEmitter.addListener(eventName, eventHandler(eventName.substring(2).toLowerCase()));
      } else {
        DeviceEventEmitter.addListener(eventName, eventHandler(eventName.substring(2).toLowerCase()));
      }
    });
  }
  
  private cleanupEventListeners(): void {
    if (Platform.OS === 'ios') {
      this.eventEmitter.removeAllListeners();
    } else {
      DeviceEventEmitter.removeAllListeners();
    }
    
    this.eventListeners.clear();
  }
  
  private emitEvent(event: AudioEngineEvent, data?: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }
  
  private async loadSceneFromObject(scene: AudioScene): Promise<boolean> {
    try {
      // 清除当前所有音轨
      const currentTracks = await this.getTracks();
      for (const track of currentTracks) {
        await this.removeTrack(track.id);
      }
      
      // 加载场景中的音轨
      for (const track of scene.tracks) {
        const success = await this.addTrack(track.id, track.file);
        if (success) {
          await this.setVolume(track.id, track.volume);
          await this.setPanning(track.id, track.pan);
        }
      }
      
      this.emitEvent('sceneLoaded', { scene });
      return true;
      
    } catch (error) {
      console.error('Failed to load scene from object:', error);
      return false;
    }
  }
}

// 导出单例实例
export const audioEngine: AmbianceAudioEngine = new NativeAudioBridge();

// 默认导出类供测试使用
export default NativeAudioBridge; 