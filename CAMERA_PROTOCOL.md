# NEKO.SYNC 摄像头接入协议 v0.1

## 目标

将不同来源的视频统一为浏览器可消费的实时视频轨道，并向姿态识别模块提供一致的帧输入。
协议只负责视频接入、设备状态和元数据，不负责宠物姿态推理。

## 支持矩阵

| 来源 | 设备侧协议 | 浏览器接入 | 用途 | 当前状态 |
| --- | --- | --- | --- | --- |
| 内置 / USB 摄像头 | UVC | MediaStream `getUserMedia` | 本机 Demo、桌面端 | 已实现 |
| 手机摄像头 | 浏览器摄像头 API | MediaStream `getUserMedia` | 移动端 Demo | 已实现 |
| 手机远程摄像头 | WebRTC + HTTPS 信令 | `RTCPeerConnection` | 手机拍摄、电脑显示 | 已实现 |
| IP 摄像头 | RTSP / ONVIF | 网关转 WebRTC/WHEP | 实时产品链路 | 协议已定义 |
| 网络视频回放 | HLS | `<video>` / MSE | 回放、低实时性预览 | 兼容路径 |

浏览器不直接支持 RTSP。IP 摄像头必须先经过边缘网关或媒体服务器转换。

## 统一 Source 描述

```json
{
  "id": "living-room-camera",
  "kind": "local-media",
  "label": "客厅摄像头",
  "transport": "mediastream",
  "video": {
    "width": 1280,
    "height": 720,
    "frameRate": 30
  }
}
```

`kind` 可取：

- `local-media`：浏览器本地摄像头。
- `webrtc`：网关输出的实时 WebRTC 视频。
- `hls`：HLS 回放或兼容预览。
- `demo`：本地模拟输入。

## 本地摄像头协议

实现位于 `camera-protocol.js`。

### 生命周期

1. `listDevices()`：枚举 `videoinput`。
2. `requestPermission()`：由用户操作触发权限请求。
3. `connect(options)`：按 `deviceId`、分辨率和帧率建立视频轨道。
4. `connected`：返回实际分辨率、帧率、设备名和协议。
5. `deviceschanged`：USB 插拔或系统设备变化。
6. `disconnected`：视频轨道终止或活动设备被移除。
7. `stop()`：关闭全部媒体轨道并释放摄像头。

### 错误码

| 错误码 | 含义 |
| --- | --- |
| `PERMISSION_DENIED` | 用户或系统拒绝摄像头权限 |
| `DEVICE_NOT_FOUND` | 未发现视频输入 |
| `DEVICE_BUSY` | 摄像头被其他应用占用 |
| `CONSTRAINT_UNSUPPORTED` | 分辨率、帧率或设备约束不支持 |
| `INSECURE_CONTEXT` | 页面不在 HTTPS 或 localhost |
| `DEVICE_ABORTED` | 启动过程被系统中断 |
| `NO_VIDEO_TRACK` | 返回的流中没有视频轨道 |
| `CAMERA_UNKNOWN` | 未归类错误 |

## IP 摄像头实时协议

推荐链路：

```text
IP Camera --RTSP/ONVIF--> Edge Gateway --WebRTC/WHEP--> Browser
                                      \--HTTPS JSON--> Camera Registry
```

### 网关职责

- 终止 RTSP，隐藏摄像头用户名和密码。
- 将 H.264/H.265 转为浏览器兼容的视频编码。
- 提供 WebRTC/WHEP 会话，目标端到端延迟小于 300ms。
- 暴露设备在线状态、分辨率、帧率和最近心跳。
- 限制访问令牌作用域和有效期。

浏览器端禁止直接保存或接收 RTSP 密码。

### 设备发现接口

```http
GET /api/v1/cameras
Authorization: Bearer <token>
```

```json
{
  "items": [
    {
      "id": "living-room-camera",
      "label": "客厅摄像头",
      "status": "online",
      "transport": "webrtc",
      "whepUrl": "/api/v1/cameras/living-room-camera/whep",
      "video": {
        "codec": "H264",
        "width": 1280,
        "height": 720,
        "frameRate": 30
      }
    }
  ]
}
```

### WHEP 建连

```http
POST /api/v1/cameras/{cameraId}/whep
Content-Type: application/sdp
Authorization: Bearer <short-lived-token>

<WebRTC SDP offer>
```

网关返回 `201 Created`、会话资源地址和 SDP answer。浏览器通过
`RTCPeerConnection` 接收视频轨道。断线后使用指数退避重连：
1 秒、2 秒、4 秒、8 秒，最多 30 秒。

## 帧输入契约

无论视频来源为何，姿态模块只接收：

```js
{
  sourceId: "living-room-camera",
  video: HTMLVideoElement,
  width: 1280,
  height: 720,
  timestamp: 1710000000000
}
```

推理层不得依赖 RTSP、WebRTC 或设备厂商品牌。视频传输与姿态推理解耦。

## 安全要求

- 生产环境只允许 HTTPS。
- 权限申请必须由用户点击触发。
- 摄像头凭证仅保存在网关，不能下发浏览器。
- 默认不录制原始视频；需要录制时必须单独授权并显示明确状态。
- WebRTC 访问令牌应短时有效，并限制到单个摄像头和只读视频权限。

## 手机远程摄像头协议

实现文件：

- `server.js`：局域网 HTTPS、证书引导和内存信令。
- `sender.html` / `sender.js`：手机视频发送端。
- `remote-camera.js`：电脑视频接收端。

### 配对流程

1. 电脑生成 6 位随机房间码。
2. 接收端创建 `recvonly` 视频 Offer 并发布到信令房间。
3. 手机获取后置摄像头轨道，读取 Offer 并返回 Answer。
4. 双方通过信令接口交换 ICE Candidate。
5. WebRTC 建连后，手机视频轨道直接进入电脑 `<video>`。
6. `MotionTwinEngine` 将该视频作为普通输入源处理。

信令消息只保留 5 分钟，服务重启后全部清空。
