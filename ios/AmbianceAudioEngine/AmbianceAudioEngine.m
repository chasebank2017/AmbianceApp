//
//  AmbianceAudioEngine.m
//  《静界》iOS 模块注册
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(AmbianceAudioEngine, NSObject)

// 初始化与生命周期
RCT_EXTERN_METHOD(initialize:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// 音轨管理
RCT_EXTERN_METHOD(addTrack:(NSString *)trackId
                  audioFile:(NSString *)audioFile
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// 音频控制
RCT_EXTERN_METHOD(setVolume:(NSString *)trackId
                  volume:(float)volume
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setPanning:(NSString *)trackId
                  pan:(float)pan
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// 播放控制
RCT_EXTERN_METHOD(play:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(pause:(RCTPromiseResolveBlock)resolve
                   rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// 定时器
RCT_EXTERN_METHOD(setTimer:(double)duration
                  fadeOut:(BOOL)fadeOut
                  fadeOutDuration:(double)fadeOutDuration
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// 场景管理
RCT_EXTERN_METHOD(saveScene:(NSString *)sceneName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

@interface RCT_EXTERN_MODULE(AmbianceAudioEngineBridge, RCTEventEmitter)

RCT_EXTERN_METHOD(supportedEvents)

@end 