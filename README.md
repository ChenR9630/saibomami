# NEKO.SYNC 赛博养宠 Demo

根据《摄像头 AI 赛博养宠项目 成本 & 周期全方案》实现的基础体验版。

## 当前能力

- 浏览器摄像头授权与实时画面预览
- 摄像头设备枚举、选择、切换和断线检测
- 标准化摄像头错误码与连接状态
- 摄像头实时运动区域、质心、方向和强度检测
- 环境背景校准、最大运动主体提取和持续锁定
- 由真实运动数据驱动的数字宠物位置、朝向和动作
- 待机、轻微活动、行走和警觉状态映射
- 正面与左右视角切换
- 活跃度、动作计数、延迟和同步质量展示
- 响应式桌面与移动端界面
- 手机摄像头通过局域网 WebRTC 直连电脑
- 6 位配对码与内存临时信令
- 所有数据仅在浏览器本地运行

## 运行

需要 Node.js 18 或更高版本：

```bash
npm start
```

电脑打开 `http://localhost:8000`。

## 手机摄像头接入

1. 手机和电脑连接同一个 Wi-Fi。
2. 电脑页面点击“连接手机摄像头”。
3. 手机首次使用时，先打开配对窗口显示的 `http://电脑IP:8080`。
4. 下载并安装 NEKO.SYNC 本地 CA。
5. iPhone 还需在“设置 → 通用 → 关于本机 → 证书信任设置”中开启完全信任。
6. 手机打开配对窗口显示的 HTTPS 地址。
7. 允许摄像头权限并开始连接。

手机视频通过 WebRTC 直接发送给电脑。Node 服务只交换 SDP 和 ICE 信令，不转发或保存
视频。证书和私钥保存在本地 `.cert/`，已排除在 Git 版本控制之外。

## 桌面数字宠物

macOS 版桌面宠物是透明、始终置顶的原生窗口，可以拖到任意应用、显示器或桌面空间上。
它通过本地事件流订阅控制台中的动作状态，不受网页布局限制。

### macOS

首次构建原生透明悬浮窗：

```bash
npm run desktop:build
```

启动：

```bash
npm run desktop:open
```

也可以在 Finder 中双击：

```text
dist/NEKO.SYNC Desktop Pet.app
```

- 按住宠物任意位置拖动。
- 菜单栏 `NEKO` 菜单可调整小、中、大尺寸。

### Windows

Windows 版采用轻量原生协议壳 + Edge / Chrome 应用窗口运行完整 NEKO.SYNC 网页端，不需要额外安装 Electron。
首次运行会在当前用户注册 `neko-sync://` URL Protocol；之后网页端“桌面显示”会通过深链唤起本机客户端，并携带账号绑定 token 自动登录到同一账号。

启动：

```powershell
npm run desktop:open:win
```

也可以直接双击：

```text
scripts/start-desktop-windows.cmd
dist/NEKO.SYNC Windows Client/NEKO.SYNC Client.cmd
```

脚本会：

- 注册 `neko-sync://` 深链协议到当前 Windows 用户。
- 解析 `neko-sync://spawn?baseUrl=...&desktopToken=...`，并把账号绑定信息保存到 `%LOCALAPPDATA%\NEKO.SYNC\desktop-link.json`。
- 检查 `https://yutanggo.com/api/health` 或本地开发服务是否可用。
- 本地开发服务未运行时，自动用 `node server.js` 启动。
- 优先使用 Microsoft Edge，其次使用 Google Chrome，以 app 模式打开完整首页 `/?client=windows&desktopToken=...`。
- 启动失败时弹出错误，并把日志写入 `%LOCALAPPDATA%\NEKO.SYNC\windows-client.log`。

当前 Windows 版定位是完整网页客户端壳；透明悬浮窗、托盘菜单等更完整原生能力后续可升级为 Tauri / Electron 壳。

## AI 身份分身

先在项目根目录创建 `.env.local`：

```bash
TRIPO_API_KEY=your_tripo_api_key_here
TRIPO_STUDIO_URL=https://studio.tripo3d.com
TRIPO_API_BASE_URL=https://openapi.tripo3d.com/v3
TRIPO_MODEL_VERSION=v3.1-20260211

# Optional legacy texture fallback
IMAGE_PROVIDER=volcengine
ARK_API_KEY=your_ark_api_key_here
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_IMAGE_MODEL=doubao-seedream-5-0-260128
```

1. 启动控制台并点击“创建身份分身”。
2. 上传一张清晰的猫咪正面或侧面照片。
3. 点击“Tripo 生成并绑骨”并等待任务完成。

浏览器先将照片裁切并压缩为身份参考图。服务端依次执行 Tripo 的图生模型、可绑骨检查、
`quadruped` 四足绑骨和动作重定向任务。完成后下载基础骨骼 GLB，以及待机、四足行走和
跳跃动画 GLB。

网页优先使用 Three.js `AnimationMixer` 播放 Tripo 原生骨骼动画，并把绿光绑定到真实
Skeleton。只有模型不含骨骼时，才回退到本地七分件机械结构。

## Demo 边界

摄像头模式已使用真实画面主体数据驱动数字分身，演示模式使用合成数据。当前检测结合
背景建模和帧差，仍不能区分宠物、人或其他大型移动物体；尚未接入宠物语义关键点模型，
也未实现单目 2D 到 3D 姿态解算。数字分身契约见
[`DIGITAL_TWIN.md`](./DIGITAL_TWIN.md)。

## 摄像头协议

本地 USB / 内置摄像头已通过 `MediaDevices` 协议接入。IP 摄像头不允许浏览器
直接连接 RTSP，统一由边缘网关转成 WebRTC/WHEP；完整契约见
[`CAMERA_PROTOCOL.md`](./CAMERA_PROTOCOL.md)。
