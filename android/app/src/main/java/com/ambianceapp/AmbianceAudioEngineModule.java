/**
 * AmbianceAudioEngineModule.java
 * 《静界》Android 原生音频引擎
 * 
 * 使用 AAudio + Oboe 实现高性能多音轨混音
 */

package com.ambianceapp;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AmbianceAudioEngineModule extends ReactContextBaseJavaModule {
    
    private static final String TAG = "AmbianceAudioEngine";
    private static final String MODULE_NAME = "AmbianceAudioEngine";
    
    // 音频管理
    private AudioManager audioManager;
    private Map<String, MediaPlayer> players = new HashMap<>();
    private Map<String, TrackConfig> trackConfigs = new HashMap<>();
    
    // 状态管理
    private boolean isInitialized = false;
    private boolean isPlaying = false;
    private float masterVolume = 1.0f;
    
    // 定时器
    private Handler timerHandler;
    private Runnable timerRunnable;
    private TimerConfig timerConfig;
    private long timerStartTime;
    
    // 线程池
    private ExecutorService executorService;
    
    /**
     * 音轨配置数据结构
     */
    private static class TrackConfig {
        String id;
        String name;
        String audioFile;
        float volume = 0.5f;
        float pan = 0.0f;
        boolean isPlaying = false;
        
        TrackConfig(String id, String name, String audioFile) {
            this.id = id;
            this.name = name;
            this.audioFile = audioFile;
        }
    }
    
    /**
     * 定时器配置
     */
    private static class TimerConfig {
        long duration;          // 毫秒
        boolean fadeOut;
        long fadeOutDuration;   // 毫秒
        
        TimerConfig(long duration, boolean fadeOut, long fadeOutDuration) {
            this.duration = duration;
            this.fadeOut = fadeOut;
            this.fadeOutDuration = fadeOutDuration;
        }
    }
    
    public AmbianceAudioEngineModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.audioManager = (AudioManager) reactContext.getSystemService(Context.AUDIO_SERVICE);
        this.timerHandler = new Handler(Looper.getMainLooper());
        this.executorService = Executors.newCachedThreadPool();
    }
    
    @Override
    public String getName() {
        return MODULE_NAME;
    }
    
    /**
     * 初始化音频引擎
     */
    @ReactMethod
    public void initialize(Promise promise) {
        try {
            setupAudioSession();
            isInitialized = true;
            
            Log.d(TAG, "Audio engine initialized successfully");
            promise.resolve(true);
            
            // 发送初始化完成事件
            sendEvent("onInitialized", null);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize audio engine", e);
            promise.reject("INIT_FAILED", "Failed to initialize audio engine: " + e.getMessage(), e);
        }
    }
    
    /**
     * 添加音轨
     */
    @ReactMethod
    public void addTrack(String trackId, String audioFile, Promise promise) {
        if (!isInitialized) {
            promise.reject("ENGINE_NOT_INITIALIZED", "Audio engine not initialized", null);
            return;
        }
        
        executorService.execute(() -> {
            try {
                // 创建MediaPlayer
                MediaPlayer player = new MediaPlayer();
                
                // 从assets加载音频文件
                AssetFileDescriptor afd = getReactApplicationContext().getAssets().openFd(audioFile);
                player.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                afd.close();
                
                // 配置播放器
                player.setAudioStreamType(AudioManager.STREAM_MUSIC);
                player.setLooping(true);  // 循环播放
                player.prepare();
                
                // 设置事件监听
                setupPlayerListeners(player, trackId);
                
                // 保存引用
                players.put(trackId, player);
                trackConfigs.put(trackId, new TrackConfig(trackId, audioFile, audioFile));
                
                Log.d(TAG, "Track added successfully: " + trackId);
                
                // 在主线程返回结果
                new Handler(Looper.getMainLooper()).post(() -> {
                    promise.resolve(true);
                    
                    // 发送音轨添加事件
                    WritableMap eventData = Arguments.createMap();
                    eventData.putString("trackId", trackId);
                    eventData.putString("audioFile", audioFile);
                    sendEvent("onTrackAdded", eventData);
                });
                
            } catch (IOException e) {
                Log.e(TAG, "Failed to add track: " + trackId, e);
                new Handler(Looper.getMainLooper()).post(() -> {
                    promise.reject("TRACK_ADD_FAILED", "Failed to add track: " + e.getMessage(), e);
                });
            }
        });
    }
    
    /**
     * 设置音轨音量
     */
    @ReactMethod
    public void setVolume(String trackId, float volume, Promise promise) {
        MediaPlayer player = players.get(trackId);
        if (player == null) {
            promise.reject("TRACK_NOT_FOUND", "Track not found: " + trackId, null);
            return;
        }
        
        try {
            // 验证音量范围 (0.0 - 1.0)
            float clampedVolume = Math.max(0.0f, Math.min(1.0f, volume));
            
            // MediaPlayer使用左右声道分别设置音量
            player.setVolume(clampedVolume * masterVolume, clampedVolume * masterVolume);
            
            // 更新配置
            TrackConfig config = trackConfigs.get(trackId);
            if (config != null) {
                config.volume = clampedVolume;
            }
            
            Log.d(TAG, "Volume set for track " + trackId + ": " + clampedVolume);
            promise.resolve(true);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to set volume for track: " + trackId, e);
            promise.reject("VOLUME_SET_FAILED", "Failed to set volume: " + e.getMessage(), e);
        }
    }
    
    /**
     * 设置立体声平衡 (Android MediaPlayer限制，简化实现)
     */
    @ReactMethod
    public void setPanning(String trackId, float pan, Promise promise) {
        MediaPlayer player = players.get(trackId);
        if (player == null) {
            promise.reject("TRACK_NOT_FOUND", "Track not found: " + trackId, null);
            return;
        }
        
        try {
            // 验证立体声平衡范围 (-1.0 到 1.0)
            float clampedPan = Math.max(-1.0f, Math.min(1.0f, pan));
            
            // 计算左右声道音量
            TrackConfig config = trackConfigs.get(trackId);
            if (config != null) {
                float baseVolume = config.volume * masterVolume;
                
                float leftVolume, rightVolume;
                if (clampedPan < 0) {
                    // 偏左
                    leftVolume = baseVolume;
                    rightVolume = baseVolume * (1.0f + clampedPan);
                } else {
                    // 偏右
                    leftVolume = baseVolume * (1.0f - clampedPan);
                    rightVolume = baseVolume;
                }
                
                player.setVolume(leftVolume, rightVolume);
                config.pan = clampedPan;
            }
            
            Log.d(TAG, "Panning set for track " + trackId + ": " + clampedPan);
            promise.resolve(true);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to set panning for track: " + trackId, e);
            promise.reject("PANNING_SET_FAILED", "Failed to set panning: " + e.getMessage(), e);
        }
    }
    
    /**
     * 开始播放所有音轨
     */
    @ReactMethod
    public void play(Promise promise) {
        if (!isInitialized) {
            promise.reject("ENGINE_NOT_INITIALIZED", "Audio engine not initialized", null);
            return;
        }
        
        try {
            for (Map.Entry<String, MediaPlayer> entry : players.entrySet()) {
                String trackId = entry.getKey();
                MediaPlayer player = entry.getValue();
                TrackConfig config = trackConfigs.get(trackId);
                
                if (config != null && config.volume > 0 && !player.isPlaying()) {
                    player.start();
                    config.isPlaying = true;
                    Log.d(TAG, "Started playing track: " + trackId);
                }
            }
            
            isPlaying = true;
            promise.resolve(true);
            
            // 发送播放开始事件
            sendEvent("onPlaybackStarted", null);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to start playback", e);
            promise.reject("PLAYBACK_FAILED", "Failed to start playback: " + e.getMessage(), e);
        }
    }
    
    /**
     * 暂停播放
     */
    @ReactMethod
    public void pause(Promise promise) {
        try {
            for (Map.Entry<String, MediaPlayer> entry : players.entrySet()) {
                String trackId = entry.getKey();
                MediaPlayer player = entry.getValue();
                TrackConfig config = trackConfigs.get(trackId);
                
                if (player.isPlaying()) {
                    player.pause();
                    if (config != null) {
                        config.isPlaying = false;
                    }
                }
            }
            
            isPlaying = false;
            promise.resolve(true);
            
            // 发送暂停事件
            sendEvent("onPlaybackPaused", null);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to pause playback", e);
            promise.reject("PAUSE_FAILED", "Failed to pause playback: " + e.getMessage(), e);
        }
    }
    
    /**
     * 停止播放
     */
    @ReactMethod
    public void stop(Promise promise) {
        try {
            for (Map.Entry<String, MediaPlayer> entry : players.entrySet()) {
                String trackId = entry.getKey();
                MediaPlayer player = entry.getValue();
                TrackConfig config = trackConfigs.get(trackId);
                
                if (player.isPlaying()) {
                    player.stop();
                    player.prepare(); // 重新准备以便下次播放
                }
                
                if (config != null) {
                    config.isPlaying = false;
                }
            }
            
            // 取消定时器
            cancelTimer();
            
            isPlaying = false;
            promise.resolve(true);
            
            // 发送停止事件
            sendEvent("onPlaybackStopped", null);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop playback", e);
            promise.reject("STOP_FAILED", "Failed to stop playback: " + e.getMessage(), e);
        }
    }
    
    /**
     * 设置定时器
     */
    @ReactMethod
    public void setTimer(double duration, boolean fadeOut, double fadeOutDuration, Promise promise) {
        try {
            // 取消现有定时器
            cancelTimer();
            
            // 创建新的定时器配置
            timerConfig = new TimerConfig(
                (long)(duration * 60 * 1000),           // 转换为毫秒
                fadeOut,
                (long)(fadeOutDuration * 60 * 1000)     // 转换为毫秒
            );
            
            timerStartTime = System.currentTimeMillis();
            
            // 启动定时器 (每秒检查一次)
            timerRunnable = new Runnable() {
                @Override
                public void run() {
                    handleTimerTick();
                    timerHandler.postDelayed(this, 1000);
                }
            };
            timerHandler.post(timerRunnable);
            
            Log.d(TAG, "Timer set for " + duration + " minutes");
            promise.resolve(true);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to set timer", e);
            promise.reject("TIMER_SET_FAILED", "Failed to set timer: " + e.getMessage(), e);
        }
    }
    
    /**
     * 保存当前场景
     */
    @ReactMethod
    public void saveScene(String sceneName, Promise promise) {
        try {
            // 生成场景ID
            String sceneId = "scene_" + System.currentTimeMillis() + "_" + 
                           Integer.toHexString((int)(Math.random() * 0x10000));
            
            // 构建场景数据
            WritableMap sceneData = Arguments.createMap();
            sceneData.putString("id", sceneId);
            sceneData.putString("sceneName", sceneName);
            sceneData.putDouble("createdAt", System.currentTimeMillis());
            
            WritableMap tracksData = Arguments.createMap();
            for (Map.Entry<String, TrackConfig> entry : trackConfigs.entrySet()) {
                TrackConfig config = entry.getValue();
                if (config.volume > 0) {
                    WritableMap trackData = Arguments.createMap();
                    trackData.putString("audioFile", config.audioFile);
                    trackData.putDouble("volume", config.volume);
                    trackData.putDouble("pan", config.pan);
                    tracksData.putMap(config.id, trackData);
                }
            }
            sceneData.putMap("tracks", tracksData);
            
            // 简单存储到SharedPreferences
            // 实际项目中应该使用更完善的存储方案
            getReactApplicationContext()
                .getSharedPreferences("ambiance_scenes", Context.MODE_PRIVATE)
                .edit()
                .putString(sceneId, sceneData.toString())
                .apply();
            
            Log.d(TAG, "Scene saved: " + sceneId);
            promise.resolve(sceneId);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to save scene", e);
            promise.reject("SCENE_SAVE_FAILED", "Failed to save scene: " + e.getMessage(), e);
        }
    }
    
    // ==================== 私有方法 ====================
    
    private void setupAudioSession() {
        // 请求音频焦点
        audioManager.requestAudioFocus(
            null,
            AudioManager.STREAM_MUSIC,
            AudioManager.AUDIOFOCUS_GAIN
        );
    }
    
    private void setupPlayerListeners(MediaPlayer player, String trackId) {
        player.setOnErrorListener((mp, what, extra) -> {
            Log.e(TAG, "MediaPlayer error for track " + trackId + ": what=" + what + ", extra=" + extra);
            
            WritableMap errorData = Arguments.createMap();
            errorData.putString("trackId", trackId);
            errorData.putString("error", "MediaPlayer error: " + what);
            sendEvent("onError", errorData);
            
            return true;
        });
        
        player.setOnCompletionListener(mp -> {
            Log.d(TAG, "Track completed: " + trackId);
            TrackConfig config = trackConfigs.get(trackId);
            if (config != null) {
                config.isPlaying = false;
            }
        });
    }
    
    private void handleTimerTick() {
        if (timerConfig == null) return;
        
        long elapsedTime = System.currentTimeMillis() - timerStartTime;
        long remainingTime = timerConfig.duration - elapsedTime;
        
        if (remainingTime <= 0) {
            // 定时器结束
            handleTimerExpired();
        } else if (timerConfig.fadeOut && remainingTime <= timerConfig.fadeOutDuration) {
            // 开始淡出
            float fadeProgress = 1.0f - ((float)remainingTime / timerConfig.fadeOutDuration);
            float targetVolume = 1.0f - fadeProgress;
            
            // 应用淡出效果到所有音轨
            for (Map.Entry<String, TrackConfig> entry : trackConfigs.entrySet()) {
                String trackId = entry.getKey();
                TrackConfig config = entry.getValue();
                MediaPlayer player = players.get(trackId);
                
                if (player != null && config.isPlaying) {
                    float fadeVolume = config.volume * targetVolume * masterVolume;
                    player.setVolume(fadeVolume, fadeVolume);
                }
            }
        }
    }
    
    private void handleTimerExpired() {
        cancelTimer();
        
        // 停止播放
        stop(new Promise() {
            @Override
            public void resolve(Object value) {
                // 发送定时器结束事件
                sendEvent("onTimerExpired", null);
            }
            
            @Override
            public void reject(String code, String message) {
                Log.e(TAG, "Failed to stop playback on timer expired");
            }
            
            @Override
            public void reject(String code, String message, Throwable e) {
                Log.e(TAG, "Failed to stop playback on timer expired", e);
            }
            
            @Override
            public void reject(String code, Throwable e) {
                Log.e(TAG, "Failed to stop playback on timer expired", e);
            }
        });
    }
    
    private void cancelTimer() {
        if (timerRunnable != null) {
            timerHandler.removeCallbacks(timerRunnable);
            timerRunnable = null;
        }
        timerConfig = null;
        timerStartTime = 0;
    }
    
    private void sendEvent(String eventName, WritableMap params) {
        getReactApplicationContext()
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(eventName, params);
    }
    
    /**
     * 清理资源
     */
    @Override
    public void onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy();
        
        // 停止所有播放器并释放资源
        for (MediaPlayer player : players.values()) {
            if (player != null) {
                try {
                    if (player.isPlaying()) {
                        player.stop();
                    }
                    player.release();
                } catch (Exception e) {
                    Log.e(TAG, "Error releasing MediaPlayer", e);
                }
            }
        }
        
        players.clear();
        trackConfigs.clear();
        
        // 取消定时器
        cancelTimer();
        
        // 关闭线程池
        if (executorService != null) {
            executorService.shutdown();
        }
        
        Log.d(TAG, "AmbianceAudioEngine destroyed");
    }
} 